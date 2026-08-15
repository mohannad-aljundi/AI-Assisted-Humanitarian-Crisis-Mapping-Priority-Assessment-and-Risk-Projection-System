import type { PriorityLevel, RiskLevel, RiskTrend } from "@prisma/client";
import type {
  AiDimensionReasoning,
  AiFinalReasoning,
  AnalyticalRiskProjection,
} from "@/types";

export function normaliseIncidentLabel(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  if (words.length === 0) return "Unclassified Incident";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function parseDimensionReasoning(
  raw: unknown,
  fallbackConclusion: string
): AiDimensionReasoning {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reasons = Array.isArray(data.reasons)
    ? data.reasons.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    : [];
  const evidenceQuotes = Array.isArray(data.evidenceQuotes)
    ? data.evidenceQuotes.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    : [];
  return {
    conclusion:
      typeof data.conclusion === "string" && data.conclusion.trim()
        ? data.conclusion.trim()
        : fallbackConclusion,
    narrative:
      typeof data.narrative === "string" && data.narrative.trim()
        ? data.narrative.trim()
        : fallbackConclusion,
    reasons,
    evidenceQuotes,
  };
}

export function parseFinalReasoning(
  raw: unknown,
  situationSummary: string
): AiFinalReasoning {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const asStrings = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];

  return {
    whatIsHappening:
      typeof data.whatIsHappening === "string" && data.whatIsHappening.trim()
        ? data.whatIsHappening.trim()
        : situationSummary,
    whyImportant:
      typeof data.whyImportant === "string" && data.whyImportant.trim()
        ? data.whyImportant.trim()
        : "Humanitarian impact requires monitoring and potential response.",
    evidenceIncreasing: asStrings(data.evidenceIncreasing),
    evidenceDecreasing: asStrings(data.evidenceDecreasing),
    missingInformation: asStrings(data.missingInformation),
    assumptionsAvoided: asStrings(data.assumptionsAvoided),
    aiConfidence:
      typeof data.aiConfidence === "number" && Number.isFinite(data.aiConfidence)
        ? Math.max(0, Math.min(1, data.aiConfidence))
        : 0.7,
    conclusion:
      typeof data.conclusion === "string" && data.conclusion.trim()
        ? data.conclusion.trim()
        : situationSummary,
  };
}

export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "Critical";
  if (score >= 55) return "High";
  if (score >= 35) return "Medium";
  return "Low";
}

export function riskTrendFromTrajectory(
  trend: AnalyticalRiskProjection["trend"]
): RiskTrend {
  if (trend === "improving") return "Decreasing";
  if (trend === "worsening") return "Increasing";
  return "Stable";
}
