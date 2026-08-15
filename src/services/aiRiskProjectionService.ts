import type { RiskLevel, RiskTrend } from "@prisma/client";
import { callAiJson, isAiAvailable } from "@/lib/aiResolver";
import { clamp, roundTo } from "@/lib/utils";
import { continuousHumanitarianLearningEngine } from "@/services/continuousHumanitarianLearningEngine";
import type { RiskProjectionOutput } from "@/services/riskProjectionEngine";
import type {
  AnalyticalRiskProjection,
  IntelligenceReasoningBundle,
  NLPAnalysisResult,
  PriorityResult,
  ReliabilityResult,
  RiskProjectionResult,
  RiskTrajectoryTrend,
} from "@/types";
import type { HumanitarianReasoningContext } from "@/lib/humanitarianAnalystReasoning";

const SYSTEM_INSTRUCTION =
  "You are a senior humanitarian risk analyst producing evidence-based temporal risk forecasts. Return only valid JSON. Every explanation must cite specific evidence from the report — never generic templates.";

const RESPONSE_SCHEMA = `{
  "currentScore": 72,
  "forecast24h": 75,
  "forecast72h": 70,
  "forecast7d": 65,
  "trend": "worsening",
  "riskLevel": "High",
  "confidence": 0.82,
  "riskNarrative": "2-4 sentence analyst summary of the overall risk trajectory.",
  "currentRiskReason": "Why current risk is at this level — cite casualties, displacement, infrastructure, etc.",
  "forecast24hReason": "Why risk over 24h will change or stay stable — cite ongoing operations, access, weather, conflict dynamics.",
  "forecast72hReason": "Why 72h risk changes — medium-term drivers such as aid delivery, disease spread, or stabilization.",
  "forecast7dReason": "Why 7-day risk outlook — longer-term factors, seasonal, political, or recovery signals.",
  "riskDrivers": ["Specific factor increasing risk with evidence"],
  "riskMitigatingFactors": ["Factor that could reduce risk"],
  "uncertainties": ["What is unknown and could change the forecast"],
  "similarCasesInfluence": ["How similar historical cases inform this forecast, if any"]
}`;

export function trajectoryToRiskTrend(trend: RiskTrajectoryTrend): RiskTrend {
  if (trend === "improving") return "Decreasing";
  if (trend === "worsening") return "Increasing";
  return "Stable";
}

function riskTrendToTrajectory(trend: RiskTrend): RiskTrajectoryTrend {
  if (trend === "Decreasing") return "improving";
  if (trend === "Increasing") return "worsening";
  return "stable";
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "Critical";
  if (score >= 55) return "High";
  if (score >= 35) return "Medium";
  return "Low";
}

function asScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(Math.round(parsed), 5, 98);
}

function asTrend(value: unknown, fallback: RiskTrajectoryTrend): RiskTrajectoryTrend {
  if (value === "improving" || value === "stable" || value === "worsening") return value;
  return fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 10);
}

function asLevel(value: unknown, fallback: RiskLevel): RiskLevel {
  const levels: RiskLevel[] = ["Low", "Medium", "High", "Critical"];
  return levels.includes(value as RiskLevel) ? (value as RiskLevel) : fallback;
}

export interface EnhanceRiskProjectionInput {
  reportId?: string;
  title: string;
  content: string;
  nlp: NLPAnalysisResult;
  priority: PriorityResult;
  reliability: ReliabilityResult;
  baseRisk: RiskProjectionOutput | RiskProjectionResult;
  humanitarianReasoning?: HumanitarianReasoningContext | null;
  reasoningBundle?: IntelligenceReasoningBundle | null;
}

export function toRiskProjectionOutput(
  risk: RiskProjectionResult,
  fallbackReasoning: string[] = []
): RiskProjectionOutput {
  const currentScore = risk.currentScore ?? risk.horizons?.[0]?.score ?? 50;
  return {
    riskLevel: risk.riskLevel,
    trend: risk.trend,
    confidenceScore: risk.confidenceScore,
    currentScore,
    horizons: risk.horizons ?? [],
    breakdown: risk.breakdown ?? {},
    reasoning: risk.reasoning ?? fallbackReasoning,
  };
}

function buildFallback(
  base: RiskProjectionOutput,
  reason: string
): AnalyticalRiskProjection {
  const horizons = base.horizons;
  const trend = riskTrendToTrajectory(base.trend);
  return {
    currentScore: base.currentScore,
    forecast24h: horizons[1]?.score ?? base.currentScore,
    forecast72h: horizons[2]?.score ?? base.currentScore,
    forecast7d: horizons[3]?.score ?? base.currentScore,
    trend,
    riskLevel: base.riskLevel,
    confidence: base.confidenceScore,
    riskNarrative: base.reasoning.join(" "),
    currentRiskReason: base.reasoning[0] ?? reason,
    forecast24hReason: base.reasoning[1] ?? "24-hour outlook based on current trend and reported conditions.",
    forecast72hReason: base.reasoning[2] ?? "72-hour outlook follows observed escalation or stabilization signals.",
    forecast7dReason: base.reasoning[3] ?? "7-day outlook reflects medium-term crisis dynamics in the report.",
    riskDrivers: base.reasoning.slice(0, 4),
    riskMitigatingFactors: [],
    uncertainties: ["AI analytical enhancement unavailable — rule-based projection used."],
    similarCasesInfluence: [],
  };
}

function buildPrompt(input: EnhanceRiskProjectionInput & { baseRisk: RiskProjectionOutput }, similarSummary: string): string {
  const needs =
    input.nlp.humanitarianNeeds.length > 0
      ? input.nlp.humanitarianNeeds.map((n) => `${n.needType} (${n.severity})`).join(", ")
      : "None identified";

  return [
    "Produce an evidence-based humanitarian RISK PROJECTION for this report.",
    "Scores are 0–100. Trend must be: improving, stable, or worsening.",
    "Each horizon explanation must cite specific evidence (casualties, displacement, infrastructure, blocked roads,",
    "health pressure, food/water shortage, conflict escalation, weather/aftershocks, source reliability, recency, crisis phase).",
    "",
    `Baseline rule scores (refine with evidence): current=${input.baseRisk.currentScore},`,
    `24h=${input.baseRisk.horizons[1]?.score}, 72h=${input.baseRisk.horizons[2]?.score}, 7d=${input.baseRisk.horizons[3]?.score}`,
    `Trend baseline: ${input.baseRisk.trend}`,
    "",
    `Priority: ${input.priority.priorityLevel} | Reliability: ${Math.round(input.reliability.finalScore * 100)}%`,
    `Crisis type: ${input.nlp.crisisType ?? "Unknown"}`,
    `Humanitarian needs: ${needs}`,
    `Crisis phase: ${input.humanitarianReasoning?.crisisPhase ?? "Unknown"}`,
    `Report purpose: ${input.humanitarianReasoning?.reportPurpose ?? "Unknown"}`,
    similarSummary ? `Similar historical cases (CHLE):\n${similarSummary}` : "",
    input.reasoningBundle?.riskReasoning?.narrative
      ? `Existing risk reasoning: ${input.reasoningBundle.riskReasoning.narrative}`
      : "",
    "",
    `Schema: ${RESPONSE_SCHEMA}`,
    "",
    `Title: ${input.title}`,
    "",
    "Report:",
    input.content.slice(0, 6000),
  ]
    .filter(Boolean)
    .join("\n");
}

function parseResponse(
  raw: unknown,
  base: RiskProjectionOutput
): AnalyticalRiskProjection {
  const data = (raw ?? {}) as Record<string, unknown>;
  const trend = asTrend(data.trend, riskTrendToTrajectory(base.trend));
  const currentScore = asScore(data.currentScore, base.currentScore);

  return {
    currentScore,
    forecast24h: asScore(data.forecast24h, base.horizons[1]?.score ?? currentScore),
    forecast72h: asScore(data.forecast72h, base.horizons[2]?.score ?? currentScore),
    forecast7d: asScore(data.forecast7d, base.horizons[3]?.score ?? currentScore),
    trend,
    riskLevel: asLevel(data.riskLevel, scoreToRiskLevel(currentScore)),
    confidence: roundTo(
      clamp(Number(data.confidence) || base.confidenceScore, 0.2, 0.98)
    ),
    riskNarrative: asString(data.riskNarrative, ""),
    currentRiskReason: asString(data.currentRiskReason, ""),
    forecast24hReason: asString(data.forecast24hReason, ""),
    forecast72hReason: asString(data.forecast72hReason, ""),
    forecast7dReason: asString(data.forecast7dReason, ""),
    riskDrivers: asStringArray(data.riskDrivers),
    riskMitigatingFactors: asStringArray(data.riskMitigatingFactors),
    uncertainties: asStringArray(data.uncertainties),
    similarCasesInfluence: asStringArray(data.similarCasesInfluence),
  };
}

export function mergeAnalyticalIntoRiskProjection(
  base: RiskProjectionOutput,
  analytical: AnalyticalRiskProjection
): RiskProjectionResult {
  const trend = trajectoryToRiskTrend(analytical.trend);
  const horizons = [
    { label: "Current", hours: 0, score: analytical.currentScore, riskLevel: analytical.riskLevel, trend },
    {
      label: "24h",
      hours: 24,
      score: analytical.forecast24h,
      riskLevel: scoreToRiskLevel(analytical.forecast24h),
      trend,
    },
    {
      label: "72h",
      hours: 72,
      score: analytical.forecast72h,
      riskLevel: scoreToRiskLevel(analytical.forecast72h),
      trend,
    },
    {
      label: "7d",
      hours: 168,
      score: analytical.forecast7d,
      riskLevel: scoreToRiskLevel(analytical.forecast7d),
      trend,
    },
  ];

  return {
    riskLevel: analytical.riskLevel,
    trend,
    confidenceScore: analytical.confidence,
    currentScore: analytical.currentScore,
    horizons,
    breakdown: base.breakdown,
    reasoning: [
      analytical.riskNarrative,
      analytical.currentRiskReason,
      analytical.forecast24hReason,
      analytical.forecast72hReason,
      analytical.forecast7dReason,
      ...analytical.riskDrivers,
    ].filter(Boolean),
  };
}

export class AiRiskProjectionService {
  async enhance(input: EnhanceRiskProjectionInput): Promise<{
    analytical: AnalyticalRiskProjection;
    riskProjection: RiskProjectionResult;
  }> {
    const base = toRiskProjectionOutput(input.baseRisk as RiskProjectionResult);

    if (!isAiAvailable()) {
      const analytical = buildFallback(base, "AI not configured");
      return {
        analytical,
        riskProjection: mergeAnalyticalIntoRiskProjection(base, analytical),
      };
    }

    let similarSummary = "";
    if (input.reportId) {
      try {
        const similar = await continuousHumanitarianLearningEngine.findSimilarIncidents({
          reportId: input.reportId,
          title: input.title,
          content: input.content,
          crisisType: input.nlp.crisisType,
          country: input.nlp.locations[0]?.name?.split(",").pop()?.trim() ?? null,
          city: input.nlp.locations[0]?.name?.split(",")[0]?.trim() ?? null,
          reportPurpose: input.humanitarianReasoning?.reportPurpose ?? null,
          crisisPhase: input.humanitarianReasoning?.crisisPhase ?? null,
          priorityLevel: input.priority.priorityLevel,
          limit: 3,
        });
        similarSummary = similar
          .map(
            (match) =>
              `- ${match.title} (${Math.round(match.similarityScore * 100)}% similar): ${match.assessmentDifference}`
          )
          .join("\n");
      } catch {
        similarSummary = "";
      }
    }

    try {
      const raw = await callAiJson(buildPrompt({ ...input, baseRisk: base }, similarSummary), SYSTEM_INSTRUCTION);
      const analytical = parseResponse(raw, base);
      if (!analytical.riskNarrative) {
        throw new Error("Empty risk narrative from AI");
      }
      return {
        analytical,
        riskProjection: mergeAnalyticalIntoRiskProjection(base, analytical),
      };
    } catch (error) {
      console.warn(
        "[RiskProjection] AI enhancement failed:",
        error instanceof Error ? error.message : error
      );
      const analytical = buildFallback(base, "Rule-based fallback after AI failure");
      return {
        analytical,
        riskProjection: mergeAnalyticalIntoRiskProjection(base, analytical),
      };
    }
  }
}

export const aiRiskProjectionService = new AiRiskProjectionService();
