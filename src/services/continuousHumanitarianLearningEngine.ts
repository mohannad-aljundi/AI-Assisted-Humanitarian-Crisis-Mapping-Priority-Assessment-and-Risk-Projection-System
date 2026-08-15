import { INTELLIGENCE_PIPELINE_VERSION } from "@/lib/explainabilityPresentation";
import { canonicalNeedKey } from "@/lib/humanitarianNeedTaxonomy";
import { learningRepository } from "@/repositories/learningRepository";
import type {
  ChleLearningContext,
  LearningInfluenceTrace,
  LearningNeedSnapshot,
  SimilarIncidentMatch,
  SubmitFeedbackInput,
} from "@/types/learning";
import type { ExtractedHumanitarianNeed, ExtendedAnalysisInsight, NLPAnalysisResult } from "@/types";
import type { CorrectionField, PriorityLevel, RiskLevel } from "@prisma/client";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "were", "was", "are", "has", "have",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function parseNeeds(json: unknown): LearningNeedSnapshot[] {
  if (!Array.isArray(json)) return [];
  return json as LearningNeedSnapshot[];
}

export interface RecordAnalysisSnapshotInput {
  reportId: string;
  title: string;
  content: string;
  nlp: NLPAnalysisResult;
  priorityLevel?: PriorityLevel | null;
  riskLevel?: RiskLevel | null;
  reliabilityScore?: number | null;
  insight?: ExtendedAnalysisInsight | null;
  contentFingerprint?: string | null;
}

export class ContinuousHumanitarianLearningEngine {
  async recordAnalysisSnapshot(input: RecordAnalysisSnapshotInput): Promise<void> {
    const reasoning = input.insight?.humanitarianReasoning;
    const needs: LearningNeedSnapshot[] = input.nlp.humanitarianNeeds.map((n) => ({
      needType: n.needType,
      severity: n.severity,
      source: n.source ?? null,
      evidence: n.evidence ?? n.reason ?? null,
      reasoning: n.reasoning ?? n.reason ?? null,
      confidence: n.confidence ?? null,
    }));

    await learningRepository.upsertLearningCase({
      reportId: input.reportId,
      title: input.title,
      crisisType: input.nlp.crisisType,
      country: input.nlp.locations[0]?.name?.split(",").pop()?.trim() ?? null,
      city: input.nlp.locations[0]?.name?.split(",")[0]?.trim() ?? null,
      reportPurpose: reasoning?.reportPurpose ?? null,
      crisisPhase: reasoning?.crisisPhase ?? null,
      priorityLevel: input.priorityLevel ?? null,
      riskLevel: input.riskLevel ?? null,
      reliabilityScore: input.reliabilityScore ?? null,
      confidenceLevel: input.insight?.confidenceLevel ?? null,
      humanitarianNeeds: needs,
      evidence: input.insight?.evidence ?? [],
      contentFingerprint: input.contentFingerprint ?? null,
      pipelineVersion: INTELLIGENCE_PIPELINE_VERSION,
    });
  }

  async submitAnalystFeedback(input: SubmitFeedbackInput) {
    const feedback = await learningRepository.createAnalystFeedback(
      input.reportId,
      input.analystId,
      input.summary
    );

    const learningCase = await learningRepository.findLearningCaseByReportId(input.reportId);
    const examples = [];

    for (const correction of input.corrections) {
      const example = await learningRepository.createLearningExample({
        reportId: input.reportId,
        learningCaseId: learningCase?.id,
        feedbackId: feedback.id,
        field: correction.field,
        originalValue: correction.originalValue,
        correctedValue: correction.correctedValue,
        reason: correction.reason,
        evidence: correction.evidence,
        analystId: correction.analystId ?? input.analystId,
        pipelineVersion: INTELLIGENCE_PIPELINE_VERSION,
      });
      examples.push(example);

      await this.processCorrectionLearning(correction, input.reportId, input.analystId);
    }

    if (examples.length > 0) {
      await learningRepository.markCaseValidated(input.reportId, input.analystId);
    }

    return { feedback, examples };
  }

  private async processCorrectionLearning(
    correction: SubmitFeedbackInput["corrections"][number],
    reportId: string,
    analystId?: string
  ): Promise<void> {
    const original = JSON.stringify(correction.originalValue);
    const corrected = JSON.stringify(correction.correctedValue);

    if (correction.field === "REPORT_PURPOSE" || correction.field === "CRISIS_PHASE") {
      await learningRepository.upsertInferenceMemory({
        memoryKey: `${correction.field}:${original.slice(0, 80)}`,
        mistakeType: correction.field,
        contextPattern: original,
        incorrectConclusion: original,
        correctConclusion: corrected,
        reason:
          correction.reason ??
          `Analyst corrected ${correction.field} classification for this report type.`,
        sourceReportId: reportId,
        analystId,
      });
    }

    if (correction.field === "HUMANITARIAN_NEED" && correction.evidence) {
      const patternKey = `${canonicalNeedKey(correction.evidence.slice(0, 60))}→${corrected}`;
      await learningRepository.upsertReasoningPattern({
        patternKey,
        evidencePattern: correction.evidence,
        inferredOutcome: corrected,
        outcomeType: "humanitarian_need",
        sourceReportId: reportId,
        validated: true,
      });
    }

    const contextKey = `${correction.field}`;
    await learningRepository.adjustConfidenceCalibration(contextKey, corrected, false);
    await learningRepository.adjustConfidenceCalibration(contextKey, original, true);
  }

  async findSimilarIncidents(params: {
    reportId?: string;
    title: string;
    content: string;
    crisisType?: string | null;
    country?: string | null;
    city?: string | null;
    reportPurpose?: string | null;
    crisisPhase?: string | null;
    priorityLevel?: PriorityLevel | null;
    limit?: number;
  }): Promise<SimilarIncidentMatch[]> {
    const cases = await learningRepository.listAllLearningCases(300);
    const contentTokens = tokenize(`${params.title} ${params.content}`);
    const results: SimilarIncidentMatch[] = [];

    for (const learningCase of cases) {
      if (learningCase.reportId === params.reportId) continue;

      const reasons: string[] = [];
      let score = 0;

      if (
        params.crisisType &&
        learningCase.crisisType &&
        params.crisisType.toLowerCase() === learningCase.crisisType.toLowerCase()
      ) {
        score += 0.25;
        reasons.push(`Same crisis type (${learningCase.crisisType})`);
      }

      if (params.country && learningCase.country) {
        if (params.country.toLowerCase() === learningCase.country.toLowerCase()) {
          score += 0.15;
          reasons.push(`Same country (${learningCase.country})`);
        }
      }

      if (
        params.reportPurpose &&
        learningCase.reportPurpose &&
        params.reportPurpose === learningCase.reportPurpose
      ) {
        score += 0.2;
        reasons.push(`Same report purpose (${learningCase.reportPurpose})`);
      }

      if (
        params.crisisPhase &&
        learningCase.crisisPhase &&
        params.crisisPhase === learningCase.crisisPhase
      ) {
        score += 0.15;
        reasons.push(`Same crisis phase (${learningCase.crisisPhase})`);
      }

      const caseTokens = tokenize(learningCase.title);
      const textSimilarity = jaccard(contentTokens, caseTokens);
      if (textSimilarity > 0.1) {
        score += textSimilarity * 0.35;
        reasons.push(`Text similarity ${Math.round(textSimilarity * 100)}%`);
      }

      if (learningCase.analystValidated) {
        score += 0.1;
        reasons.push("Analyst-validated case");
      }

      if (score < 0.2) continue;

      const needs = parseNeeds(learningCase.humanitarianNeedsJson);
      const assessmentDifference = this.describeAssessmentDifference(params, learningCase, needs);

      results.push({
        reportId: learningCase.reportId,
        title: learningCase.title,
        crisisType: learningCase.crisisType,
        country: learningCase.country,
        city: learningCase.city,
        reportPurpose: learningCase.reportPurpose,
        crisisPhase: learningCase.crisisPhase,
        priorityLevel: learningCase.priorityLevel,
        riskLevel: learningCase.riskLevel,
        similarityScore: Math.min(1, score),
        similarityReasons: reasons,
        humanitarianNeeds: needs,
        analystValidated: learningCase.analystValidated,
        assessmentDifference,
      });
    }

    return results
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, params.limit ?? 5);
  }

  private describeAssessmentDifference(
    current: {
      priorityLevel?: PriorityLevel | null;
      crisisType?: string | null;
      reportPurpose?: string | null;
    },
    historical: {
      priorityLevel: PriorityLevel | null;
      crisisType: string | null;
      reportPurpose: string | null;
    },
    historicalNeeds: LearningNeedSnapshot[]
  ): string {
    const parts: string[] = [];
    if (
      current.priorityLevel &&
      historical.priorityLevel &&
      current.priorityLevel !== historical.priorityLevel
    ) {
      parts.push(
        `Priority differs: current ${current.priorityLevel} vs historical ${historical.priorityLevel}`
      );
    }
    if (
      current.reportPurpose &&
      historical.reportPurpose &&
      current.reportPurpose !== historical.reportPurpose
    ) {
      parts.push(
        `Report purpose differs: current ${current.reportPurpose} vs historical ${historical.reportPurpose}`
      );
    }
    if (historicalNeeds.length > 0) {
      parts.push(
        `Historical needs: ${historicalNeeds.map((n) => n.needType).join(", ")}`
      );
    }
    return parts.length > 0 ? parts.join(". ") : "Broadly similar humanitarian context.";
  }

  async buildLearningContext(params: {
    reportId?: string;
    title: string;
    content: string;
    crisisType?: string | null;
    country?: string | null;
    city?: string | null;
    reportPurpose?: string | null;
    crisisPhase?: string | null;
    priorityLevel?: PriorityLevel | null;
    needs?: ExtractedHumanitarianNeed[];
  }): Promise<ChleLearningContext> {
    const similarCases = await this.findSimilarIncidents({
      reportId: params.reportId,
      title: params.title,
      content: params.content,
      crisisType: params.crisisType,
      country: params.country,
      city: params.city,
      reportPurpose: params.reportPurpose,
      crisisPhase: params.crisisPhase,
      priorityLevel: params.priorityLevel,
      limit: 5,
    });

    const patterns = await learningRepository.listReasoningPatterns(30);
    const contentLower = `${params.title} ${params.content}`.toLowerCase();
    const relevantPatterns = patterns
      .filter((p) => contentLower.includes(p.evidencePattern.toLowerCase().slice(0, 40)))
      .slice(0, 8)
      .map((p) => ({
        evidencePattern: p.evidencePattern,
        inferredOutcome: p.inferredOutcome,
        confidenceBoost: p.confidenceBoost,
        occurrenceCount: p.occurrenceCount,
      }));

    const memories = await learningRepository.listInferenceMemories(30);
    const mistakeWarnings = memories
      .filter((m) => {
        const pattern = m.contextPattern.toLowerCase();
        return pattern.length > 8 && contentLower.includes(pattern.slice(0, 30));
      })
      .slice(0, 5)
      .map((m) => ({
        contextPattern: m.contextPattern,
        incorrectConclusion: m.incorrectConclusion,
        correctConclusion: m.correctConclusion,
        reason: m.reason,
      }));

    const contextKey = [
      params.crisisType ?? "unknown",
      params.reportPurpose ?? "unknown",
      params.crisisPhase ?? "unknown",
    ].join("|");

    const calibrations = await learningRepository.getCalibrationsForContext(contextKey);
    const confidenceAdjustments: Record<string, number> = {};
    for (const cal of calibrations) {
      confidenceAdjustments[cal.dimension] = cal.adjustment;
    }

    const examples = params.reportId
      ? await learningRepository.listLearningExamples(params.reportId)
      : [];

    const influencedByReportIds = similarCases.map((c) => c.reportId);
    const influencedByExampleIds = examples.map((e) => e.id);

    const learningInfluenceSummary = this.buildInfluenceSummary({
      similarCases,
      relevantPatterns,
      mistakeWarnings,
      influencedByReportIds,
      influencedByExampleIds,
    });

    return {
      similarCases,
      relevantPatterns,
      mistakeWarnings,
      confidenceAdjustments,
      learningInfluenceSummary,
      influencedByReportIds,
      influencedByExampleIds,
    };
  }

  buildCaseBasedPromptSection(context: ChleLearningContext): string {
    if (
      context.similarCases.length === 0 &&
      context.relevantPatterns.length === 0 &&
      context.mistakeWarnings.length === 0
    ) {
      return "";
    }

    const sections: string[] = [
      "=== CONTINUOUS HUMANITARIAN LEARNING (transparent, human-validated — not opaque ML) ===",
      context.learningInfluenceSummary,
    ];

    if (context.similarCases.length > 0) {
      sections.push("", "SIMILAR VALIDATED INCIDENTS:");
      for (const match of context.similarCases.slice(0, 3)) {
        sections.push(
          `- [${Math.round(match.similarityScore * 100)}% similar] ${match.title}`,
          `  Purpose: ${match.reportPurpose ?? "—"} | Phase: ${match.crisisPhase ?? "—"} | Priority: ${match.priorityLevel ?? "—"}`,
          `  Needs: ${match.humanitarianNeeds.map((n) => n.needType).join(", ") || "none"}`,
          `  Why similar: ${match.similarityReasons.join("; ")}`,
          `  Difference: ${match.assessmentDifference}`
        );
      }
    }

    if (context.mistakeWarnings.length > 0) {
      sections.push("", "KNOWN REASONING MISTAKES TO AVOID:");
      for (const warning of context.mistakeWarnings) {
        sections.push(
          `- Do NOT conclude "${warning.incorrectConclusion}" when context matches "${warning.contextPattern}".`,
          `  Prefer: "${warning.correctConclusion}". Reason: ${warning.reason}`
        );
      }
    }

    if (context.relevantPatterns.length > 0) {
      sections.push("", "VALIDATED EVIDENCE→NEED PATTERNS:");
      for (const pattern of context.relevantPatterns.slice(0, 5)) {
        sections.push(
          `- Evidence "${pattern.evidencePattern}" → ${pattern.inferredOutcome} (seen ${pattern.occurrenceCount}×, confidence +${Math.round(pattern.confidenceBoost * 100)}%)`
        );
      }
    }

    sections.push(
      "",
      "Use this institutional memory to inform reasoning. Every decision must still cite explicit evidence from the CURRENT report."
    );

    return sections.join("\n");
  }

  applyConfidenceCalibration(
    needs: ExtractedHumanitarianNeed[],
    context: ChleLearningContext
  ): ExtractedHumanitarianNeed[] {
    return needs.map((need) => {
      const key = canonicalNeedKey(need.needType);
      const adjustment =
        context.confidenceAdjustments[key] ??
        context.confidenceAdjustments["HUMANITARIAN_NEED"] ??
        0;

      if (!need.confidence || adjustment === 0) return need;

      return {
        ...need,
        confidence: Math.max(0.1, Math.min(1, need.confidence + adjustment)),
      };
    });
  }

  buildInfluenceTrace(context: ChleLearningContext): LearningInfluenceTrace {
    return {
      summary: context.learningInfluenceSummary,
      similarReportIds: context.influencedByReportIds,
      exampleIds: context.influencedByExampleIds,
      patternKeys: context.relevantPatterns.map((p) => p.evidencePattern),
      memoryKeys: context.mistakeWarnings.map((m) => m.contextPattern),
      calibrationKeys: Object.keys(context.confidenceAdjustments),
    };
  }

  private buildInfluenceSummary(params: {
    similarCases: SimilarIncidentMatch[];
    relevantPatterns: ChleLearningContext["relevantPatterns"];
    mistakeWarnings: ChleLearningContext["mistakeWarnings"];
    influencedByReportIds: string[];
    influencedByExampleIds: string[];
  }): string {
    const parts: string[] = [];

    if (params.similarCases.length > 0) {
      parts.push(
        `${params.similarCases.length} similar historical incident(s) informed this assessment.`
      );
    }
    if (params.relevantPatterns.length > 0) {
      parts.push(
        `${params.relevantPatterns.length} validated evidence pattern(s) from prior cases applied.`
      );
    }
    if (params.mistakeWarnings.length > 0) {
      parts.push(
        `${params.mistakeWarnings.length} known reasoning mistake(s) checked to avoid repeat errors.`
      );
    }
    if (params.influencedByExampleIds.length > 0) {
      parts.push(
        `${params.influencedByExampleIds.length} prior analyst correction(s) on this report considered.`
      );
    }
    if (parts.length === 0) {
      return "No prior learning cases influenced this assessment — baseline analyst reasoning applied.";
    }
    return parts.join(" ");
  }

  async listCorrections(reportId: string) {
    return learningRepository.listLearningExamples(reportId);
  }
}

export const continuousHumanitarianLearningEngine = new ContinuousHumanitarianLearningEngine();
