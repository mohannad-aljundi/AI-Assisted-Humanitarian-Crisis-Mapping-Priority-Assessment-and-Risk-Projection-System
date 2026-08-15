import type {
  AssessmentOverview,
  ExecutiveSummaryItem,
  HumanitarianNeedDetail,
  HumanitarianNeedsView,
  RiskProjectionDetail,
  TimelineEvent,
} from "@/lib/incidentEnrichment";
import { trajectoryToRiskTrend } from "@/services/aiRiskProjectionService";
import { normalizeLegacyVerificationStatus } from "@/lib/evidenceVerificationStatus";
import type { IncidentIntelligenceData } from "@/services/incidentService";
import { sortHumanitarianNeedsByPriority } from "@/lib/humanitarianNeedsRanking";
import type { MasterIncidentIntelligenceView } from "@/types/masterIncidentIntelligence";

function severityToScore(severity: string): number {
  switch (severity.toLowerCase()) {
    case "critical":
      return 0.95;
    case "high":
      return 0.78;
    case "medium":
      return 0.55;
    default:
      return 0.35;
  }
}

export function applyMasterIncidentIntelligence(
  data: IncidentIntelligenceData,
  intelligence: MasterIncidentIntelligenceView
): IncidentIntelligenceData {
  const needs: HumanitarianNeedDetail[] = intelligence.humanitarianNeeds.map((need) => ({
    needType: need.needType,
    score: severityToScore(need.severity),
    confidence: need.confidence,
    reason: need.reasoning,
    severity: need.severity,
    source: need.observedBy.length > 0 ? ("Observed" as const) : ("Inferred" as const),
    evidence: need.observedBy.join(", "),
    reasoning: `${need.reasoning} (${need.supportingReportCount} supporting reports)`,
  }));

  const humanitarianNeedsView: HumanitarianNeedsView = {
    observed: needs.filter((need) => need.source === "Observed"),
    inferred: needs.filter((need) => need.source === "Inferred"),
    all: sortHumanitarianNeedsByPriority(needs),
    emptyReason: needs.length === 0 ? "No cluster-level needs synthesised yet." : null,
  };

  const executiveSummary: ExecutiveSummaryItem[] = [
    { label: "Master incident summary", value: intelligence.executiveSummary },
    { label: "What happened", value: intelligence.situationAssessment.whatHappened },
    { label: "Current impact", value: intelligence.situationAssessment.currentImpact },
    {
      label: "Confirmed across sources",
      value: intelligence.situationAssessment.confirmed.join(" · ") || "Under corroboration",
    },
    {
      label: "Remaining uncertainty",
      value: intelligence.situationAssessment.uncertain.join(" · ") || "None flagged",
    },
  ];

  const assessmentOverview: AssessmentOverview = {
    ...data.assessmentOverview,
    priority: intelligence.dynamicPriority.level,
    reliability: intelligence.sourceReliability.overallScore,
    confidence: intelligence.confidence,
    trend: trajectoryToRiskTrend(intelligence.riskProjection.trend),
    verificationStatus: intelligence.verification,
  };

  const riskProjection: RiskProjectionDetail = {
    currentLevel: intelligence.riskProjection.riskLevel,
    currentScore: intelligence.riskProjection.currentScore,
    forecast24h: intelligence.riskProjection.forecast24h,
    forecast72h: intelligence.riskProjection.forecast72h,
    forecast7d: intelligence.riskProjection.forecast7d,
    trend: trajectoryToRiskTrend(intelligence.riskProjection.trend),
    confidence: intelligence.riskProjection.confidence,
    reasoning: [
      intelligence.riskProjection.riskNarrative,
      intelligence.riskProjection.currentRiskReason,
      `24h: ${intelligence.riskProjection.forecast24hReason}`,
      `72h: ${intelligence.riskProjection.forecast72hReason}`,
      `7d: ${intelligence.riskProjection.forecast7dReason}`,
    ].filter(Boolean),
    analytical: intelligence.riskProjection,
    trajectorySummary: intelligence.riskProjection.riskNarrative,
  };

  const timeline: TimelineEvent[] = intelligence.timeline.map((event) => ({
    time: event.time,
    title: event.title,
    description:
      event.sources.length > 0
        ? `${event.description} (Sources: ${event.sources.join(", ")})`
        : event.description,
  }));

  return {
    ...data,
    analysis: {
      ...data.analysis,
      priorityAssessment: {
        ...data.analysis.priorityAssessment,
        priorityLevel: intelligence.dynamicPriority.level,
        severityScore: intelligence.dynamicPriority.score,
      },
      insight: data.analysis.insight
        ? {
            ...data.analysis.insight,
            analyticalRiskProjection: intelligence.riskProjection,
            crossSourceAnalysis: {
              ...(data.analysis.insight.crossSourceAnalysis ?? {}),
              verificationStatus: intelligence.verification,
              finalConfidenceScore: Math.round(intelligence.confidence * 100),
              sourceConsensusPercentage: Math.round(intelligence.consensus.agreementPercent),
              comparedSources: intelligence.consensus.independentSourceCount,
            },
          }
        : data.analysis.insight,
    },
    assessmentOverview,
    executiveSummary,
    humanitarianNeeds: humanitarianNeedsView.all,
    humanitarianNeedsView,
    riskProjection,
    timeline: timeline.length > 0 ? timeline : data.timeline,
    verificationDetail: {
      ...data.verificationDetail,
      status: normalizeLegacyVerificationStatus(intelligence.verification),
      statusReason: intelligence.analystNarrative,
      agreementPercent: Math.round(intelligence.consensus.agreementPercent),
      independentSources: intelligence.consensus.independentSourceCount,
      mostTrustedSource:
        intelligence.sourceReliability.sourceBreakdown[0]?.name ??
        data.verificationDetail.mostTrustedSource,
    },
  };
}
