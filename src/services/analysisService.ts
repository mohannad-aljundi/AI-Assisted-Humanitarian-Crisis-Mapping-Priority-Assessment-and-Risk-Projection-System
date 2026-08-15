import type { NeedSeverity } from "@prisma/client";
import { buildNlpView, buildNlpViewReadOnly } from "@/lib/analysisView";
import { normalizeArticleUrl } from "@/lib/articleDeduplication";
import { encodeLocationMeta } from "@/lib/locationConfidence";
import { locationExtractionPipeline } from "@/lib/locationExtractionPipeline";
import { getSafeCoordinates, hasSafeCoordinates, hasValidCoordinates } from "@/lib/coordinates";
import { shouldRejectLocationCandidate } from "@/lib/locationBlacklist";
import {
  isPendingLocationName,
  resolveSafeCoordinates,
} from "@/lib/safeCoordinateResolver";
import { prisma } from "@/lib/prisma";
import { crisisLocationRepository } from "@/repositories/crisisLocationRepository";
import { crisisRepository } from "@/repositories/crisisRepository";
import {
  extractedEntityRepository,
  type ExtractedEntityInput,
} from "@/repositories/extractedEntityRepository";
import { humanitarianNeedRepository } from "@/repositories/humanitarianNeedRepository";
import { locationRepository } from "@/repositories/locationRepository";
import { priorityAssessmentRepository } from "@/repositories/priorityAssessmentRepository";
import { reliabilityAssessmentRepository } from "@/repositories/reliabilityAssessmentRepository";
import { reportRepository } from "@/repositories/reportRepository";
import { riskRepository } from "@/repositories/riskRepository";
import { sourceRepository } from "@/repositories/sourceRepository";
import { userActivityRepository } from "@/repositories/userActivityRepository";
import { getAiModelName } from "@/services/aiAnalysisService";
import { unifiedReportAnalysisService } from "@/services/unifiedReportAnalysisService";
import type { UnifiedReportAnalysisResult } from "@/services/unifiedReportAnalysisService";
import { aiReasoningService } from "@/services/aiReasoningService";
import { alertService } from "@/services/alertService";
import { incidentCorrelationService } from "@/services/incidentCorrelationService";
import { deriveIncidentLabelFallback } from "@/services/incidentLabelService";
import { crisisRegionService } from "@/services/crisisRegionService";
import { entityExtractionService } from "@/services/entityExtractionService";
import type { ExtractedIntelligenceEntity } from "@/services/entityExtractionService";
import {
  buildContentFingerprint,
  incidentDeduplicationService,
} from "@/services/incidentDeduplicationService";
import { intelligenceAssessor } from "@/services/intelligenceAssessor";
import { priorityGuardrailEngine } from "@/services/priorityGuardrailEngine";
import { intelligenceFusionService } from "@/services/intelligenceFusionService";
import {
  buildLocationReasoningFromResolution,
  crossSourceIntelligenceService,
} from "@/services/crossSourceIntelligenceService";
import {
  extendedNlpService,
} from "@/services/explanationService";
import { multiSourceVerificationService } from "@/services/multiSourceVerificationService";
import { humanitarianNeedInferenceEngine } from "@/services/humanitarianNeedInferenceEngine";
import { ensureHumanitarianNeeds, normaliseNeedName } from "@/lib/humanitarianNeedTaxonomy";
import type { HumanitarianReasoningContext } from "@/lib/humanitarianAnalystReasoning";
import { continuousHumanitarianLearningEngine } from "@/services/continuousHumanitarianLearningEngine";
import { disasterSeverityService } from "@/services/disasterSeverityService";
import { nlpService } from "@/services/nlpService";
import { locationValidationService } from "@/services/locationValidationService";
import { timelineService } from "@/services/timelineService";
import {
  incidentSplittingService,
  type SplitIncidentDraft,
} from "@/services/incidentSplittingService";
import {
  mapInsightFromDb,
  reportInsightRepository,
} from "@/repositories/reportInsightRepository";
import type {
  AiAnalysisResult,
  AiIncidentResult,
  ExtendedAnalysisInsight,
  ExtractedIntelligenceEntityView,
  ExtractedLocation,
  NLPAnalysisResult,
  PersistedAnalysisView,
  PriorityAssessmentPipelineResult,
  PriorityResult,
  ReportInput,
  ReliabilityResult,
  RiskProjectionResult,
  SavedReportAnalysisResponse,
  IntelligenceReasoningBundle,
} from "@/types";
import { localHumanitarianReasoningEngine } from "@/services/localHumanitarianReasoningEngine";
import { assertWritePathAllowed } from "@/lib/readOnlyGuard";
import { INTELLIGENCE_PIPELINE_VERSION } from "@/lib/explainabilityPresentation";
import {
  aiRiskProjectionService,
  mergeAnalyticalIntoRiskProjection,
  toRiskProjectionOutput,
  trajectoryToRiskTrend,
} from "@/services/aiRiskProjectionService";
import type { AnalyticalRiskProjection } from "@/types";

const DEFAULT_SOURCE_NAME = "Unspecified Source";

interface AnalysisBundle {
  nlp: NLPAnalysisResult;
  reliability: ReliabilityResult;
  priority: PriorityResult;
  riskProjection: RiskProjectionResult;
  recommendedActions: string[];
  insight: ExtendedAnalysisInsight;
  intelligenceEntities: ExtractedIntelligenceEntity[];
  reasoningBundle: IntelligenceReasoningBundle | null;
  locationReasoning?: import("@/types").LocationReasoning | null;
  incidentLabel?: string;
}


interface PersistReportMeta {
  segmentIndex?: number;
  segmentCountry?: string;
  articleUrl?: string;
  externalArticleId?: string;
  existingReportId?: string;
}

export class AnalysisService {
  /**
   * Remove prior 1:1 analysis rows so a re-run of persistAnalysisBundle can
   * recreate them without unique-relation violations.
   */
  private async clearReportAnalysisArtifacts(
    reportId: string,
    tx: import("@/lib/prismaTransaction").PrismaTransactionClient
  ): Promise<void> {
    await tx.reliabilityAssessment.deleteMany({ where: { reportId } });
    await tx.priorityAssessment.deleteMany({ where: { reportId } });
    await tx.reportInsight.deleteMany({ where: { reportId } });
    await tx.extractedEntity.deleteMany({ where: { reportId } });

    const existingCrisis = await tx.crisis.findUnique({
      where: { reportId },
      select: { id: true },
    });
    if (existingCrisis) {
      await tx.crisis.delete({ where: { id: existingCrisis.id } });
    }
  }

  private resolveIncidentLabelForPersist(
    input: ReportInput,
    nlp: NLPAnalysisResult,
    priorityLevel: import("@prisma/client").PriorityLevel,
    segmentCountry?: string | null
  ): string {
    return deriveIncidentLabelFallback({
      headline: input.title,
      content: input.content,
      crisisType: nlp.crisisType,
      location: nlp.locations[0]?.name ?? null,
      country: segmentCountry ?? null,
      humanitarianNeeds: nlp.humanitarianNeeds.map((need) => need.needType),
      priorityLevel,
    });
  }

  async analyseImportedReport(
    reportId: string,
    options?: { skipPostProcessing?: boolean }
  ): Promise<SavedReportAnalysisResponse> {
    assertWritePathAllowed("analysisService", "analyseImportedReport");

    const report = await reportRepository.findById(reportId);
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    const input: ReportInput = {
      title: report.title,
      content: report.content,
      reportDate: report.reportDate.toISOString(),
      articleUrl: report.articleUrl ?? undefined,
      externalArticleId: report.externalArticleId ?? undefined,
      source: {
        name: report.source.name,
        type: report.source.type,
        credibilityScore: report.source.credibilityScore,
        url: report.source.url ?? undefined,
      },
    };

    const reportDate = report.reportDate;
    const unified = await unifiedReportAnalysisService.analyse(input.title, input.content);
    const fullAi = unified?.analysis ?? null;
    const drafts =
      fullAi?.incidents && fullAi.incidents.length > 0
        ? this.buildDraftsFromAi(fullAi)
        : incidentSplittingService.splitArticle(input.title, input.content);

    const draft = drafts[0]!;
    const segmentInput: ReportInput = {
      ...input,
      content: draft.segmentContent,
    };

    const bundle = unified
      ? await this.mapUnifiedAnalysisToBundle(segmentInput, reportDate, unified, draft)
      : await this.runRuleBasedAnalysis(segmentInput, reportDate, draft, undefined, {
          deterministicOnly: true,
        });

    const saved = await this.persistAnalysisBundle(segmentInput, reportDate, bundle, {
      segmentIndex: report.segmentIndex ?? 0,
      segmentCountry: report.segmentCountry ?? draft.country,
      articleUrl: input.articleUrl,
      externalArticleId: input.externalArticleId,
      existingReportId: reportId,
    });

    if (!options?.skipPostProcessing) {
      try {
        const verification = await multiSourceVerificationService.verifyAfterReport(
          saved.reportId
        );
        await this.applyPostVerificationReasoning(saved.reportId, verification);
        await intelligenceFusionService.applyVerificationBoost(saved.reportId, verification);
        await intelligenceFusionService.applyContradictionPenalty(saved.reportId, verification);
        await alertService.generateForReport(saved.reportId, verification);
        await incidentCorrelationService.correlateReport(saved.reportId);
      } catch {
        // Keep verification, alerts, and correlation outside the critical save path.
      }
    }

    return saved;
  }

  async analyseAndPersist(input: ReportInput): Promise<SavedReportAnalysisResponse> {
    assertWritePathAllowed("analysisService", "analyseAndPersist");
    const reportDate = new Date(input.reportDate);
    const unified = await unifiedReportAnalysisService.analyse(input.title, input.content);
    const fullAi = unified?.analysis ?? null;
    const drafts =
      fullAi?.incidents && fullAi.incidents.length > 0
        ? this.buildDraftsFromAi(fullAi)
        : incidentSplittingService.splitArticle(input.title, input.content);

    if (!incidentSplittingService.shouldSplit(drafts)) {
      const draft = drafts[0]!;
      const segmentInput: ReportInput = {
        ...input,
        content: draft.segmentContent,
      };
      const bundle = unified
        ? await this.mapUnifiedAnalysisToBundle(segmentInput, reportDate, unified, draft)
        : await this.runRuleBasedAnalysis(segmentInput, reportDate, draft, undefined, {
            deterministicOnly: true,
          });
      const saved = await this.persistAnalysisBundle(
        segmentInput,
        reportDate,
        bundle,
        {
          segmentIndex: 0,
          segmentCountry: draft.country,
          articleUrl: input.articleUrl,
          externalArticleId: input.externalArticleId,
        }
      );

      try {
        const verification = await multiSourceVerificationService.verifyAfterReport(
          saved.reportId
        );
        await this.applyPostVerificationReasoning(saved.reportId, verification);
        await intelligenceFusionService.applyVerificationBoost(saved.reportId, verification);
        await intelligenceFusionService.applyContradictionPenalty(saved.reportId, verification);
        await alertService.generateForReport(saved.reportId, verification);
        await incidentCorrelationService.correlateReport(saved.reportId);
      } catch {
        // Keep verification, alerts, and correlation outside the critical save path.
      }

      return {
        ...saved,
        incidentsCreated: 1,
        incidentReportIds: [saved.reportId],
      };
    }

    const incidentReportIds: string[] = [];
    let primary: SavedReportAnalysisResponse | null = null;

    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index]!;
      const aiIncident = fullAi?.incidents?.[index] ?? null;
      const segmentInput: ReportInput = {
        ...input,
        title: `${input.title} — ${draft.segmentTitleSuffix}`,
        content: draft.segmentContent,
      };

      const bundle =
        aiIncident && unified
          ? await this.mapUnifiedIncidentToBundle(
              segmentInput,
              reportDate,
              unified,
              aiIncident,
              draft
            )
          : unified
            ? await this.mapUnifiedAnalysisToBundle(segmentInput, reportDate, unified, draft)
            : await this.runRuleBasedAnalysis(segmentInput, reportDate, draft, undefined, {
                deterministicOnly: true,
              });

      const saved = await this.persistAnalysisBundle(
        segmentInput,
        reportDate,
        bundle,
        {
          segmentIndex: index,
          segmentCountry: draft.country,
          articleUrl: input.articleUrl,
          externalArticleId: input.externalArticleId,
        }
      );

      incidentReportIds.push(saved.reportId);
      if (!primary) primary = saved;

      try {
        const verification = await multiSourceVerificationService.verifyAfterReport(
          saved.reportId
        );
        await this.applyPostVerificationReasoning(saved.reportId, verification);
        await intelligenceFusionService.applyVerificationBoost(saved.reportId, verification);
        await intelligenceFusionService.applyContradictionPenalty(saved.reportId, verification);
        await alertService.generateForReport(saved.reportId, verification);
        await incidentCorrelationService.correlateReport(saved.reportId);
      } catch {
        // Non-blocking per-incident verification.
      }
    }

    return {
      ...primary!,
      incidentsCreated: incidentReportIds.length,
      incidentReportIds,
    };
  }

  private buildDraftsFromAi(ai: AiAnalysisResult): SplitIncidentDraft[] {
    return (ai.incidents ?? []).map((incident) => ({
      draftId: `${incident.country}-${incident.city ?? incident.region ?? "country"}`,
      country: incident.country,
      city: incident.city ?? null,
      region: incident.region ?? null,
      locationLabel: incident.city
        ? `${incident.city}, ${incident.country}`
        : incident.country,
      segmentTitleSuffix: incident.city
        ? `${incident.city}, ${incident.country}`
        : incident.country,
      segmentContent: incident.segmentSummary,
      geographicKeys: [],
    }));
  }

  private async fetchReasoningBundle(
    input: ReportInput
  ): Promise<IntelligenceReasoningBundle | null> {
    return aiReasoningService.generateFinalReasoning(
      input.title,
      input.content,
      input.source?.name
    );
  }

  private async runRuleBasedAnalysis(
    input: ReportInput,
    reportDate: Date,
    draft?: SplitIncidentDraft,
    reportId?: string,
    options?: { deterministicOnly?: boolean }
  ): Promise<AnalysisBundle> {
    const reasoningBundle = options?.deterministicOnly
      ? null
      : await this.fetchReasoningBundle(input);
    const rawNlp = nlpService.analyse(input.content);
    const pipelineLocation = await locationExtractionPipeline.resolve({
      title: input.title,
      content: input.content,
      sourceName: input.source?.name ?? "Manual",
      storedLocations: draft
        ? [
            {
              name: draft.locationLabel,
              latitude: null,
              longitude: null,
            },
            ...rawNlp.locations,
          ]
        : rawNlp.locations,
    });

    const pipelineCandidates =
      pipelineLocation.verified && pipelineLocation.displayName
        ? [
            {
              name: pipelineLocation.displayName,
              latitude: pipelineLocation.latitude,
              longitude: pipelineLocation.longitude,
            },
          ]
        : rawNlp.locations;

    const validatedLocations = await locationValidationService.validateLocations(
      pipelineCandidates
    );
    const nlp: NLPAnalysisResult = {
      ...rawNlp,
      locations: (draft ? validatedLocations.slice(0, 1) : validatedLocations).map(
        (loc) => ({
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          confidence: loc.confidence,
          validationStatus: loc.validationStatus,
        })
      ),
    };
    const sourceCredibility = input.source?.credibilityScore;

    const priorityPipeline = await this.assessPriorityPipeline(
      input,
      nlp,
      sourceCredibility,
      reportId,
      undefined,
      options?.deterministicOnly
    );

    const intelligence = intelligenceAssessor.assess(
      {
        title: input.title,
        content: input.content,
        reportDate,
        sourceName: input.source?.name,
        sourceCredibility,
        priorityPipeline,
        reasoningBundle,
      },
      nlp
    );

    const ruleEntities = entityExtractionService.extractFromText(
      input.content,
      draft?.country
    );
    const intelligenceEntities = await entityExtractionService.geocodeEntities(
      ruleEntities,
      draft?.country
    );

    nlp.entities = intelligenceEntities.map((entity) => ({
      entityType: entity.entityType,
      entitySubtype: entity.entitySubtype,
      value: entity.value,
      latitude: entity.latitude,
      longitude: entity.longitude,
    }));

    const humanitarianReasoning = options?.deterministicOnly
      ? this.applyDeterministicHumanitarianNeeds(input, nlp)
      : await this.enrichHumanitarianNeeds(input, nlp, reportId);

    const { riskProjection: enhancedRisk, analytical } = options?.deterministicOnly
      ? {
          riskProjection: intelligence.riskProjection,
          analytical: null as AnalyticalRiskProjection | null,
        }
      : await this.enhanceAnalyticalRisk(
          input,
          nlp,
          intelligence,
          humanitarianReasoning,
          reasoningBundle,
          reportId
        );

    const disasterSeverity = options?.deterministicOnly
      ? null
      : await this.assessDisasterSeverity(
          input,
          nlp,
          intelligence,
          reasoningBundle
        );

    const recommendedActions = this.generateRecommendedActions(
      nlp,
      intelligence.priority,
      enhancedRisk
    );

    const insight = this.buildInsight(
      input,
      reportDate,
      nlp,
      intelligence,
      null,
      intelligence.priority,
      enhancedRisk,
      reasoningBundle,
      null,
      null,
      disasterSeverity,
      humanitarianReasoning,
      analytical
    );

    return {
      nlp,
      reliability: intelligence.reliability,
      priority: intelligence.priority,
      riskProjection: enhancedRisk,
      recommendedActions,
      insight,
      intelligenceEntities,
      reasoningBundle,
    };
  }

  private buildInsight(
    input: ReportInput,
    reportDate: Date,
    nlp: NLPAnalysisResult,
    intelligence: ReturnType<typeof intelligenceAssessor.assess>,
    ai?: AiAnalysisResult | null,
    priority?: PriorityResult,
    risk?: RiskProjectionResult,
    reasoningBundle?: IntelligenceReasoningBundle | null,
    locationReasoning?: import("@/types").LocationReasoning | null,
    crossSourceAnalysis?: import("@/types").CrossSourceAnalysis | null,
    disasterSeverity?: import("@/types").DisasterSeverityAssessment | null,
    humanitarianReasoning?: HumanitarianReasoningContext | null,
    analytical?: AnalyticalRiskProjection | null
  ): ExtendedAnalysisInsight {
    const extended = extendedNlpService.analyseExtended(input.content, nlp);
    const horizons = risk?.horizons ?? [];
    const bundle = reasoningBundle ?? intelligence.reasoningBundle;
    const crossSource =
      crossSourceAnalysis ??
      crossSourceIntelligenceService.analyze({
        primarySourceName: input.source?.name ?? "Unspecified Source",
        primaryReliability: intelligence.reliability.finalScore,
        verification: null,
      });

    return {
      ...extended,
      priorityExplanation: intelligence.priorityExplanation,
      riskExplanation: intelligence.riskExplanation,
      reliabilityExplanation: intelligence.reliabilityExplanation,
      situationSummary:
        humanitarianReasoning?.analystSummary ??
        bundle?.finalReasoning?.conclusion ??
        intelligence.situationSummary,
      crisisExplanation:
        humanitarianReasoning?.analystSummary ?? intelligence.crisisExplanation,
      extractionMethod: intelligence.extractionMethod,
      aiModel:
        ai || intelligence.aiPriorityAssessment || bundle ? getAiModelName() : null,
      confidenceLevel: intelligence.confidenceLevel,
      evidence: this.collectDecisionEvidence(bundle, intelligence.evidence),
      confidenceBreakdown: intelligence.confidenceBreakdown,
      reasoningChain: intelligence.reasoningChain,
      priorityBreakdown: priority?.breakdown ?? intelligence.priority.breakdown,
      riskBreakdown: risk?.breakdown,
      reliabilityBreakdown: intelligence.reliability.breakdown,
      aiPriorityAssessment: intelligence.aiPriorityAssessment,
      guardrailAdjustment: intelligence.guardrailAdjustment,
      finalReasoning: bundle?.finalReasoning ?? null,
      priorityReasoning: bundle?.priorityReasoning ?? null,
      reliabilityReasoning: bundle?.reliabilityReasoning ?? null,
      riskReasoning: bundle?.riskReasoning ?? null,
      knownFacts: bundle?.knownFacts ?? [],
      unknownFacts: bundle?.unknownFacts ?? [],
      crossSourceAnalysis: crossSource,
      locationReasoning: locationReasoning ?? null,
      pipelineVersion: INTELLIGENCE_PIPELINE_VERSION,
      disasterSeverity: disasterSeverity ?? null,
      humanitarianReasoning: humanitarianReasoning ?? null,
      assessmentMethod: intelligence.assessmentMethod,
      assessmentFallbackReason: intelligence.assessmentFallbackReason,
      analyticalRiskProjection: analytical ?? null,
      riskProjections: horizons.length >= 4
        ? {
            current: horizons[0]!.score,
            forecast24h: horizons[1]!.score,
            forecast72h: horizons[2]!.score,
            forecast7d: horizons[3]!.score,
            trend: analytical
              ? trajectoryToRiskTrend(analytical.trend)
              : risk?.trend ?? "Stable",
          }
        : undefined,
    };
  }

  private async enhanceAnalyticalRisk(
    input: ReportInput,
    nlp: NLPAnalysisResult,
    intelligence: ReturnType<typeof intelligenceAssessor.assess>,
    humanitarianReasoning: HumanitarianReasoningContext | null | undefined,
    reasoningBundle: IntelligenceReasoningBundle | null,
    reportId?: string
  ): Promise<{
    riskProjection: RiskProjectionResult;
    analytical: AnalyticalRiskProjection;
  }> {
    return aiRiskProjectionService.enhance({
      reportId,
      title: input.title,
      content: input.content,
      nlp,
      priority: intelligence.priority,
      reliability: intelligence.reliability,
      baseRisk: intelligence.riskProjection,
      humanitarianReasoning,
      reasoningBundle,
    });
  }

  private collectDecisionEvidence(
    bundle: IntelligenceReasoningBundle | null | undefined,
    fallback: string[]
  ): string[] {
    if (!bundle?.finalReasoning) return fallback;
    const items = new Set<string>();
    for (const e of bundle.finalReasoning.evidenceIncreasing) items.add(e);
    for (const e of bundle.finalReasoning.evidenceDecreasing) items.add(e);
    for (const e of bundle.priorityReasoning?.evidenceQuotes ?? []) items.add(e);
    for (const e of fallback) items.add(e);
    return [...items].slice(0, 20);
  }

  private applyDeterministicHumanitarianNeeds(
    input: ReportInput,
    nlp: NLPAnalysisResult
  ): HumanitarianReasoningContext {
    nlp.humanitarianNeeds = ensureHumanitarianNeeds({
      needs: nlp.humanitarianNeeds,
      title: input.title,
      content: input.content,
      crisisType: nlp.crisisType,
      allowLastResortPackage: false,
    });
    return {
      reportPurpose: "Situation Update",
      crisisPhase: "Response",
      describesActiveSuffering: true,
      describesPreventiveOrFutureAction: false,
      allowsEmergencyNeedInference: false,
      analystSummary: input.content.slice(0, 280),
      usedLastResortPackage: false,
    };
  }

  private async mapUnifiedAnalysisToBundle(
    input: ReportInput,
    reportDate: Date,
    unified: UnifiedReportAnalysisResult,
    draft?: SplitIncidentDraft,
    reportId?: string
  ): Promise<AnalysisBundle> {
    const ai = unified.analysis;
    const reasoningBundle = unified.reasoning;

    const scopedLocations = draft
      ? ai.locations.filter(
          (location) =>
            location.country.toLowerCase() === draft.country.toLowerCase() ||
            location.name.toLowerCase().includes(draft.country.toLowerCase())
        )
      : ai.locations;

    const candidateLocations = (scopedLocations.length > 0
      ? scopedLocations
      : draft
        ? [{ name: draft.city ?? draft.country, country: draft.country }]
        : ai.locations
    ).map((location) => ({
      name: location.country
        ? `${location.name}, ${location.country}`
        : location.name,
      latitude: null,
      longitude: null,
    }));
    const validatedLocations = await locationValidationService.validateLocations(
      candidateLocations
    );

    const nlp: NLPAnalysisResult = {
      locations: validatedLocations.slice(0, 1).map((loc) => ({
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        confidence: loc.confidence,
        validationStatus: loc.validationStatus,
      })),
      crisisType: ai.crisisType,
      humanitarianNeeds: this.mapHumanitarianNeeds(ai),
      affectedPopulation: ai.affectedPopulation,
    };

    const priorityPipeline = await this.assessPriorityPipeline(
      input,
      nlp,
      input.source?.credibilityScore,
      reportId,
      unified.priority
    );

    const intelligence = intelligenceAssessor.assess(
      {
        title: input.title,
        content: input.content,
        reportDate,
        sourceName: input.source?.name,
        sourceCredibility: input.source?.credibilityScore,
        ai,
        priorityPipeline,
        reasoningBundle,
      },
      nlp
    );

    const ruleEntities = entityExtractionService.extractFromText(
      input.content,
      draft?.country
    );
    const intelligenceEntities = await entityExtractionService.geocodeEntities(
      entityExtractionService.mergeAiEntities(ai.entities ?? [], ruleEntities),
      draft?.country
    );
    nlp.entities = intelligenceEntities.map((entity) => ({
      entityType: entity.entityType,
      entitySubtype: entity.entitySubtype,
      value: entity.value,
      latitude: entity.latitude,
      longitude: entity.longitude,
    }));

    nlp.humanitarianNeeds = ensureHumanitarianNeeds({
      needs: nlp.humanitarianNeeds,
      title: input.title,
      content: input.content,
      crisisType: nlp.crisisType,
      reasoningContext: unified.humanitarianReasoning,
      allowLastResortPackage: false,
    });

    const enhancedRisk = mergeAnalyticalIntoRiskProjection(
      toRiskProjectionOutput(intelligence.riskProjection),
      unified.riskProjection
    );

    const recommendedActions =
      ai.recommendedActions.length > 0
        ? [...new Set(ai.recommendedActions)]
        : this.generateRecommendedActions(nlp, intelligence.priority, enhancedRisk);

    const insight = this.buildInsight(
      input,
      reportDate,
      nlp,
      intelligence,
      ai,
      intelligence.priority,
      enhancedRisk,
      reasoningBundle,
      null,
      null,
      unified.disasterSeverity,
      unified.humanitarianReasoning,
      unified.riskProjection
    );
    insight.evidence = [
      ...new Set([...unified.evidence, ...(insight.evidence ?? [])]),
    ].slice(0, 20);

    return {
      nlp,
      reliability: intelligence.reliability,
      priority: intelligence.priority,
      riskProjection: enhancedRisk,
      recommendedActions,
      insight,
      intelligenceEntities,
      reasoningBundle,
      incidentLabel: unified.incidentLabel,
    };
  }

  private async mapUnifiedIncidentToBundle(
    input: ReportInput,
    reportDate: Date,
    unified: UnifiedReportAnalysisResult,
    incident: AiIncidentResult,
    draft: SplitIncidentDraft,
    reportId?: string
  ): Promise<AnalysisBundle> {
    const reasoningBundle = unified.reasoning;
    const candidateLocations = [
      {
        name: incident.city
          ? `${incident.city}, ${incident.country}`
          : draft.locationLabel,
        latitude: null,
        longitude: null,
      },
    ];
    const validatedLocations = await locationValidationService.validateLocations(
      candidateLocations
    );

    const nlp: NLPAnalysisResult = {
      locations: validatedLocations.slice(0, 1).map((loc) => ({
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        confidence: loc.confidence,
        validationStatus: loc.validationStatus,
      })),
      crisisType: incident.crisisType,
      humanitarianNeeds: this.mapHumanitarianNeeds(incident),
      affectedPopulation: incident.affectedPopulation,
    };

    const priorityPipeline = await this.assessPriorityPipeline(
      input,
      nlp,
      input.source?.credibilityScore,
      reportId,
      unified.priority
    );

    const intelligence = intelligenceAssessor.assess(
      {
        title: input.title,
        content: input.content,
        reportDate,
        sourceName: input.source?.name,
        sourceCredibility: input.source?.credibilityScore,
        aiIncident: incident,
        priorityPipeline,
        reasoningBundle,
      },
      nlp
    );

    const ruleEntities = entityExtractionService.extractFromText(
      input.content,
      draft.country
    );
    const intelligenceEntities = await entityExtractionService.geocodeEntities(
      entityExtractionService.mergeAiEntities(incident.entities ?? [], ruleEntities),
      draft.country
    );
    nlp.entities = intelligenceEntities.map((entity) => ({
      entityType: entity.entityType,
      entitySubtype: entity.entitySubtype,
      value: entity.value,
      latitude: entity.latitude,
      longitude: entity.longitude,
    }));

    nlp.humanitarianNeeds = ensureHumanitarianNeeds({
      needs: nlp.humanitarianNeeds,
      title: input.title,
      content: input.content,
      crisisType: nlp.crisisType,
      reasoningContext: unified.humanitarianReasoning,
      allowLastResortPackage: false,
    });

    const enhancedRisk = mergeAnalyticalIntoRiskProjection(
      toRiskProjectionOutput(intelligence.riskProjection),
      unified.riskProjection
    );

    const recommendedActions = this.generateRecommendedActions(
      nlp,
      intelligence.priority,
      enhancedRisk
    );

    const insight = this.buildInsight(
      input,
      reportDate,
      nlp,
      intelligence,
      null,
      intelligence.priority,
      enhancedRisk,
      reasoningBundle,
      null,
      null,
      unified.disasterSeverity,
      unified.humanitarianReasoning,
      unified.riskProjection
    );
    insight.evidence = [
      ...new Set([...unified.evidence, ...(insight.evidence ?? [])]),
    ].slice(0, 20);

    return {
      nlp,
      reliability: intelligence.reliability,
      priority: intelligence.priority,
      riskProjection: enhancedRisk,
      recommendedActions,
      insight,
      intelligenceEntities,
      reasoningBundle,
      incidentLabel: unified.incidentLabel,
    };
  }

  private async mapAiAnalysisToBundle(
    input: ReportInput,
    reportDate: Date,
    ai: AiAnalysisResult,
    draft?: SplitIncidentDraft,
    reportId?: string
  ): Promise<AnalysisBundle> {
    const reasoningBundle = await this.fetchReasoningBundle(input);
    const scopedLocations = draft
      ? ai.locations.filter(
          (location) =>
            location.country.toLowerCase() === draft.country.toLowerCase() ||
            location.name.toLowerCase().includes(draft.country.toLowerCase())
        )
      : ai.locations;

    const candidateLocations = (scopedLocations.length > 0
      ? scopedLocations
      : draft
        ? [{ name: draft.city ?? draft.country, country: draft.country }]
        : ai.locations
    ).map((location) => ({
      name: location.country
        ? `${location.name}, ${location.country}`
        : location.name,
      latitude: null,
      longitude: null,
    }));
    const validatedLocations = await locationValidationService.validateLocations(
      candidateLocations
    );

    const nlp: NLPAnalysisResult = {
      locations: validatedLocations.slice(0, 1).map((loc) => ({
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        confidence: loc.confidence,
        validationStatus: loc.validationStatus,
      })),
      crisisType: ai.crisisType,
      humanitarianNeeds: this.mapHumanitarianNeeds(ai),
      affectedPopulation: ai.affectedPopulation,
    };

    const priorityPipeline = await this.assessPriorityPipeline(
      input,
      nlp,
      input.source?.credibilityScore
    );

    const intelligence = intelligenceAssessor.assess(
      {
        title: input.title,
        content: input.content,
        reportDate,
        sourceName: input.source?.name,
        sourceCredibility: input.source?.credibilityScore,
        ai,
        priorityPipeline,
        reasoningBundle,
      },
      nlp
    );

    const ruleEntities = entityExtractionService.extractFromText(
      input.content,
      draft?.country
    );
    const intelligenceEntities = await entityExtractionService.geocodeEntities(
      entityExtractionService.mergeAiEntities(ai.entities ?? [], ruleEntities),
      draft?.country
    );
    nlp.entities = intelligenceEntities.map((entity) => ({
      entityType: entity.entityType,
      entitySubtype: entity.entitySubtype,
      value: entity.value,
      latitude: entity.latitude,
      longitude: entity.longitude,
    }));

    const humanitarianReasoning = await this.enrichHumanitarianNeeds(input, nlp, reportId);

    const { riskProjection: enhancedRisk, analytical } =
      await this.enhanceAnalyticalRisk(
        input,
        nlp,
        intelligence,
        humanitarianReasoning,
        reasoningBundle,
        reportId
      );

    const disasterSeverity = await this.assessDisasterSeverity(
      input,
      nlp,
      intelligence,
      reasoningBundle
    );

    const recommendedActions =
      ai.recommendedActions.length > 0
        ? [...new Set(ai.recommendedActions)]
        : this.generateRecommendedActions(
            nlp,
            intelligence.priority,
            enhancedRisk
          );

    const insight = this.buildInsight(
      input,
      reportDate,
      nlp,
      intelligence,
      ai,
      intelligence.priority,
      enhancedRisk,
      reasoningBundle,
      null,
      null,
      disasterSeverity,
      humanitarianReasoning,
      analytical
    );

    return {
      nlp,
      reliability: intelligence.reliability,
      priority: intelligence.priority,
      riskProjection: enhancedRisk,
      recommendedActions,
      insight,
      intelligenceEntities,
      reasoningBundle,
    };
  }

  private async mapAiIncidentToBundle(
    input: ReportInput,
    reportDate: Date,
    incident: AiIncidentResult,
    draft: SplitIncidentDraft,
    reportId?: string
  ): Promise<AnalysisBundle> {
    const reasoningBundle = await this.fetchReasoningBundle(input);
    const candidateLocations = [
      {
        name: incident.city
          ? `${incident.city}, ${incident.country}`
          : draft.locationLabel,
        latitude: null,
        longitude: null,
      },
    ];
    const validatedLocations = await locationValidationService.validateLocations(
      candidateLocations
    );

    const nlp: NLPAnalysisResult = {
      locations: validatedLocations.slice(0, 1).map((loc) => ({
        name: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        confidence: loc.confidence,
        validationStatus: loc.validationStatus,
      })),
      crisisType: incident.crisisType,
      humanitarianNeeds: this.mapHumanitarianNeeds(incident),
      affectedPopulation: incident.affectedPopulation,
    };

    const priorityPipeline = await this.assessPriorityPipeline(
      input,
      nlp,
      input.source?.credibilityScore
    );

    const intelligence = intelligenceAssessor.assess(
      {
        title: input.title,
        content: input.content,
        reportDate,
        sourceName: input.source?.name,
        sourceCredibility: input.source?.credibilityScore,
        aiIncident: incident,
        priorityPipeline,
        reasoningBundle,
      },
      nlp
    );

    const ruleEntities = entityExtractionService.extractFromText(
      input.content,
      draft.country
    );
    const intelligenceEntities = await entityExtractionService.geocodeEntities(
      entityExtractionService.mergeAiEntities(incident.entities ?? [], ruleEntities),
      draft.country
    );
    nlp.entities = intelligenceEntities.map((entity) => ({
      entityType: entity.entityType,
      entitySubtype: entity.entitySubtype,
      value: entity.value,
      latitude: entity.latitude,
      longitude: entity.longitude,
    }));

    const humanitarianReasoning = await this.enrichHumanitarianNeeds(input, nlp, reportId);

    const { riskProjection: enhancedRisk, analytical } =
      await this.enhanceAnalyticalRisk(
        input,
        nlp,
        intelligence,
        humanitarianReasoning,
        reasoningBundle,
        reportId
      );

    const disasterSeverity = await this.assessDisasterSeverity(
      input,
      nlp,
      intelligence,
      reasoningBundle
    );

    const recommendedActions = this.generateRecommendedActions(
      nlp,
      intelligence.priority,
      enhancedRisk
    );

    const insight = this.buildInsight(
      input,
      reportDate,
      nlp,
      intelligence,
      null,
      intelligence.priority,
      enhancedRisk,
      reasoningBundle,
      null,
      null,
      disasterSeverity,
      humanitarianReasoning,
      analytical
    );

    return {
      nlp,
      reliability: intelligence.reliability,
      priority: intelligence.priority,
      riskProjection: enhancedRisk,
      recommendedActions,
      insight,
      intelligenceEntities,
      reasoningBundle,
    };
  }

  private async enrichHumanitarianNeeds(
    input: ReportInput,
    nlp: NLPAnalysisResult,
    reportId?: string
  ): Promise<HumanitarianReasoningContext> {
    const seedCount = nlp.humanitarianNeeds.length;
    const { needs: inferred, reasoningContext } = await humanitarianNeedInferenceEngine.infer(
      input.title,
      input.content,
      nlp.crisisType,
      nlp.humanitarianNeeds,
      { reportId }
    );
    nlp.humanitarianNeeds = ensureHumanitarianNeeds({
      needs: inferred,
      title: input.title,
      content: input.content,
      crisisType: nlp.crisisType,
      reasoningContext,
      allowLastResortPackage: false,
    });
    if (nlp.humanitarianNeeds.length === 0) {
      console.log(
        `[Analysis] No humanitarian needs assigned for "${input.title}" ` +
          `(seeded from ${seedCount} preliminary matches, ` +
          `context=${reasoningContext.reportPurpose}, phase=${reasoningContext.crisisPhase})`
      );
    } else {
      const observed = nlp.humanitarianNeeds.filter((n) => n.source === "Observed").length;
      const inferredCount = nlp.humanitarianNeeds.filter((n) => n.source === "Inferred").length;
      console.log(
        `[Analysis] Humanitarian needs for "${input.title}": ${nlp.humanitarianNeeds.length} total (${observed} observed, ${inferredCount} inferred)`
      );
    }
    return reasoningContext;
  }

  private async assessDisasterSeverity(
    input: ReportInput,
    nlp: NLPAnalysisResult,
    intelligence: ReturnType<typeof intelligenceAssessor.assess>,
    reasoningBundle?: IntelligenceReasoningBundle | null,
    crossSourceAgreementPercent?: number | null
  ) {
    return disasterSeverityService.assess({
      title: input.title,
      content: input.content,
      nlp,
      priority: intelligence.priority,
      reliability: intelligence.reliability,
      risk: intelligence.riskProjection,
      reasoningBundle,
      crossSourceAgreementPercent,
      trendNote: intelligence.riskProjection.trend,
    });
  }

  private mapHumanitarianNeeds(
    source: AiAnalysisResult | AiIncidentResult
  ): NLPAnalysisResult["humanitarianNeeds"] {
    if (source.needDetails && source.needDetails.length > 0) {
      return source.needDetails.map((need) => ({
        needType: need.needType,
        severity: this.inferNeedSeverity(
          need.needType,
          source.priorityLevel,
          need.severity
        ),
        reason: need.reason,
      }));
    }

    return source.humanitarianNeeds.map((needType) => ({
      needType,
      severity: this.inferNeedSeverity(needType, source.priorityLevel),
    }));
  }

  private inferNeedSeverity(
    needType: string,
    priorityLevel: PriorityResult["priorityLevel"],
    aiSeverity?: string
  ): NLPAnalysisResult["humanitarianNeeds"][number]["severity"] {
    if (aiSeverity) {
      const normalised = aiSeverity.toLowerCase();
      if (normalised === "critical") return "Critical";
      if (normalised === "high") return "High";
      if (normalised === "medium") return "Medium";
      if (normalised === "low") return "Low";
    }

    const normalised = needType.toLowerCase();
    if (
      normalised.includes("medical") ||
      normalised.includes("shelter") ||
      priorityLevel === "Critical"
    ) {
      return "High";
    }
    if (priorityLevel === "High") return "Medium";
    return "Low";
  }

  private async resolveDuplicateOnPersist(
    input: ReportInput,
    reportDate: Date,
    bundle: AnalysisBundle,
    meta: PersistReportMeta,
    contentFingerprint: string
  ): Promise<SavedReportAnalysisResponse | null> {
    if (meta.existingReportId) {
      return null;
    }

    const { nlp, priority, riskProjection } = bundle;

    const duplicate = await incidentDeduplicationService.findDuplicate({
      title: input.title,
      content: input.content,
      reportDate,
      nlp,
      articleUrl: meta.articleUrl,
      externalArticleId: meta.externalArticleId,
      contentFingerprint,
    });

    if (!duplicate) {
      return null;
    }

    if (duplicate.similarity >= 1) {
      const existing = await this.getByReportId(duplicate.reportId);
      if (existing) {
        try {
          const verification = await multiSourceVerificationService.verifyAfterReport(
            duplicate.reportId
          );
          await intelligenceFusionService.applyVerificationBoost(
            duplicate.reportId,
            verification
          );
          await alertService.generateForReport(duplicate.reportId, verification);
        } catch {
          // Non-blocking fusion on duplicate link.
        }

        return {
          saved: true,
          reportId: duplicate.reportId,
          sourceId: existing.report.sourceId,
          extractedEntityIds: existing.extractedEntities.map((entity) => entity.id),
          locationIds: existing.locations.map((location) => location.id),
          crisisId: existing.crisis?.id ?? null,
          humanitarianNeedIds:
            existing.crisis?.humanitarianNeeds.map((need) => need.id) ?? [],
          reliabilityAssessmentId: existing.reliabilityAssessment.id,
          priorityAssessmentId: existing.priorityAssessment.id,
          riskProjectionId: existing.riskProjection?.id ?? null,
          userActivityId: "",
          nlp: existing.crisis
            ? buildNlpView(existing.extractedEntities, existing.crisis)
            : nlp,
          reliability: {
            sourceScore: existing.reliabilityAssessment.sourceScore,
            consistencyScore: existing.reliabilityAssessment.consistencyScore,
            recencyScore: existing.reliabilityAssessment.recencyScore,
            finalScore: existing.reliabilityAssessment.finalScore,
          },
          priority: {
            priorityScore: Math.round(existing.priorityAssessment.severityScore * 100),
            severityScore: existing.priorityAssessment.severityScore,
            priorityLevel: existing.priorityAssessment.priorityLevel,
            reasons: existing.insight?.priorityExplanation.reasons ?? [],
          },
          riskProjection: existing.riskProjection
            ? {
                riskLevel: existing.riskProjection.riskLevel,
                trend: existing.riskProjection.trend,
                confidenceScore: existing.riskProjection.confidenceScore,
              }
            : riskProjection,
          recommendedActions: this.generateRecommendedActions(
            nlp,
            {
              priorityScore: Math.round(existing.priorityAssessment.severityScore * 100),
              severityScore: existing.priorityAssessment.severityScore,
              priorityLevel: existing.priorityAssessment.priorityLevel,
              reasons: [],
            },
            riskProjection
          ),
          incidentsCreated: 0,
          incidentReportIds: [duplicate.reportId],
        };
      }
    }

    if (duplicate.crisisId) {
      return this.persistMergedIntoCrisis(input, reportDate, bundle, meta, duplicate);
    }

    return null;
  }

  private async persistAnalysisBundle(
    input: ReportInput,
    reportDate: Date,
    bundle: AnalysisBundle,
    meta: PersistReportMeta = {}
  ): Promise<SavedReportAnalysisResponse> {
    const { nlp, reliability, priority, riskProjection, recommendedActions, insight } =
      bundle;

    const contentFingerprint = buildContentFingerprint(input.title, input.content);

    const duplicateResult = await this.resolveDuplicateOnPersist(
      input,
      reportDate,
      bundle,
      meta,
      contentFingerprint
    );
    if (duplicateResult) {
      return duplicateResult;
    }

    const incidentLabel =
      bundle.incidentLabel ??
      this.resolveIncidentLabelForPersist(
        input,
        nlp,
        priority.priorityLevel,
        meta.segmentCountry
      );

    const savedIds = await prisma.$transaction(async (tx) => {
      let sourceId: string;
      let report: Awaited<ReturnType<typeof reportRepository.create>>;

      if (meta.existingReportId) {
        const existing = await tx.report.findUniqueOrThrow({
          where: { id: meta.existingReportId },
          include: { source: true },
        });
        report = existing;
        sourceId = existing.sourceId;

        await tx.report.update({
          where: { id: meta.existingReportId },
          data: {
            title: input.title,
            content: input.content,
            reportDate,
            contentFingerprint,
            incidentLabel,
            articleUrl: meta.articleUrl
              ? normalizeArticleUrl(meta.articleUrl) ?? meta.articleUrl
              : undefined,
            externalArticleId: meta.externalArticleId,
            segmentIndex: meta.segmentIndex,
            segmentCountry: meta.segmentCountry,
          },
        });

        // Re-analysis must replace 1:1 analysis artifacts (unique on reportId).
        await this.clearReportAnalysisArtifacts(report.id, tx);
      } else {
        const source = await sourceRepository.findOrCreate(
          input.source?.name ?? DEFAULT_SOURCE_NAME,
          input.source?.type ?? "OTHER",
          input.source?.credibilityScore ?? 0.5,
          input.source?.url,
          tx
        );
        sourceId = source.id;

        report = await reportRepository.create(
          {
            title: input.title,
            content: input.content,
            reportDate,
            contentFingerprint,
            incidentLabel,
            articleUrl: meta.articleUrl
              ? normalizeArticleUrl(meta.articleUrl) ?? meta.articleUrl
              : undefined,
            externalArticleId: meta.externalArticleId,
            segmentIndex: meta.segmentIndex,
            segmentCountry: meta.segmentCountry,
            source: { connect: { id: source.id } },
          },
          tx
        );
      }

      const coordinateResolution = await this.resolveCoordinatesForPersist(
        nlp,
        meta.segmentCountry,
        tx,
        input.title,
        input.content
      );

      const enrichedInsight: ExtendedAnalysisInsight = {
        ...insight,
        locationReasoning: buildLocationReasoningFromResolution({
          displayName: coordinateResolution.displayName,
          resolutionSource: coordinateResolution.resolutionSource,
          confidenceScore: coordinateResolution.confidenceScore,
          locationPending: coordinateResolution.locationPending,
          locationApproximate: coordinateResolution.locationApproximate,
          rawLocationText: coordinateResolution.rawLocationText,
        }),
      };

      await tx.extractedEntity.deleteMany({ where: { reportId: report.id } });
      const extractedEntities = await extractedEntityRepository.createMany(
        report.id,
        this.buildExtractedEntities(nlp, bundle.intelligenceEntities),
        tx
      );

      const locationIds: string[] = [];
      const savedLocations = await this.persistLocations(nlp, coordinateResolution, tx);
      locationIds.push(...savedLocations.map((location) => location.id));

      let crisisId: string | null = null;
      let humanitarianNeedIds: string[] = [];

      const primaryLocationId = coordinateResolution.primaryLocationId;

      if (!locationIds.includes(primaryLocationId)) {
        locationIds.push(primaryLocationId);
      }

      const crisis = await crisisRepository.upsertForReport(
        report.id,
        {
          crisisType: nlp.crisisType ?? "Unclassified",
          description: this.buildCrisisDescription(input.content, nlp),
          locationId: primaryLocationId,
        },
        tx
      );
      crisisId = crisis.id;

      // Replace needs on re-analysis (upsert keeps the crisis row).
      await tx.humanitarianNeed.deleteMany({ where: { crisisId: crisis.id } });
      await tx.crisisLocation.deleteMany({ where: { crisisId: crisis.id } });

      const region = crisisRegionService.buildRegion({
        locations: savedLocations.filter(
          (location) =>
            location.latitude !== null &&
            location.longitude !== null &&
            hasValidCoordinates(location.latitude, location.longitude)
        ),
        crisisType: nlp.crisisType,
        riskLevel: riskProjection.riskLevel,
        affectedPopulation: nlp.affectedPopulation,
      });

      if (region) {
        await crisisRepository.updateRegion(crisis.id, region, tx);
        await crisisLocationRepository.linkMany(
          crisis.id,
          region.relatedLocationIds,
          tx
        );
      } else if (savedLocations.length > 0) {
        await crisisLocationRepository.linkMany(
          crisis.id,
          savedLocations.map((location) => location.id),
          tx
        );
      }

      if (nlp.humanitarianNeeds.length > 0) {
        const needs = await humanitarianNeedRepository.createMany(
          nlp.humanitarianNeeds.map((need) => ({
            needType: need.needType,
            severity: need.severity as NeedSeverity,
            source: need.source ?? null,
            evidence: need.evidence ?? need.reason ?? null,
            reasoning: need.reasoning ?? need.reason ?? null,
            confidenceScore: need.confidence ?? null,
          })),
          crisis.id,
          tx
        );
        humanitarianNeedIds = needs.map((need) => need.id);
      }

      const reliabilityAssessment = await reliabilityAssessmentRepository.upsertForReport(
        report.id,
        {
          sourceScore: reliability.sourceScore,
          consistencyScore: reliability.consistencyScore,
          recencyScore: reliability.recencyScore,
          finalScore: reliability.finalScore,
          scoreBreakdown: reliability.breakdown as object | undefined,
        },
        tx
      );

      const priorityAssessment = await priorityAssessmentRepository.upsertForReport(
        report.id,
        {
          severityScore: priority.severityScore,
          priorityLevel: priority.priorityLevel,
          scoreBreakdown: (priority as PriorityAssessmentPipelineResult).scoreBreakdown as object | undefined,
        },
        tx
      );

      let riskProjectionId: string | null = null;
      const riskRecord = await riskRepository.create(
        {
          riskLevel: riskProjection.riskLevel,
          trend: riskProjection.trend,
          confidenceScore: riskProjection.confidenceScore,
          scoreBreakdown: riskProjection.breakdown as object | undefined,
          projections: riskProjection.horizons
            ? ({
                current: riskProjection.horizons[0]?.score,
                forecast24h: riskProjection.horizons[1]?.score,
                forecast72h: riskProjection.horizons[2]?.score,
                forecast7d: riskProjection.horizons[3]?.score,
                trend: riskProjection.trend,
              } as object)
            : undefined,
          location: { connect: { id: primaryLocationId } },
          crisis: { connect: { id: crisis.id } },
        },
        tx
      );
      riskProjectionId = riskRecord.id;

      const userActivity = await userActivityRepository.create(
        `Analysed report: ${report.title} (${report.id})`,
        tx
      );

      await reportInsightRepository.upsert(report.id, enrichedInsight, tx);

      console.log(
        `[Analysis] Report saved: ${report.id}, crisis: ${crisisId}` +
          (coordinateResolution.locationPending
            ? " (location pending verification)"
            : coordinateResolution.locationApproximate
              ? " (approximate country-level location)"
              : ` at ${coordinateResolution.resolutionSource} coords`)
      );

      return {
        reportId: report.id,
        sourceId,
        extractedEntityIds: extractedEntities.map((entity) => entity.id),
        locationIds,
        crisisId,
        humanitarianNeedIds,
        reliabilityAssessmentId: reliabilityAssessment.id,
        priorityAssessmentId: priorityAssessment.id,
        riskProjectionId,
        userActivityId: userActivity.id,
        reportTitle: report.title,
        locationPending: coordinateResolution.locationPending,
        locationApproximate: coordinateResolution.locationApproximate,
        resolutionStatus: coordinateResolution.resolutionStatus,
      };
    });

    const timelineWarning = await timelineService.recordInitialAnalysis({
      crisisId: savedIds.crisisId,
      reportId: savedIds.reportId,
      title: savedIds.reportTitle,
      crisisType: nlp.crisisType,
      priorityLevel: priority.priorityLevel,
      riskLevel: riskProjection.riskLevel,
      occurredAt: reportDate,
    });

    if (!meta.existingReportId) {
      try {
        await continuousHumanitarianLearningEngine.recordAnalysisSnapshot({
          reportId: savedIds.reportId,
          title: input.title,
          content: input.content,
          nlp,
          priorityLevel: priority.priorityLevel,
          riskLevel: riskProjection.riskLevel,
          reliabilityScore: reliability.finalScore,
          insight: bundle.insight ?? null,
          contentFingerprint,
        });
      } catch (error) {
        console.warn("[CHLE] Failed to record learning case:", error);
      }
    }

    return {
      saved: true,
      reportId: savedIds.reportId,
      sourceId: savedIds.sourceId,
      extractedEntityIds: savedIds.extractedEntityIds,
      locationIds: savedIds.locationIds,
      crisisId: savedIds.crisisId,
      humanitarianNeedIds: savedIds.humanitarianNeedIds,
      reliabilityAssessmentId: savedIds.reliabilityAssessmentId,
      priorityAssessmentId: savedIds.priorityAssessmentId,
      riskProjectionId: savedIds.riskProjectionId,
      userActivityId: savedIds.userActivityId,
      warnings: timelineWarning ? [timelineWarning] : undefined,
      locationPending: savedIds.locationPending,
      locationApproximate: savedIds.locationApproximate,
      resolutionStatus: savedIds.resolutionStatus,
      nlp,
      reliability,
      priority,
      riskProjection,
      recommendedActions,
    };
  }

  async getByReportIdForView(reportId: string): Promise<PersistedAnalysisView | null> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        source: true,
        extractedEntities: true,
        reliabilityAssessment: true,
        priorityAssessment: true,
        insight: true,
        crisis: { include: { humanitarianNeeds: true } },
      },
    });

    if (!report?.reliabilityAssessment || !report.priorityAssessment) {
      return null;
    }

    const extractedEntities = report.extractedEntities;
    const reliabilityAssessment = report.reliabilityAssessment;
    const priorityAssessment = report.priorityAssessment;
    const insightRecord = report.insight;

    const locationEntities = extractedEntities.filter(
      (entity) =>
        entity.entityType === "LOCATION" || entity.entityType === "GEOGRAPHIC"
    );
    const locationNames = locationEntities.map((entity) => entity.value);
    const locations =
      locationNames.length > 0
        ? await locationRepository.findByNames(locationNames)
        : [];

    const locationByName = new Map(
      locations.map((location) => [location.name.toLowerCase(), location])
    );
    const orderedLocations = locationNames
      .map((name) => locationByName.get(name.toLowerCase()))
      .filter((location): location is NonNullable<typeof location> =>
        location !== undefined
      );

    const validLocationNames = new Set(
      orderedLocations.map((location) => location.name.toLowerCase())
    );
    const displayEntities = extractedEntities.filter(
      (entity) =>
        (entity.entityType !== "LOCATION" && entity.entityType !== "GEOGRAPHIC") ||
        validLocationNames.has(entity.value.toLowerCase())
    );

    const crisis = report.crisis
      ? {
          ...report.crisis,
          humanitarianNeeds: report.crisis.humanitarianNeeds,
        }
      : null;

    const locationIds = orderedLocations.map((location) => location.id);
    const riskProjection =
      locationIds.length > 0
        ? await riskRepository.findLatestForReportLocations(locationIds)
        : null;

    const nlp = buildNlpViewReadOnly(displayEntities, crisis);
    const insight = insightRecord ? mapInsightFromDb(insightRecord) : null;
    const scoreBreakdown = priorityAssessment.scoreBreakdown as import("@/types").PriorityScoreBreakdown | null;
    const enrichedInsight = insight
      ? {
          ...insight,
          aiPriorityAssessment:
            insight.aiPriorityAssessment ?? scoreBreakdown?.aiAssessment ?? null,
          guardrailAdjustment:
            insight.guardrailAdjustment ?? scoreBreakdown?.guardrailAdjustment ?? null,
          priorityBreakdown:
            insight.priorityBreakdown ?? scoreBreakdown?.weightedIndicators,
        }
      : null;
    const priority: PriorityResult = {
      priorityScore: Math.round(priorityAssessment.severityScore * 100),
      severityScore: priorityAssessment.severityScore,
      priorityLevel: priorityAssessment.priorityLevel,
      reasons: enrichedInsight?.priorityExplanation.reasons ?? [],
    };
    const risk: RiskProjectionResult = riskProjection
      ? {
          riskLevel: riskProjection.riskLevel,
          trend: riskProjection.trend,
          confidenceScore: riskProjection.confidenceScore,
        }
      : {
          riskLevel: "Low",
          trend: "Stable",
          confidenceScore: 0,
        };

    const recommendedActions = this.generateRecommendedActions(nlp, priority, risk);

    return {
      report,
      extractedEntities: displayEntities,
      locations: orderedLocations,
      crisis,
      reliabilityAssessment,
      priorityAssessment,
      riskProjection,
      recommendedActions,
      insight: enrichedInsight,
      nlp,
    };
  }

  async getByReportId(reportId: string): Promise<PersistedAnalysisView | null> {
    const report = await reportRepository.findById(reportId);
    if (!report) return null;

    const [
      extractedEntities,
      reliabilityAssessment,
      priorityAssessment,
      insightRecord,
    ] = await Promise.all([
      extractedEntityRepository.findByReportId(reportId),
      reliabilityAssessmentRepository.findByReportId(reportId),
      priorityAssessmentRepository.findByReportId(reportId),
      reportInsightRepository.findByReportId(reportId),
    ]);

    if (!reliabilityAssessment || !priorityAssessment) {
      return null;
    }

    const locationEntities = extractedEntities.filter(
      (entity) =>
        entity.entityType === "LOCATION" || entity.entityType === "GEOGRAPHIC"
    );
    const locationNames = locationEntities.map((entity) => entity.value);
    const locations =
      locationNames.length > 0
        ? await Promise.all(
            locationNames.map((name) => locationRepository.findByName(name))
          ).then((results) =>
            results.filter((location): location is NonNullable<typeof location> =>
              location !== null
            )
          )
        : [];
    const validLocationNames = new Set(
      locations.map((location) => location.name.toLowerCase())
    );
    const displayEntities = extractedEntities.filter(
      (entity) =>
        (entity.entityType !== "LOCATION" && entity.entityType !== "GEOGRAPHIC") ||
        validLocationNames.has(entity.value.toLowerCase())
    );

    const primaryLocation = locations[0];
    let crisis: PersistedAnalysisView["crisis"] = null;

    const crisisByReport = await crisisRepository.findByReportId(reportId);
    const crisisRecord =
      crisisByReport ??
      (primaryLocation
        ? await crisisRepository.findLatestByLocationId(primaryLocation.id)
        : null);

    if (crisisRecord) {
      const needs = await humanitarianNeedRepository.findByCrisisId(crisisRecord.id);
      crisis = { ...crisisRecord, humanitarianNeeds: needs };
    }

    const locationIds = locations.map((location) => location.id);
    const riskProjection =
      await riskRepository.findLatestForReportLocations(locationIds);

    const nlp = buildNlpView(displayEntities, crisis, {
      title: report.title,
      content: report.content,
    });
    const insight = insightRecord ? mapInsightFromDb(insightRecord) : null;
    const scoreBreakdown = priorityAssessment.scoreBreakdown as import("@/types").PriorityScoreBreakdown | null;
    const enrichedInsight = insight
      ? {
          ...insight,
          aiPriorityAssessment:
            insight.aiPriorityAssessment ?? scoreBreakdown?.aiAssessment ?? null,
          guardrailAdjustment:
            insight.guardrailAdjustment ?? scoreBreakdown?.guardrailAdjustment ?? null,
          priorityBreakdown:
            insight.priorityBreakdown ?? scoreBreakdown?.weightedIndicators,
        }
      : null;
    const priority: PriorityResult = {
      priorityScore: Math.round(priorityAssessment.severityScore * 100),
      severityScore: priorityAssessment.severityScore,
      priorityLevel: priorityAssessment.priorityLevel,
      reasons: enrichedInsight?.priorityExplanation.reasons ?? [],
    };
    const risk: RiskProjectionResult = riskProjection
      ? {
          riskLevel: riskProjection.riskLevel,
          trend: riskProjection.trend,
          confidenceScore: riskProjection.confidenceScore,
        }
      : {
          riskLevel: "Low",
          trend: "Stable",
          confidenceScore: 0,
        };

    const recommendedActions = this.generateRecommendedActions(
      nlp,
      priority,
      risk
    );

    return {
      report,
      extractedEntities: displayEntities,
      locations,
      crisis,
      reliabilityAssessment,
      priorityAssessment,
      riskProjection,
      recommendedActions,
      insight: enrichedInsight,
      nlp,
    };
  }

  generateRecommendedActions(
    nlp: NLPAnalysisResult,
    priority: PriorityResult,
    risk: RiskProjectionResult
  ): string[] {
    const actions: string[] = [];

    switch (priority.priorityLevel) {
      case "Critical":
        actions.push(
          "Activate emergency response protocols and notify humanitarian coordination clusters immediately."
        );
        break;
      case "High":
        actions.push(
          "Prioritise rapid needs assessment and pre-position relief supplies in affected areas."
        );
        break;
      case "Medium":
        actions.push(
          "Schedule field verification and monitor situation reports for escalation."
        );
        break;
      default:
        actions.push(
          "Continue routine monitoring and validate report details with additional sources."
        );
    }

    for (const need of nlp.humanitarianNeeds) {
      if (need.severity === "Critical" || need.severity === "High") {
        actions.push(
          `Deploy ${need.needType.toLowerCase()} assistance to meet ${need.severity.toLowerCase()} severity needs.`
        );
      }
    }

    if (nlp.affectedPopulation !== null && nlp.affectedPopulation >= 10000) {
      actions.push(
        `Scale response operations to support an estimated ${nlp.affectedPopulation.toLocaleString()} affected people.`
      );
    }

    if (risk.trend === "Increasing") {
      actions.push(
        "Increase monitoring frequency and prepare contingency plans for further deterioration."
      );
    } else if (risk.trend === "Decreasing") {
      actions.push(
        "Maintain recovery support while tracking residual vulnerability in affected locations."
      );
    }

    if (risk.riskLevel === "Critical" || risk.riskLevel === "High") {
      actions.push(
        "Map high-risk zones and coordinate with local authorities for safe access routes."
      );
    }

    if (nlp.locations.length === 0) {
      actions.push(
        "Conduct geolocation verification to improve spatial accuracy for crisis mapping."
      );
    }

    return [...new Set(actions)];
  }

  private async resolveCoordinatesForPersist(
    nlp: NLPAnalysisResult,
    countryHint: string | null | undefined,
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    sourceTitle?: string,
    sourceContent?: string
  ) {
    const validLocations = nlp.locations.filter(
      (location) => !shouldRejectLocationCandidate(location.name, nlp.crisisType)
    );
    const primary = validLocations[0];
    const fallbackName =
      countryHint && !shouldRejectLocationCandidate(countryHint, nlp.crisisType)
        ? countryHint
        : null;
    const primaryName = primary?.name ?? fallbackName ?? "Unknown Region";
    const resolved = await resolveSafeCoordinates({
      name: primaryName,
      latitude: primary?.latitude ?? null,
      longitude: primary?.longitude ?? null,
      countryHint: countryHint ?? null,
      crisisType: nlp.crisisType,
      sourceTitle,
      sourceContent,
      tx,
    });

    const validationStatus: ExtractedLocation["validationStatus"] =
      resolved.locationPending
        ? "pending"
        : resolved.locationApproximate
          ? "geocoded"
          : "verified";
    const confidence = resolved.confidenceScore;

    if (nlp.locations.length === 0) {
      nlp.locations.push({
        name: resolved.displayName,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        confidence,
        validationStatus,
      });
    } else {
      nlp.locations[0] = {
        ...nlp.locations[0],
        name: resolved.displayName,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        confidence,
        validationStatus,
      };
    }

    const primaryLocation = await locationRepository.findOrCreateWithResolution(
      {
        name: resolved.dbName,
        latitude: resolved.dbLatitude,
        longitude: resolved.dbLongitude,
        resolutionStatus: resolved.resolutionStatus,
        resolutionMethod:
          resolved.resolutionSource === "ai"
            ? "AI"
            : resolved.resolutionSource === "database"
              ? "DATABASE"
              : resolved.resolutionSource === "geonames"
                ? "GEONAMES"
                : resolved.resolutionSource === "nominatim"
                  ? "NOMINATIM"
                  : resolved.resolutionSource === "centroid"
                    ? "COUNTRY_CENTROID"
                    : null,
        confidenceScore: resolved.confidenceScore,
        rawLocationText: resolved.rawLocationText,
      },
      tx
    );

    return {
      ...resolved,
      primaryLocationId: primaryLocation.id,
    };
  }

  private buildExtractedEntities(
    nlp: NLPAnalysisResult,
    intelligenceEntities: ExtractedIntelligenceEntity[] = []
  ): ExtractedEntityInput[] {
    const entities: ExtractedEntityInput[] = [];

    for (const location of nlp.locations) {
      entities.push({
        entityType: "LOCATION",
        entitySubtype: "CITY",
        value: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        severity: encodeLocationMeta(
          location.confidence ?? 0.5,
          location.validationStatus ?? "geocoded"
        ),
      });
    }

    for (const entity of intelligenceEntities) {
      entities.push({
        entityType: entity.entityType,
        entitySubtype: entity.entitySubtype,
        value: entity.value,
        latitude: entity.latitude,
        longitude: entity.longitude,
        severity: entity.severity,
      });
    }

    if (nlp.crisisType) {
      entities.push({
        entityType: "CRISIS_TYPE",
        value: nlp.crisisType,
      });
    }

    for (const need of nlp.humanitarianNeeds) {
      entities.push({
        entityType: "HUMANITARIAN_NEED",
        value: normaliseNeedName(need.needType),
        severity: need.severity,
      });
    }

    if (nlp.affectedPopulation !== null) {
      entities.push({
        entityType: "AFFECTED_POPULATION",
        value: String(nlp.affectedPopulation),
      });
    }

    return entities;
  }

  private async persistLocations(
    nlp: NLPAnalysisResult,
    coordinateResolution: Awaited<
      ReturnType<AnalysisService["resolveCoordinatesForPersist"]>
    >,
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
  ) {
    const saved = [];
    const seen = new Set<string>();

    if (
      !coordinateResolution.locationPending &&
      hasSafeCoordinates(coordinateResolution)
    ) {
      const key = coordinateResolution.displayName.toLowerCase();
      if (!seen.has(key) && !isPendingLocationName(coordinateResolution.dbName)) {
        seen.add(key);
        const coords = getSafeCoordinates(coordinateResolution)!;
        saved.push(
          await locationRepository.findOrCreateWithResolution(
            {
              name: coordinateResolution.displayName,
              latitude: coords.lat,
              longitude: coords.lng,
              resolutionStatus: coordinateResolution.resolutionStatus,
              resolutionMethod:
                coordinateResolution.resolutionSource === "ai"
                  ? "AI"
                  : coordinateResolution.resolutionSource === "database"
                    ? "DATABASE"
                    : coordinateResolution.resolutionSource === "geonames"
                      ? "GEONAMES"
                      : coordinateResolution.resolutionSource === "nominatim"
                        ? "NOMINATIM"
                        : coordinateResolution.resolutionSource === "centroid"
                          ? "COUNTRY_CENTROID"
                          : null,
              confidenceScore: coordinateResolution.confidenceScore,
              rawLocationText: coordinateResolution.rawLocationText,
            },
            tx
          )
        );
      }
    }

    for (const location of nlp.locations.slice(1)) {
      const key = location.name.toLowerCase();
      if (seen.has(key)) continue;
      if (shouldRejectLocationCandidate(location.name, nlp.crisisType)) continue;
      const coords = getSafeCoordinates(location);
      if (!coords) continue;
      if (isPendingLocationName(location.name)) continue;
      seen.add(key);

      saved.push(
        await locationRepository.findOrCreate(
          location.name,
          coords.lat,
          coords.lng,
          tx,
          {
            resolutionStatus: "VERIFIED",
            resolutionMethod: null,
            confidenceScore: location.confidence ?? 0.75,
            rawLocationText: location.name,
          }
        )
      );
    }

    return saved;
  }

  private async persistMergedIntoCrisis(
    input: ReportInput,
    reportDate: Date,
    bundle: AnalysisBundle,
    meta: PersistReportMeta,
    duplicate: { reportId: string; crisisId?: string | null; reason: string }
  ): Promise<SavedReportAnalysisResponse> {
    const { nlp, reliability, priority, riskProjection, recommendedActions, insight } = bundle;
    const contentFingerprint = buildContentFingerprint(input.title, input.content);

    const incidentLabel =
      bundle.incidentLabel ??
      this.resolveIncidentLabelForPersist(
        input,
        nlp,
        priority.priorityLevel,
        meta.segmentCountry
      );

    const savedIds = await prisma.$transaction(async (tx) => {
      const source = await sourceRepository.findOrCreate(
        input.source?.name ?? DEFAULT_SOURCE_NAME,
        input.source?.type ?? "OTHER",
        input.source?.credibilityScore ?? 0.5,
        input.source?.url,
        tx
      );

      const report = await reportRepository.create(
        {
          title: input.title,
          content: input.content,
          reportDate,
          contentFingerprint,
          incidentLabel,
          duplicateOfReportId: duplicate.reportId,
          fusedSourceCount: 2,
          articleUrl: meta.articleUrl
            ? normalizeArticleUrl(meta.articleUrl) ?? meta.articleUrl
            : undefined,
          externalArticleId: meta.externalArticleId,
          segmentIndex: meta.segmentIndex,
          segmentCountry: meta.segmentCountry,
          source: { connect: { id: source.id } },
        },
        tx
      );

      const coordinateResolution = await this.resolveCoordinatesForPersist(
        nlp,
        meta.segmentCountry,
        tx,
        input.title,
        input.content
      );

      await extractedEntityRepository.createMany(
        report.id,
        this.buildExtractedEntities(nlp, bundle.intelligenceEntities),
        tx
      );

      const crisisId = duplicate.crisisId!;

      await reliabilityAssessmentRepository.upsertForReport(
        report.id,
        {
          sourceScore: reliability.sourceScore,
          consistencyScore: reliability.consistencyScore,
          recencyScore: reliability.recencyScore,
          finalScore: reliability.finalScore,
          scoreBreakdown: reliability.breakdown as object | undefined,
        },
        tx
      );

      await priorityAssessmentRepository.upsertForReport(
        report.id,
        {
          severityScore: priority.severityScore,
          priorityLevel: priority.priorityLevel,
          scoreBreakdown: (priority as PriorityAssessmentPipelineResult).scoreBreakdown as object | undefined,
        },
        tx
      );

      const riskRecord = await riskRepository.create(
        {
          riskLevel: riskProjection.riskLevel,
          trend: riskProjection.trend,
          confidenceScore: riskProjection.confidenceScore,
          scoreBreakdown: riskProjection.breakdown as object | undefined,
          projections: riskProjection.horizons
            ? ({
                current: riskProjection.horizons[0]?.score,
                forecast24h: riskProjection.horizons[1]?.score,
                forecast72h: riskProjection.horizons[2]?.score,
                forecast7d: riskProjection.horizons[3]?.score,
                trend: riskProjection.trend,
              } as object)
            : undefined,
          location: { connect: { id: coordinateResolution.primaryLocationId } },
          crisis: { connect: { id: crisisId } },
        },
        tx
      );

      const mergedInsight: ExtendedAnalysisInsight = {
        ...insight,
        locationReasoning: buildLocationReasoningFromResolution({
          displayName: coordinateResolution.displayName,
          resolutionSource: coordinateResolution.resolutionSource,
          confidenceScore: coordinateResolution.confidenceScore,
          locationPending: coordinateResolution.locationPending,
          locationApproximate: coordinateResolution.locationApproximate,
          rawLocationText: coordinateResolution.rawLocationText,
        }),
      };

      await reportInsightRepository.upsert(report.id, mergedInsight, tx);

      const userActivity = await userActivityRepository.create(
        `Merged report into crisis: ${report.title} (${duplicate.reason})`,
        tx
      );

      return {
        reportId: report.id,
        sourceId: source.id,
        crisisId,
        riskProjectionId: riskRecord.id,
        userActivityId: userActivity.id,
        reportTitle: report.title,
        locationIds: [coordinateResolution.primaryLocationId],
      };
    });

    await timelineService.recordReportUpdate({
      crisisId: savedIds.crisisId,
      reportId: savedIds.reportId,
      title: savedIds.reportTitle,
      crisisType: nlp.crisisType,
      priorityLevel: priority.priorityLevel,
      riskLevel: riskProjection.riskLevel,
      occurredAt: reportDate,
      duplicateOfReportId: duplicate.reportId,
    });

    return {
      saved: true,
      reportId: savedIds.reportId,
      sourceId: savedIds.sourceId,
      extractedEntityIds: [],
      locationIds: savedIds.locationIds,
      crisisId: savedIds.crisisId,
      humanitarianNeedIds: [],
      reliabilityAssessmentId: "",
      priorityAssessmentId: "",
      riskProjectionId: savedIds.riskProjectionId,
      userActivityId: savedIds.userActivityId,
      nlp,
      reliability,
      priority,
      riskProjection,
      recommendedActions,
      incidentsCreated: 0,
      incidentReportIds: [savedIds.reportId, duplicate.reportId],
    };
  }

  async reanalyzeExisting(
    reportId: string,
    options?: { reanalysisReason?: string }
  ): Promise<void> {
    const report = await reportRepository.findById(reportId);
    if (!report) throw new Error(`Report ${reportId} not found`);

    const input: ReportInput = {
      title: report.title,
      content: report.content,
      reportDate: report.reportDate.toISOString(),
      articleUrl: report.articleUrl ?? undefined,
      externalArticleId: report.externalArticleId ?? undefined,
      source: {
        name: report.source.name,
        type: report.source.type,
        credibilityScore: report.source.credibilityScore,
        url: report.source.url ?? undefined,
      },
    };

    const reportDate = new Date(input.reportDate);
    const unified = await unifiedReportAnalysisService.analyse(input.title, input.content);
    const bundle = unified
      ? await this.mapUnifiedAnalysisToBundle(input, reportDate, unified, undefined, reportId)
      : await this.runRuleBasedAnalysis(input, reportDate, undefined, reportId, {
          deterministicOnly: true,
        });

    if (bundle.insight && unified) {
      bundle.insight = {
        ...bundle.insight,
        humanitarianReasoning: unified.humanitarianReasoning,
        ...(options?.reanalysisReason
          ? {
              reanalysisReason: options.reanalysisReason,
              reanalyzedAt: new Date().toISOString(),
            }
          : {}),
      };
    } else if (bundle.insight && options?.reanalysisReason) {
      bundle.insight = {
        ...bundle.insight,
        reanalysisReason: options.reanalysisReason,
        reanalyzedAt: new Date().toISOString(),
      };
    }

    const { nlp, reliability, priority, riskProjection, insight } = bundle;

    await prisma.$transaction(async (tx) => {
      await tx.extractedEntity.deleteMany({ where: { reportId } });
      await extractedEntityRepository.createMany(
        reportId,
        this.buildExtractedEntities(nlp, bundle.intelligenceEntities),
        tx
      );

      const existingReliability = await reliabilityAssessmentRepository.findByReportId(reportId);
      if (existingReliability) {
        await reliabilityAssessmentRepository.update(
          reportId,
          {
            sourceScore: reliability.sourceScore,
            consistencyScore: reliability.consistencyScore,
            recencyScore: reliability.recencyScore,
            finalScore: reliability.finalScore,
            scoreBreakdown: reliability.breakdown as object | undefined,
          },
          tx
        );
      }

      const existingPriority = await priorityAssessmentRepository.findByReportId(reportId);
      if (existingPriority) {
        await priorityAssessmentRepository.update(
          reportId,
          {
            severityScore: priority.severityScore,
            priorityLevel: priority.priorityLevel,
            scoreBreakdown: (priority as PriorityAssessmentPipelineResult).scoreBreakdown as object | undefined,
          },
          tx
        );
      }

      await reportInsightRepository.upsert(reportId, insight, tx);

      const crisis = await crisisRepository.findByReportId(reportId);
      if (crisis) {
        const persistedNeeds = ensureHumanitarianNeeds({
          needs: nlp.humanitarianNeeds,
          title: input.title,
          content: input.content,
          crisisType: nlp.crisisType,
          reasoningContext: insight.humanitarianReasoning ?? undefined,
          allowLastResortPackage: false,
        });

        await tx.humanitarianNeed.deleteMany({ where: { crisisId: crisis.id } });
        if (persistedNeeds.length > 0) {
          await humanitarianNeedRepository.createMany(
            persistedNeeds.map((need) => ({
              needType: need.needType,
              severity: need.severity as import("@prisma/client").NeedSeverity,
              source: need.source ?? null,
              evidence: need.evidence ?? need.reason ?? null,
              reasoning: need.reasoning ?? need.reason ?? null,
              confidenceScore: need.confidence ?? null,
            })),
            crisis.id,
            tx
          );
        } else {
          console.warn(
            `[Reanalyze] Report ${reportId}: no humanitarian needs after inference and scenario fallback`
          );
        }

        const existingRisk = await riskRepository.findByCrisisId(crisis.id);
        const riskData = {
          riskLevel: riskProjection.riskLevel,
          trend: riskProjection.trend,
          confidenceScore: riskProjection.confidenceScore,
          scoreBreakdown: riskProjection.breakdown as object | undefined,
          projections: riskProjection.horizons
            ? ({
                current: riskProjection.horizons[0]?.score,
                forecast24h: riskProjection.horizons[1]?.score,
                forecast72h: riskProjection.horizons[2]?.score,
                forecast7d: riskProjection.horizons[3]?.score,
                trend: riskProjection.trend,
              } as object)
            : undefined,
        };
        if (existingRisk) {
          await riskRepository.update(existingRisk.id, riskData, tx);
        }
      }
    });

    const crisis = await crisisRepository.findByReportId(reportId);
    if (crisis) {
      await timelineService.recordInitialAnalysis({
        crisisId: crisis.id,
        reportId,
        title: report.title,
        crisisType: nlp.crisisType,
        priorityLevel: priority.priorityLevel,
        riskLevel: riskProjection.riskLevel,
        occurredAt: reportDate,
      });
    }

    try {
      const verification = await multiSourceVerificationService.verifyAfterReport(reportId);
      await this.applyPostVerificationReasoning(reportId, verification);
      await intelligenceFusionService.applyVerificationBoost(reportId, verification);
      await intelligenceFusionService.applyContradictionPenalty(reportId, verification);
      await alertService.generateForReport(reportId, verification);
    } catch {
      // Non-blocking.
    }

    try {
      await continuousHumanitarianLearningEngine.recordAnalysisSnapshot({
        reportId,
        title: input.title,
        content: input.content,
        nlp,
        priorityLevel: priority.priorityLevel,
        riskLevel: riskProjection.riskLevel,
        reliabilityScore: reliability.finalScore,
        insight: insight ?? null,
      });
    } catch (error) {
      console.warn("[CHLE] Failed to update learning case on reanalyze:", error);
    }
  }

  private async applyPostVerificationReasoning(
    reportId: string,
    verification: import("@/types").SourceVerificationSummary | null
  ): Promise<void> {
    if (!verification) return;

    const report = await reportRepository.findById(reportId);
    const insightRecord = await reportInsightRepository.findByReportId(reportId);
    const reliability = await reliabilityAssessmentRepository.findByReportId(reportId);
    if (!report || !insightRecord || !reliability) return;

    const existing = mapInsightFromDb(insightRecord);
    const crossSourceAnalysis = crossSourceIntelligenceService.analyze({
      primarySourceName: report.source.name,
      primaryReliability: reliability.finalScore,
      verification,
      fusedSourceCount: report.fusedSourceCount,
    });

    const reliabilityExplanation = existing.reliabilityReasoning
      ? {
          conclusion: existing.reliabilityReasoning.conclusion,
          reasons: [
            existing.reliabilityReasoning.narrative,
            crossSourceAnalysis.narrative,
            ...existing.reliabilityReasoning.reasons,
          ].filter(Boolean),
          evidence: existing.reliabilityReasoning.evidenceQuotes,
        }
      : {
          conclusion: existing.reliabilityExplanation.conclusion,
          reasons: [crossSourceAnalysis.narrative, ...existing.reliabilityExplanation.reasons],
          evidence: existing.reliabilityExplanation.evidence,
        };

    await reportInsightRepository.update(reportId, {
      ...existing,
      crossSourceAnalysis,
      reliabilityExplanation,
    });
  }

  private async assessPriorityPipeline(
    input: ReportInput,
    nlp: NLPAnalysisResult,
    sourceCredibility?: number,
    reportId?: string,
    precomputed?: import("@/types").AiPriorityAssessmentResult,
    deterministicOnly?: boolean
  ): Promise<PriorityAssessmentPipelineResult> {
    const local = await localHumanitarianReasoningEngine.assess({
      title: input.title,
      content: input.content,
      nlp,
      sourceCredibility,
      reportId,
    });

    const reliability = local.reliability.finalScore;

    if (precomputed) {
      return priorityGuardrailEngine.apply(
        precomputed,
        nlp,
        input.content,
        reliability,
        {
          assessmentMethod: "AI_ENHANCED",
          fallbackReason: null,
        }
      );
    }

    return {
      priorityScore: local.priority.priorityScore,
      severityScore: local.priority.severityScore,
      priorityLevel: local.priority.priorityLevel,
      reasons: local.priority.reasons,
      assessmentMethod: "LOCAL_REASONING",
      fallbackReason: deterministicOnly
        ? null
        : "Unified AI unavailable; using local reasoning",
      aiAssessment: null,
      guardrailAdjustment: {
        applied: false,
        reason: null,
        evidence: [],
        aiPriorityLevel: local.priority.priorityLevel,
        aiPriorityScore: local.priority.priorityScore,
        finalPriorityLevel: local.priority.priorityLevel,
        finalPriorityScore: local.priority.priorityScore,
      },
    };
  }

  private buildCrisisDescription(content: string, nlp: NLPAnalysisResult): string {
    const excerpt = content.trim().slice(0, 500);
    const population =
      nlp.affectedPopulation !== null
        ? ` Estimated affected population: ${nlp.affectedPopulation.toLocaleString()}.`
        : "";
    return `${excerpt}${population}`;
  }
}

export const analysisService = new AnalysisService();
