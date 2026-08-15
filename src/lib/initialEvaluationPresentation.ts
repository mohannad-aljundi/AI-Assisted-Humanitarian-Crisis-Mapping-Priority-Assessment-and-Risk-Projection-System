import type { PriorityAssessment, ReliabilityAssessment, RiskLevel } from "@prisma/client";
import type { ExtendedAnalysisInsight, PriorityScoreBreakdown } from "@/types";
import {
  formatAiModelForDisplay,
  sanitizeAnalystText,
} from "@/lib/explainabilityPresentation";
import type { AssessmentMethod } from "@/lib/aiAssessmentUtils";

export interface PriorityFactorItem {
  label: string;
  points: number;
}

export interface ReliabilityFactorItem {
  label: string;
  positive: boolean;
}

export interface RiskFactorItem {
  label: string;
}

export type AiStatusTone = "active" | "fallback" | "degraded";

export interface AiStatusPresentation {
  tone: AiStatusTone;
  title: string;
  subtitle: string;
  body: string[];
}

const FACTOR_LABELS: Record<string, string> = {
  humanitarianEmergency: "High humanitarian impact",
  casualties: "Casualty indicators",
  displacement: "Population displacement",
  infrastructure: "Infrastructure damage",
  medical: "Medical emergency",
  sourceCredibility: "Source credibility",
  recency: "Recent publication",
  consistency: "Narrative consistency",
  crossSource: "Multiple corroborating indicators",
  crossSourceAgreement: "Multiple corroborating indicators",
  officialSource: "Official humanitarian source",
  duplicateConfirmation: "Corroborating reports",
  locationVerification: "Geographic evidence",
  locationConfidence: "Geographic evidence",
  completeness: "Information completeness",
  entityExtraction: "Extracted humanitarian indicators",
  aiConfidence: "AI confidence contribution",
  aiExtraction: "AI confidence contribution",
  reliability: "Source reliability",
  severity: "Humanitarian severity",
  urgency: "Operational urgency",
  population: "Affected population scale",
};

function normalizeScore(value: number): number {
  return value > 1 ? value / 100 : value;
}

function humanizeKey(key: string): string {
  if (FACTOR_LABELS[key]) return FACTOR_LABELS[key];
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function distributePoints(weights: number[], total: number): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((acc, value) => acc + value, 0) || 1;
  const raw = weights.map((weight) => (weight / sum) * total);
  const floored = raw.map((value) => Math.max(1, Math.floor(value)));
  let remainder = total - floored.reduce((acc, value) => acc + value, 0);

  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  let cursor = 0;
  while (remainder !== 0 && order.length > 0) {
    const target = order[cursor % order.length]!.index;
    if (remainder > 0) {
      floored[target] += 1;
      remainder -= 1;
    } else if (floored[target]! > 1) {
      floored[target] -= 1;
      remainder += 1;
    } else {
      break;
    }
    cursor += 1;
    if (cursor > order.length * 20) break;
  }

  return floored;
}

function resolvePriorityBreakdown(
  assessment: PriorityAssessment,
  insight: ExtendedAnalysisInsight | null | undefined
): Record<string, number> | null {
  if (insight?.priorityBreakdown && Object.keys(insight.priorityBreakdown).length > 0) {
    return insight.priorityBreakdown;
  }
  const stored = assessment.scoreBreakdown as PriorityScoreBreakdown | null;
  if (stored?.weightedIndicators && Object.keys(stored.weightedIndicators).length > 0) {
    return stored.weightedIndicators;
  }
  return null;
}

export function buildPriorityFactors(
  assessment: PriorityAssessment,
  insight: ExtendedAnalysisInsight | null | undefined
): PriorityFactorItem[] {
  const totalScore = Math.max(1, Math.round(assessment.severityScore * 100));
  const breakdown = resolvePriorityBreakdown(assessment, insight);

  if (breakdown) {
    const entries = Object.entries(breakdown)
      .map(([key, value]) => ({
        key,
        weight: Math.max(0, normalizeScore(value)),
        label: humanizeKey(key),
      }))
      .filter((entry) => entry.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);

    if (entries.length > 0) {
      const points = distributePoints(
        entries.map((entry) => entry.weight),
        totalScore
      );
      return entries.map((entry, index) => ({
        label: entry.label,
        points: points[index] ?? 0,
      }));
    }
  }

  const reasons = [
    ...(insight?.priorityReasoning?.reasons ?? []),
    ...(insight?.priorityExplanation?.reasons ?? []),
  ]
    .map(sanitizeAnalystText)
    .filter(Boolean);

  const uniqueReasons = [...new Set(reasons)].slice(0, 8);
  if (uniqueReasons.length === 0) {
    return [
      {
        label: `${assessment.priorityLevel} priority classification`,
        points: totalScore,
      },
    ];
  }

  const weights = uniqueReasons.map((_, index) => uniqueReasons.length - index);
  const points = distributePoints(weights, totalScore);
  return uniqueReasons.map((label, index) => ({
    label,
    points: points[index] ?? 0,
  }));
}

export function buildAiDecisionSummary(
  assessment: PriorityAssessment,
  insight: ExtendedAnalysisInsight | null | undefined
): string {
  const narrative =
    insight?.priorityReasoning?.narrative ??
    insight?.finalReasoning?.conclusion ??
    insight?.priorityExplanation?.conclusion ??
    insight?.situationSummary;

  if (narrative?.trim()) {
    return sanitizeAnalystText(narrative);
  }

  const factors = buildPriorityFactors(assessment, insight)
    .slice(0, 4)
    .map((factor) => factor.label.toLowerCase());

  const factorText =
    factors.length > 0
      ? `including ${factors.join(", ")}`
      : "based on the humanitarian indicators present in the source material";

  return `The report was classified as ${assessment.priorityLevel.toUpperCase()} PRIORITY because it describes significant humanitarian impacts ${factorText}.`;
}

export function buildReliabilityFactors(
  assessment: ReliabilityAssessment,
  insight: ExtendedAnalysisInsight | null | undefined
): ReliabilityFactorItem[] {
  const items: ReliabilityFactorItem[] = [];

  if (assessment.sourceScore >= 0.7) {
    items.push({ label: "Trusted humanitarian source", positive: true });
  } else if (assessment.sourceScore >= 0.45) {
    items.push({ label: "Moderate source credibility", positive: true });
  } else {
    items.push({ label: "Limited source credibility", positive: false });
  }

  if (assessment.recencyScore >= 0.65) {
    items.push({ label: "Recent publication", positive: true });
  } else {
    items.push({ label: "Older publication reduces recency weight", positive: false });
  }

  if (assessment.consistencyScore >= 0.65) {
    items.push({ label: "Consistent narrative evidence", positive: true });
  } else {
    items.push({ label: "Some internal inconsistency detected", positive: false });
  }

  const agreement = insight?.crossSourceAnalysis?.agreementPercent;
  if (agreement != null && agreement >= 70) {
    items.push({ label: "Multiple source corroboration", positive: true });
  } else if (agreement != null && agreement < 50) {
    items.push({ label: "Limited cross-source agreement", positive: false });
  }

  if (insight?.locationReasoning?.status === "resolved") {
    items.push({ label: "Consistent geographic evidence", positive: true });
  } else if (insight?.locationReasoning?.status === "pending") {
    items.push({ label: "Location still awaiting confirmation", positive: false });
  }

  for (const reason of insight?.reliabilityExplanation?.reasons ?? []) {
    const label = sanitizeAnalystText(reason);
    if (!label) continue;
    if (items.some((item) => item.label.toLowerCase() === label.toLowerCase())) continue;
    items.push({
      label,
      positive: !/limited|uncertain|await|missing|inconsist/i.test(label),
    });
  }

  for (const gap of insight?.unknownFacts?.slice(0, 2) ?? []) {
    const label = sanitizeAnalystText(gap);
    if (label) {
      items.push({ label: `${label} still awaiting confirmation`, positive: false });
    }
  }

  return items.slice(0, 8);
}

export function buildRiskFactors(
  insight: ExtendedAnalysisInsight | null | undefined,
  riskLevel?: RiskLevel | null
): RiskFactorItem[] {
  const labels = [
    ...(insight?.riskReasoning?.reasons ?? []),
    ...(insight?.riskExplanation?.reasons ?? []),
    ...(insight?.riskExplanation?.evidence ?? []),
  ]
    .map(sanitizeAnalystText)
    .filter(Boolean);

  const unique = [...new Set(labels)].slice(0, 6);
  if (unique.length > 0) {
    return unique.map((label) => ({ label }));
  }

  if (riskLevel === "Critical" || riskLevel === "High") {
    return [
      { label: "Elevated humanitarian severity" },
      { label: "Operational response pressure" },
    ];
  }

  return [{ label: "Stable or moderate risk trajectory" }];
}

export function buildWhyDecisionSections(
  assessment: PriorityAssessment,
  reliability: ReliabilityAssessment | null | undefined,
  insight: ExtendedAnalysisInsight | null | undefined
): Array<{ title: string; items: string[] }> {
  const evidence = [
    ...(insight?.evidence ?? []),
    ...(insight?.priorityReasoning?.evidenceQuotes ?? []),
    ...(insight?.knownFacts ?? []),
  ]
    .map(sanitizeAnalystText)
    .filter(Boolean);

  const humanitarian = [
    ...(insight?.priorityReasoning?.reasons ?? []),
    ...(insight?.priorityExplanation?.reasons ?? []),
  ]
    .map(sanitizeAnalystText)
    .filter(Boolean);

  const risk = buildRiskFactors(insight).map((item) => item.label);

  const confidence = Object.entries(insight?.confidenceBreakdown ?? {})
    .map(([key, value]) => {
      const score = normalizeScore(Number(value));
      return `${humanizeKey(key)} (${Math.round(score * 100)}%)`;
    })
    .filter(Boolean);

  const source = reliability
    ? buildReliabilityFactors(reliability, insight)
        .filter((item) => item.positive)
        .map((item) => item.label)
    : [];

  const missing = [
    ...(insight?.unknownFacts ?? []),
    ...(insight?.finalReasoning?.missingInformation ?? []),
  ]
    .map(sanitizeAnalystText)
    .filter(Boolean);

  const uncertainty = [
    ...(insight?.finalReasoning?.assumptionsAvoided ?? []),
    ...(insight?.priorityReasoning?.severityReductionReasons ?? []),
  ]
    .map(sanitizeAnalystText)
    .filter(Boolean);

  return [
    { title: "Extracted evidence", items: [...new Set(evidence)].slice(0, 8) },
    { title: "Humanitarian indicators", items: [...new Set(humanitarian)].slice(0, 8) },
    { title: "Risk indicators", items: [...new Set(risk)].slice(0, 6) },
    { title: "Confidence contributors", items: confidence.slice(0, 6) },
    { title: "Source credibility", items: source.slice(0, 6) },
    { title: "Missing information", items: [...new Set(missing)].slice(0, 6) },
    { title: "Uncertainty notes", items: [...new Set(uncertainty)].slice(0, 6) },
  ].filter((section) => section.items.length > 0);
}

function isFallbackMethod(method?: AssessmentMethod | string | null): boolean {
  return method === "RULE_FALLBACK" || method === "LOCAL_REASONING";
}

function isTechnicalFallbackReason(reason: string): boolean {
  return /AI missing|API key|OPENAI|GEMINI|OPENROUTER|credentials|stack trace|No AI provider/i.test(
    reason
  );
}

function isAiSuccessMethod(method?: string | null): boolean {
  return (
    method === "AI" ||
    method === "AI_ENHANCED" ||
    method === "AI_VALIDATED" ||
    method === "AI_WITH_VALIDATION"
  );
}

export interface AiRuntimeStatusInput {
  /** True when OPENAI_API_KEY (or equivalent) is present in the server environment. */
  openAiConfigured: boolean;
  primaryProvider?: string | null;
  model?: string | null;
}

/**
 * User-facing AI status for Initial Evaluation.
 * Prefer live runtime configuration so a configured OpenAI key never shows "AI missing".
 */
export function buildAiStatusPresentation(
  insight?: {
    assessmentMethod?: string | null;
    assessmentFallbackReason?: string | null;
    priorityExplanation?: {
      assessmentMethod?: string | null;
      fallbackReason?: string | null;
    } | null;
    aiModel?: string | null;
  } | null,
  runtime?: AiRuntimeStatusInput | null
): AiStatusPresentation {
  const method =
    insight?.assessmentMethod ??
    insight?.priorityExplanation?.assessmentMethod ??
    null;
  const rawFallback =
    insight?.assessmentFallbackReason ??
    insight?.priorityExplanation?.fallbackReason ??
    "";
  const fallbackReason = sanitizeAnalystText(rawFallback);
  const modelLabel = formatAiModelForDisplay(
    runtime?.model ?? insight?.aiModel
  );
  const poweredBy =
    modelLabel === "cloud AI" ? "Powered by GPT-5" : `Powered by ${modelLabel}`;

  // Runtime OpenAI key present → always show Active (never "AI missing").
  if (runtime?.openAiConfigured) {
    if (isAiSuccessMethod(method) || !isFallbackMethod(method)) {
      return {
        tone: "active",
        title: "AI Intelligence Active",
        subtitle: poweredBy,
        body: ["Cloud AI analysis completed successfully."],
      };
    }

    // Report used fallback while OpenAI is configured (provider error at analysis time).
    return {
      tone: "fallback",
      title: "Fallback Intelligence Active",
      subtitle: "Cloud AI service is temporarily unavailable.",
      body: [
        "The system automatically switched to the built-in humanitarian intelligence engine.",
        "Analysis continues normally.",
      ],
    };
  }

  // No runtime OpenAI key — only then show inactive/fallback states.
  if (isAiSuccessMethod(method)) {
    return {
      tone: "active",
      title: "AI Intelligence Active",
      subtitle: poweredBy,
      body: ["Cloud AI analysis completed successfully."],
    };
  }

  const quotaOrNetwork =
    !isTechnicalFallbackReason(fallbackReason) &&
    /credit|quota|network|timeout|temporar|unavailable/i.test(fallbackReason);

  if (quotaOrNetwork) {
    return {
      tone: "degraded",
      title: "AI temporarily unavailable",
      subtitle: "Automatic fallback completed successfully.",
      body: ["No user action required."],
    };
  }

  return {
    tone: "fallback",
    title: "Fallback Intelligence Active",
    subtitle: "Cloud AI service is temporarily unavailable.",
    body: [
      "The system automatically switched to the built-in humanitarian intelligence engine.",
      "Analysis continues normally.",
    ],
  };
}

export function riskBarPercent(level?: RiskLevel | null): number {
  switch (level) {
    case "Critical":
      return 92;
    case "High":
      return 74;
    case "Medium":
      return 48;
    case "Low":
      return 24;
    default:
      return 40;
  }
}
