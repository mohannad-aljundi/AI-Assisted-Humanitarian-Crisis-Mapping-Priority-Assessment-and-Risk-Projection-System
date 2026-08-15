import { buildNlpViewReadOnly } from "@/lib/analysisView";
import { resolveLocationFromPersisted } from "@/lib/locationExtractionPipeline";
import type { ResolvedIncidentLocation } from "@/lib/locationExtractionPipeline";
import {
  buildAssessmentOverview,
  buildExecutiveSummary,
  buildHumanitarianNeedsReadOnly,
  buildIncidentMapZone,
  buildRiskProjectionReadOnly,
  buildTransparency,
  buildVerificationDetail,
  type AcademicTransparency,
  type AssessmentOverview,
  type ExecutiveSummaryItem,
  type HumanitarianNeedDetail,
  type HumanitarianNeedsView,
  type RiskProjectionDetail,
  type TimelineEvent,
  type VerificationDetail,
} from "@/lib/incidentEnrichment";
import { verificationRepository } from "@/repositories/verificationRepository";
import type { MapRiskZone, NLPAnalysisResult, PersistedAnalysisView, SourceVerificationSummary } from "@/types";
import type { EvaluationReportStatus } from "@/types/evaluation";
import type { AgreementLevel } from "@prisma/client";
import { timelineService } from "@/services/timelineService";
import {
  incidentCorrelationService,
  type MasterIncidentSummary,
} from "@/services/incidentCorrelationService";
import { masterIncidentIntelligenceRepository } from "@/repositories/masterIncidentIntelligenceRepository";
import { applyMasterIncidentIntelligence } from "@/lib/applyMasterIncidentIntelligence";
import type { MasterIncidentIntelligenceView } from "@/types/masterIncidentIntelligence";
import {
  getCachedIncident,
  getRequestCachedAnalysisView,
  setCachedIncident,
} from "@/services/incidentCache";
import { logViewReadOnlyComplete, logViewReadOnlyStart } from "@/lib/viewLogs";
import { prisma } from "@/lib/prisma";

function resolveEvaluationStatus(
  analystValidated: boolean | undefined,
  feedbackCount: number
): EvaluationReportStatus {
  if (analystValidated) return "Validated";
  if (feedbackCount > 0) return "Feedback submitted";
  return "Pending review";
}

async function fetchEvaluationStatus(reportId: string): Promise<EvaluationReportStatus> {
  const row = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      learningCase: { select: { analystValidated: true } },
      _count: { select: { analystFeedback: true } },
    },
  });
  if (!row) return "Pending review";
  return resolveEvaluationStatus(
    row.learningCase?.analystValidated,
    row._count.analystFeedback
  );
}

function mapVerificationRecord(
  record: NonNullable<Awaited<ReturnType<typeof verificationRepository.findLatestByIncident>>>
): SourceVerificationSummary {
  const sourceNames = Array.isArray(record.sourceNames)
    ? (record.sourceNames as string[])
    : [];

  const consistency = record.informationConsistencyScore / 100;
  let verificationStatus: SourceVerificationSummary["verificationStatus"] = "Single Source";
  if (record.comparedSources >= 2) {
    if (consistency >= 0.75) verificationStatus = "Verified";
    else if (consistency >= 0.5) verificationStatus = "Partially Corroborated";
    else verificationStatus = "Conflicting Sources";
  }

  return {
    id: record.id,
    consensusScore: record.consensusScore,
    agreementLevel: record.agreementLevel as AgreementLevel,
    comparedSources: record.comparedSources,
    sourceNames,
    sourceAgreementScore: record.sourceAgreementScore,
    informationConsistencyScore: record.informationConsistencyScore,
    sourceConsensusPercentage: record.sourceConsensusPercentage,
    finalConfidenceScore: record.finalConfidenceScore,
    country: record.country,
    city: record.city,
    crisisType: record.crisisType,
    verificationStatus,
    sourceDiversity: record.comparedSources / Math.max(sourceNames.length, 1),
    sourceReliability: record.finalConfidenceScore / 100,
    totalSources: sourceNames.length,
  };
}

export interface IncidentIntelligenceData {
  analysis: PersistedAnalysisView;
  verification: SourceVerificationSummary | null;
  nlp: NLPAnalysisResult;
  assessmentOverview: AssessmentOverview;
  executiveSummary: ExecutiveSummaryItem[];
  location: ResolvedIncidentLocation;
  humanitarianNeeds: HumanitarianNeedDetail[];
  humanitarianNeedsView: HumanitarianNeedsView;
  riskProjection: RiskProjectionDetail;
  timeline: TimelineEvent[];
  verificationDetail: VerificationDetail;
  transparency: AcademicTransparency;
  mapZone: MapRiskZone | null;
  evaluationStatus: EvaluationReportStatus;
  masterIncident: MasterIncidentSummary | null;
  masterIncidentIntelligence: MasterIncidentIntelligenceView | null;
}

export interface IncidentCoreData {
  analysis: PersistedAnalysisView;
  nlp: NLPAnalysisResult;
  assessmentOverview: AssessmentOverview;
  executiveSummary: ExecutiveSummaryItem[];
  location: ResolvedIncidentLocation;
  humanitarianNeeds: HumanitarianNeedDetail[];
  humanitarianNeedsView: HumanitarianNeedsView;
  riskProjection: RiskProjectionDetail;
  mapZone: MapRiskZone | null;
  verification: SourceVerificationSummary | null;
  evaluationStatus: EvaluationReportStatus;
  masterIncident: MasterIncidentSummary | null;
  masterIncidentIntelligence: MasterIncidentIntelligenceView | null;
}

export interface IncidentDeferredData {
  timeline: TimelineEvent[];
  verificationDetail: VerificationDetail;
  transparency: AcademicTransparency;
}

export class IncidentService {
  async getIncidentByReportId(
    reportId: string
  ): Promise<IncidentIntelligenceData | null> {
    const cached = getCachedIncident(reportId);
    if (cached) {
      logViewReadOnlyStart(reportId);
      logViewReadOnlyComplete(reportId, true);
      return cached;
    }

    const { getRequestCachedIncident } = await import("@/services/incidentCache");
    const data = await getRequestCachedIncident(reportId);
    if (data) setCachedIncident(reportId, data);
    return data;
  }

  async fetchIncidentByReportId(
    reportId: string
  ): Promise<IncidentIntelligenceData | null> {
    const analysis = await getRequestCachedAnalysisView(reportId);
    if (!analysis) return null;
    logViewReadOnlyStart(reportId);
    const core = await this.enrichCoreReadOnly(analysis);
    const deferred = await this.getIncidentDeferredByReportId(reportId, core);
    let data: IncidentIntelligenceData = {
      ...core,
      ...deferred,
    };
    if (core.masterIncidentIntelligence) {
      data = applyMasterIncidentIntelligence(data, core.masterIncidentIntelligence);
    }
    logViewReadOnlyComplete(reportId, false);
    return data;
  }

  async getIncidentCoreByReportId(
    reportId: string
  ): Promise<IncidentCoreData | null> {
    const analysis = await getRequestCachedAnalysisView(reportId);
    if (!analysis) return null;
    return this.enrichCoreReadOnly(analysis);
  }

  async getIncidentDeferredByReportId(
    reportId: string,
    core: IncidentCoreData
  ): Promise<IncidentDeferredData> {
    const [timeline, verificationDetail] = await Promise.all([
      this.loadPersistedTimeline(core.analysis),
      Promise.resolve(
        buildVerificationDetail(core.analysis, core.verification)
      ),
    ]);

    return {
      timeline,
      verificationDetail,
      transparency: buildTransparency(
        core.analysis,
        core.location,
        core.verification
      ),
    };
  }

  async enrichReadOnly(
    analysis: PersistedAnalysisView
  ): Promise<IncidentIntelligenceData> {
    const core = await this.enrichCoreReadOnly(analysis);
    const deferred = await this.getIncidentDeferredByReportId(
      analysis.report.id,
      core
    );

    if (!core.masterIncidentIntelligence) {
      return { ...core, ...deferred };
    }

    return applyMasterIncidentIntelligence(
      { ...core, ...deferred },
      core.masterIncidentIntelligence
    );
  }

  private async enrichCoreReadOnly(
    analysis: PersistedAnalysisView
  ): Promise<IncidentCoreData> {
    const nlp =
      analysis.nlp ??
      buildNlpViewReadOnly(analysis.extractedEntities, analysis.crisis);

    const location = resolveLocationFromPersisted(
      nlp.locations,
      analysis.locations
    );

    const verification = await this.fetchVerificationReadOnly(
      location,
      nlp,
      analysis
    );

    const humanitarianNeedsView = buildHumanitarianNeedsReadOnly(nlp);
    const [evaluationStatus, masterIncident, masterIncidentIntelligence] = await Promise.all([
      fetchEvaluationStatus(analysis.report.id),
      incidentCorrelationService.getForReport(analysis.report.id),
      masterIncidentIntelligenceRepository.findByReportId(analysis.report.id),
    ]);

    const core = {
      analysis,
      nlp,
      verification,
      assessmentOverview: buildAssessmentOverview(analysis, verification),
      executiveSummary: buildExecutiveSummary(analysis, nlp, location),
      location,
      humanitarianNeeds: humanitarianNeedsView.all,
      humanitarianNeedsView,
      riskProjection: buildRiskProjectionReadOnly(analysis, analysis.insight),
      mapZone: buildIncidentMapZone(analysis, location, nlp, verification),
      evaluationStatus,
      masterIncident,
      masterIncidentIntelligence,
    };

    if (!masterIncidentIntelligence) {
      return core;
    }

    const merged = applyMasterIncidentIntelligence(
      {
        ...core,
        timeline: [],
        verificationDetail: buildVerificationDetail(analysis, verification),
        transparency: buildTransparency(analysis, location, verification),
      },
      masterIncidentIntelligence
    );

    return {
      analysis: merged.analysis,
      nlp: merged.nlp,
      verification: merged.verification,
      assessmentOverview: merged.assessmentOverview,
      executiveSummary: merged.executiveSummary,
      location: merged.location,
      humanitarianNeeds: merged.humanitarianNeeds,
      humanitarianNeedsView: merged.humanitarianNeedsView,
      riskProjection: merged.riskProjection,
      mapZone: merged.mapZone,
      evaluationStatus: merged.evaluationStatus,
      masterIncident: merged.masterIncident,
      masterIncidentIntelligence,
    };
  }

  private async fetchVerificationReadOnly(
    location: ResolvedIncidentLocation,
    nlp: NLPAnalysisResult,
    analysis: PersistedAnalysisView
  ): Promise<SourceVerificationSummary | null> {
    const crossSource = analysis.insight?.crossSourceAnalysis;
    if (crossSource && typeof crossSource === "object") {
      const stored = crossSource as Partial<SourceVerificationSummary>;
      if (stored.verificationStatus) {
        return stored as SourceVerificationSummary;
      }
    }

    if (!location.city || !location.country || !nlp.crisisType) return null;
    const record = await verificationRepository.findLatestByIncident(
      location.country,
      location.city,
      nlp.crisisType
    );
    return record ? mapVerificationRecord(record) : null;
  }

  private async loadPersistedTimeline(
    analysis: PersistedAnalysisView
  ): Promise<TimelineEvent[]> {
    const persisted = await timelineService.getTimelineForReport(
      analysis.report.id,
      analysis.crisis?.id
    );

    return persisted.map((event) => ({
      time: event.time,
      title: event.title,
      description: event.description,
    }));
  }
}

export const incidentService = new IncidentService();
