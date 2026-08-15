import type { PriorityLevel, RiskLevel } from "@prisma/client";
import { callAiJson, isAiAvailable } from "@/lib/aiResolver";
import { resolveConfiguredAiModel } from "@/lib/intelligencePipelineDescription";
import {
  classifyAiFailure,
  formatAiFailureReason,
  sleep,
} from "@/lib/aiAssessmentUtils";
import { scoreToPriorityLevel } from "@/lib/correlationVerificationStatus";
import { MASTER_INCIDENT_INTELLIGENCE_VERSION } from "@/lib/pipelineVersions";
import { clamp, roundTo } from "@/lib/utils";
import { masterIncidentRepository } from "@/repositories/masterIncidentRepository";
import { masterIncidentIntelligenceRepository } from "@/repositories/masterIncidentIntelligenceRepository";
import { continuousHumanitarianLearningEngine } from "@/services/continuousHumanitarianLearningEngine";
import type {
  ClusterReportInput,
  MasterIncidentIntelligenceView,
} from "@/types/masterIncidentIntelligence";
import type { AnalyticalRiskProjection, RiskTrajectoryTrend } from "@/types";
import { invalidateCache } from "@/lib/simpleCache";
import { invalidateIncidentCache } from "@/services/incidentCache";

const SYSTEM_INSTRUCTION =
  "You are a senior humanitarian intelligence analyst synthesising multiple independent crisis reports into one master incident assessment. Return only valid JSON. Reason across all sources — do not copy one report. Identify corroboration, conflict, and gaps.";

const RESPONSE_SCHEMA = `{
  "executiveSummary": "Professional 3-5 sentence humanitarian intelligence summary of the entire incident cluster",
  "situationAssessment": {
    "whatHappened": "What happened across corroborated sources",
    "severity": "Overall severity assessment",
    "currentImpact": "Current humanitarian impact on affected populations and infrastructure",
    "confirmed": ["Fact confirmed by multiple independent sources"],
    "uncertain": ["Claims that remain unverified or contradictory"]
  },
  "humanitarianNeeds": [
    {
      "needType": "Medical",
      "severity": "Critical",
      "priority": "Immediate",
      "confidence": 0.85,
      "reasoning": "Why this need is prioritised based on cross-report evidence",
      "observedBy": ["Reuters", "UN News"],
      "supportingReportCount": 3
    }
  ],
  "evidenceMatrix": [
    {
      "conclusion": "Large-scale infrastructure damage confirmed",
      "observedBy": ["Reuters", "ReliefWeb"],
      "confidence": 0.88,
      "evidenceStrength": 0.82,
      "supportingReports": ["Report title A", "Report title B"],
      "contradictingReports": []
    }
  ],
  "consensus": {
    "agreementPercent": 87,
    "conflictPercent": 8,
    "missingEvidence": ["Independent casualty verification still lacking"],
    "independentSourceCount": 6,
    "trustedSourceCount": 4,
    "timelineConsistency": 0.91
  },
  "dynamicPriority": {
    "level": "Critical",
    "score": 0.88,
    "reasoning": "Why this priority level given severity, sources, agreement, escalation",
    "factors": ["6 independent sources", "87% agreement", "Recent deterioration"]
  },
  "priorityReasoning": "2-4 sentences on dynamic priority calculation",
  "riskProjection": {
    "currentScore": 78,
    "forecast24h": 82,
    "forecast72h": 85,
    "forecast7d": 80,
    "trend": "worsening",
    "riskLevel": "High",
    "confidence": 0.84,
    "riskNarrative": "Overall risk trajectory narrative",
    "currentRiskReason": "Why current risk is at this level",
    "forecast24hReason": "Why 24h outlook",
    "forecast72hReason": "Why 72h outlook",
    "forecast7dReason": "Why 7d outlook",
    "riskDrivers": ["Specific escalating factor"],
    "riskMitigatingFactors": ["Factor that could reduce risk"],
    "uncertainties": ["Unknown that could change forecast"],
    "similarCasesInfluence": ["How historical similar cases inform forecast"]
  },
  "analystNarrative": "Complete analyst narrative referencing source count, agreement, trusted orgs, and trajectory",
  "timeline": [
    {
      "time": "2025-01-15",
      "title": "Initial earthquake reported",
      "description": "What multiple sources reported at this point",
      "sources": ["Reuters", "UN News"]
    }
  ],
  "sourceReliability": {
    "overallScore": 0.76,
    "narrative": "Overall incident-level source reliability assessment",
    "sourceBreakdown": [
      { "name": "Reuters", "credibility": 0.85, "role": "Primary corroboration on impact scale" }
    ]
  },
  "confidence": 0.84,
  "verification": "Multi-source Verified"
}`;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed > 1 && parsed <= 100) return clamp(parsed / 100, 0, 1);
  return clamp(parsed, 0, 1);
}

function asPercent(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed > 1 ? parsed : parsed * 100, 0, 100);
}

function asPriority(value: unknown, fallback: PriorityLevel): PriorityLevel {
  const levels: PriorityLevel[] = ["Low", "Medium", "High", "Critical"];
  return levels.includes(value as PriorityLevel) ? (value as PriorityLevel) : fallback;
}

function asRiskLevel(value: unknown, fallback: RiskLevel): RiskLevel {
  const levels: RiskLevel[] = ["Low", "Medium", "High", "Critical"];
  return levels.includes(value as RiskLevel) ? (value as RiskLevel) : fallback;
}

function asTrend(value: unknown, fallback: RiskTrajectoryTrend): RiskTrajectoryTrend {
  if (value === "improving" || value === "stable" || value === "worsening") return value;
  return fallback;
}

function mapReportsToInputs(
  reports: NonNullable<
    Awaited<ReturnType<typeof masterIncidentRepository.getClusterReportsForIntelligence>>
  >["reports"]
): ClusterReportInput[] {
  return reports
    .filter((report): report is NonNullable<typeof report> => report !== null)
    .map((report) => {
    const finalReasoning = report.insight?.finalReasoning as
      | { conclusion?: string }
      | null
      | undefined;
    const needs = report.extractedEntities
      .filter((entity) => entity.entityType === "HUMANITARIAN_NEED")
      .map((entity) => ({
        needType: entity.value,
        severity: entity.severity ?? "Medium",
        evidence: entity.value,
      }));

    const location = report.extractedEntities.find((e) => e.entityType === "LOCATION")?.value ?? null;
    const crisisType =
      report.extractedEntities.find((e) => e.entityType === "CRISIS_TYPE")?.value ?? null;

    return {
      reportId: report.id,
      title: report.title,
      sourceName: report.source.name,
      sourceCredibility: report.source.credibilityScore,
      reportDate: report.reportDate.toISOString(),
      contentExcerpt: report.content.slice(0, 2500),
      crisisType,
      location,
      situationSummary: report.insight?.situationSummary ?? null,
      priorityLevel: report.priorityAssessment?.priorityLevel ?? null,
      severityScore: report.priorityAssessment?.severityScore ?? null,
      reliabilityScore: report.reliabilityAssessment?.finalScore ?? null,
      riskLevel: report.crisis?.riskProjections[0]?.riskLevel ?? null,
      humanitarianNeeds: needs,
      executiveConclusion: finalReasoning?.conclusion ?? null,
    };
  });
}

function buildPrompt(
  clusterTitle: string,
  clusterMetrics: {
    supportingReportCount: number;
    independentSourceCount: number;
    sourceAgreementPercent: number;
    correlationVerificationStatus: string;
  },
  reports: ClusterReportInput[],
  chleSection: string
): string {
  const reportBlocks = reports
    .map(
      (report, index) =>
        [
          `--- REPORT ${index + 1} ---`,
          `Title: ${report.title}`,
          `Source: ${report.sourceName} (credibility ${Math.round(report.sourceCredibility * 100)}%)`,
          `Date: ${report.reportDate}`,
          `Location: ${report.location ?? "Unknown"}`,
          `Priority: ${report.priorityLevel ?? "N/A"} | Reliability: ${report.reliabilityScore !== null ? Math.round(report.reliabilityScore * 100) + "%" : "N/A"}`,
          `Situation summary: ${report.situationSummary ?? "N/A"}`,
          `Needs mentioned: ${report.humanitarianNeeds.map((n) => n.needType).join(", ") || "None extracted"}`,
          `Excerpt: ${report.contentExcerpt}`,
        ].join("\n")
    )
    .join("\n\n");

  return [
    `MASTER INCIDENT: ${clusterTitle}`,
    `Linked reports: ${clusterMetrics.supportingReportCount}`,
    `Independent sources: ${clusterMetrics.independentSourceCount}`,
    `Deterministic agreement: ${Math.round(clusterMetrics.sourceAgreementPercent)}%`,
    `Correlation status: ${clusterMetrics.correlationVerificationStatus}`,
    "",
    "Synthesise ALL reports below into ONE unified humanitarian intelligence assessment.",
    "Do NOT treat reports independently in the output — merge, corroborate, and reason across them.",
    "",
    chleSection ? `INSTITUTIONAL MEMORY:\n${chleSection}\n` : "",
    reportBlocks,
    "",
    "Return strict JSON matching this schema:",
    RESPONSE_SCHEMA,
  ].join("\n");
}

function parseRiskProjection(raw: unknown, fallback: AnalyticalRiskProjection): AnalyticalRiskProjection {
  if (!raw || typeof raw !== "object") return fallback;
  const data = raw as Record<string, unknown>;
  return {
    currentScore: clamp(Number(data.currentScore) || fallback.currentScore, 5, 98),
    forecast24h: clamp(Number(data.forecast24h) || fallback.forecast24h, 5, 98),
    forecast72h: clamp(Number(data.forecast72h) || fallback.forecast72h, 5, 98),
    forecast7d: clamp(Number(data.forecast7d) || fallback.forecast7d, 5, 98),
    trend: asTrend(data.trend, fallback.trend),
    riskLevel: asRiskLevel(data.riskLevel, fallback.riskLevel),
    confidence: asScore(data.confidence, fallback.confidence),
    riskNarrative: asString(data.riskNarrative, fallback.riskNarrative),
    currentRiskReason: asString(data.currentRiskReason, fallback.currentRiskReason),
    forecast24hReason: asString(data.forecast24hReason, fallback.forecast24hReason),
    forecast72hReason: asString(data.forecast72hReason, fallback.forecast72hReason),
    forecast7dReason: asString(data.forecast7dReason, fallback.forecast7dReason),
    riskDrivers: asStringArray(data.riskDrivers),
    riskMitigatingFactors: asStringArray(data.riskMitigatingFactors),
    uncertainties: asStringArray(data.uncertainties),
    similarCasesInfluence: asStringArray(data.similarCasesInfluence),
  };
}

function defaultRiskProjection(): AnalyticalRiskProjection {
  return {
    currentScore: 55,
    forecast24h: 55,
    forecast72h: 52,
    forecast7d: 50,
    trend: "stable",
    riskLevel: "Medium",
    confidence: 0.5,
    riskNarrative: "Risk projection pending full cluster synthesis.",
    currentRiskReason: "Insufficient cross-source synthesis.",
    forecast24hReason: "Monitoring incoming reports.",
    forecast72hReason: "Monitoring incoming reports.",
    forecast7dReason: "Monitoring incoming reports.",
    riskDrivers: [],
    riskMitigatingFactors: [],
    uncertainties: ["Full cluster intelligence not yet synthesised"],
    similarCasesInfluence: [],
  };
}

function parseResponse(
  raw: Record<string, unknown>,
  masterIncidentId: string,
  sourceReportIds: string[],
  memberCount: number
): Omit<MasterIncidentIntelligenceView, "id" | "lastAnalysed"> {
  const situation = (raw.situationAssessment as Record<string, unknown>) ?? {};
  const consensusRaw = (raw.consensus as Record<string, unknown>) ?? {};
  const dynamicRaw = (raw.dynamicPriority as Record<string, unknown>) ?? {};
  const priorityScore = asScore(dynamicRaw.score, 0.5);
  const dynamicLevel = asPriority(dynamicRaw.level, scoreToPriorityLevel(priorityScore));
  const sourceReliabilityRaw = (raw.sourceReliability as Record<string, unknown>) ?? {};

  return {
    masterIncidentId,
    executiveSummary: asString(
      raw.executiveSummary,
      "Master incident intelligence synthesis unavailable."
    ),
    situationAssessment: {
      whatHappened: asString(situation.whatHappened, "Situation under assessment."),
      severity: asString(situation.severity, "Moderate"),
      currentImpact: asString(situation.currentImpact, "Impact being corroborated across sources."),
      confirmed: asStringArray(situation.confirmed),
      uncertain: asStringArray(situation.uncertain),
    },
    humanitarianNeeds: Array.isArray(raw.humanitarianNeeds)
      ? (raw.humanitarianNeeds as Record<string, unknown>[]).map((need) => ({
          needType: asString(need.needType, "General assistance"),
          severity: asString(need.severity, "Medium"),
          priority: asString(need.priority, "Standard"),
          confidence: asScore(need.confidence, 0.5),
          reasoning: asString(need.reasoning, "Cross-report synthesis."),
          observedBy: asStringArray(need.observedBy),
          supportingReportCount: Number(need.supportingReportCount) || 1,
        }))
      : [],
    evidenceMatrix: Array.isArray(raw.evidenceMatrix)
      ? (raw.evidenceMatrix as Record<string, unknown>[]).map((entry) => ({
          conclusion: asString(entry.conclusion, "Assessment"),
          observedBy: asStringArray(entry.observedBy),
          confidence: asScore(entry.confidence, 0.5),
          evidenceStrength: asScore(entry.evidenceStrength, 0.5),
          supportingReports: asStringArray(entry.supportingReports),
          contradictingReports: asStringArray(entry.contradictingReports),
        }))
      : [],
    consensus: {
      agreementPercent: asPercent(consensusRaw.agreementPercent, 50),
      conflictPercent: asPercent(consensusRaw.conflictPercent, 0),
      missingEvidence: asStringArray(consensusRaw.missingEvidence),
      independentSourceCount: Number(consensusRaw.independentSourceCount) || sourceReportIds.length,
      trustedSourceCount: Number(consensusRaw.trustedSourceCount) || 0,
      timelineConsistency: asScore(consensusRaw.timelineConsistency, 0.8),
    },
    dynamicPriority: {
      level: dynamicLevel,
      score: priorityScore,
      reasoning: asString(dynamicRaw.reasoning, "Priority derived from cluster synthesis."),
      factors: asStringArray(dynamicRaw.factors),
    },
    priorityReasoning: asString(raw.priorityReasoning, "") || null,
    riskProjection: parseRiskProjection(raw.riskProjection, defaultRiskProjection()),
    analystNarrative: asString(
      raw.analystNarrative,
      asString(raw.executiveSummary, "Analyst narrative unavailable.")
    ),
    timeline: Array.isArray(raw.timeline)
      ? (raw.timeline as Record<string, unknown>[]).map((event) => ({
          time: asString(event.time, ""),
          title: asString(event.title, "Event"),
          description: asString(event.description, ""),
          sources: asStringArray(event.sources),
        }))
      : [],
    sourceReliability: {
      overallScore: asScore(sourceReliabilityRaw.overallScore, 0.5),
      narrative: asString(
        sourceReliabilityRaw.narrative,
        "Source reliability assessed at incident level."
      ),
      sourceBreakdown: Array.isArray(sourceReliabilityRaw.sourceBreakdown)
        ? (sourceReliabilityRaw.sourceBreakdown as Record<string, unknown>[]).map((source) => ({
            name: asString(source.name, "Source"),
            credibility: asScore(source.credibility, 0.5),
            role: asString(source.role, "Contributor"),
          }))
        : [],
    },
    confidence: asScore(raw.confidence, 0.5),
    verification: asString(raw.verification, "Pending Review"),
    pipelineVersion: MASTER_INCIDENT_INTELLIGENCE_VERSION,
    sourceReportIds,
    memberCountAtAnalysis: memberCount,
    aiModel: resolveConfiguredAiModel(),
  };
}

export class MasterIncidentIntelligenceService {
  async synthesizeIfNeeded(
    masterIncidentId: string,
    currentMemberCount: number
  ): Promise<MasterIncidentIntelligenceView | null> {
    const existing = await masterIncidentIntelligenceRepository.findByMasterIncidentId(
      masterIncidentId
    );

    if (
      existing &&
      existing.pipelineVersion === MASTER_INCIDENT_INTELLIGENCE_VERSION &&
      existing.memberCountAtAnalysis === currentMemberCount
    ) {
      return existing;
    }

    return this.synthesize(masterIncidentId, { force: true });
  }

  async synthesize(
    masterIncidentId: string,
    options?: { force?: boolean }
  ): Promise<MasterIncidentIntelligenceView | null> {
    const bundle = await masterIncidentRepository.getClusterReportsForIntelligence(
      masterIncidentId
    );
    if (!bundle || bundle.reports.length === 0) return null;

    const { cluster, reports } = bundle;
    const reportInputs = mapReportsToInputs(reports);
    const sourceReportIds = reportInputs.map((report) => report.reportId);

    if (!options?.force) {
      const existing = await masterIncidentIntelligenceRepository.findByMasterIncidentId(
        masterIncidentId
      );
      if (
        existing &&
        existing.pipelineVersion === MASTER_INCIDENT_INTELLIGENCE_VERSION &&
        existing.memberCountAtAnalysis === reportInputs.length
      ) {
        return existing;
      }
    }

    if (!isAiAvailable()) {
      console.warn(
        `[MasterIncidentIntelligence] AI not configured — skipping synthesis for ${masterIncidentId}`
      );
      return null;
    }

    const canonical = reportInputs.find((r) => r.reportId === cluster.canonicalReportId);
    let chleSection = "";
    if (canonical) {
      try {
        const context = await continuousHumanitarianLearningEngine.buildLearningContext({
          reportId: canonical.reportId,
          title: canonical.title,
          content: canonical.contentExcerpt,
          crisisType: canonical.crisisType ?? cluster.crisisType,
          country: cluster.country,
          city: cluster.city,
        });
        chleSection = continuousHumanitarianLearningEngine.buildCaseBasedPromptSection(context);
      } catch {
        chleSection = "";
      }
    }

    const prompt = buildPrompt(
      cluster.title,
      {
        supportingReportCount: cluster.supportingReportCount,
        independentSourceCount: cluster.independentSourceCount,
        sourceAgreementPercent: cluster.sourceAgreementPercent,
        correlationVerificationStatus: cluster.correlationVerificationStatus,
      },
      reportInputs,
      chleSection
    );

    let parsed: Omit<MasterIncidentIntelligenceView, "id" | "lastAnalysed"> | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await callAiJson(prompt, SYSTEM_INSTRUCTION);
        if (!raw || typeof raw !== "object") throw new Error("Invalid AI response");
        parsed = parseResponse(
          raw as Record<string, unknown>,
          masterIncidentId,
          sourceReportIds,
          reportInputs.length
        );
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await sleep(700);
      }
    }

    if (!parsed) {
      console.error(
        `[MasterIncidentIntelligence] synthesis failed for ${masterIncidentId}:`,
        formatAiFailureReason(classifyAiFailure(lastError))
      );
      return null;
    }

    const saved = await masterIncidentIntelligenceRepository.upsert(masterIncidentId, {
      executiveSummary: parsed.executiveSummary,
      situationAssessment: parsed.situationAssessment as object,
      humanitarianNeeds: parsed.humanitarianNeeds as object,
      evidenceMatrix: parsed.evidenceMatrix as object,
      consensus: parsed.consensus as object,
      dynamicPriority: parsed.dynamicPriority as object,
      priorityReasoning: parsed.priorityReasoning ?? undefined,
      riskProjection: parsed.riskProjection as object,
      analystNarrative: parsed.analystNarrative,
      timeline: parsed.timeline as object,
      sourceReliability: parsed.sourceReliability as object,
      confidence: parsed.confidence,
      verification: parsed.verification,
      pipelineVersion: MASTER_INCIDENT_INTELLIGENCE_VERSION,
      sourceReportIds,
      memberCountAtAnalysis: reportInputs.length,
      aiModel: parsed.aiModel,
    });

    await masterIncidentRepository.updateMasterIncident(masterIncidentId, {
      dynamicPriorityLevel: parsed.dynamicPriority.level,
      dynamicPriorityScore: roundTo(parsed.dynamicPriority.score),
      correlationVerificationStatus: parsed.verification,
      confidenceScore: roundTo(parsed.confidence),
    });

    const { masterIncidentPropagationService } = await import(
      "@/services/masterIncidentPropagationService"
    );
    await masterIncidentPropagationService.propagateFromIntelligence(
      masterIncidentId,
      saved
    );

    invalidateCache("dashboard:");
    invalidateCache("map:");
    for (const reportId of sourceReportIds) {
      invalidateIncidentCache(reportId);
    }

    return saved;
  }
}

export const masterIncidentIntelligenceService = new MasterIncidentIntelligenceService();
