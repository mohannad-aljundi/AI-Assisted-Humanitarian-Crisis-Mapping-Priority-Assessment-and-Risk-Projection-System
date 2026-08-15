import type { PriorityLevel } from "@prisma/client";
import {
  callAiJson,
  ensureAiConnection,
  isAiAvailable,
  isAiConfigured,
} from "@/lib/aiResolver";
import type {
  DisasterSeverityAssessment,
  DisasterSeverityLevel,
  IntelligenceReasoningBundle,
  NLPAnalysisResult,
  PriorityResult,
  ReliabilityResult,
  RiskProjectionResult,
} from "@/types";

const VALID_LEVELS: DisasterSeverityLevel[] = ["Low", "Medium", "High", "Critical"];

const RESPONSE_SCHEMA = `{
  "level": "Critical",
  "score": 9.4,
  "reasoning": "2-3 sentence overall severity assessment of the humanitarian situation.",
  "reasons": [
    "Large population affected",
    "Hospitals damaged",
    "Thousands displaced",
    "Multiple humanitarian needs detected"
  ],
  "confidence": 0.88
}`;

const SYSTEM_INSTRUCTION =
  "You are a senior humanitarian impact analyst assessing disaster severity holistically. Return only valid JSON. Severity is NOT a percentage of anything — it is an expert judgment of humanitarian harm on a 0–10 scale.";

let connectionVerified: boolean | null = null;

export interface DisasterSeverityInput {
  title: string;
  content: string;
  nlp: NLPAnalysisResult;
  priority: PriorityResult;
  reliability: ReliabilityResult;
  risk: RiskProjectionResult;
  reasoningBundle?: IntelligenceReasoningBundle | null;
  crossSourceAgreementPercent?: number | null;
  trendNote?: string | null;
}

function asLevel(value: unknown): DisasterSeverityLevel {
  if (typeof value !== "string" || !VALID_LEVELS.includes(value as DisasterSeverityLevel)) {
    throw new Error("Invalid disaster severity level");
  }
  return value as DisasterSeverityLevel;
}

function asScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Invalid severity score");
  return Math.max(0, Math.min(10, Math.round(parsed * 10) / 10));
}

function asConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.6;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function buildPrompt(input: DisasterSeverityInput): string {
  const needsSummary =
    input.nlp.humanitarianNeeds.length > 0
      ? input.nlp.humanitarianNeeds
          .map((n) => `${n.needType} (${n.severity})`)
          .join(", ")
      : "None identified";

  return [
    "Assess the overall DISASTER SEVERITY of this humanitarian report.",
    "This is NOT 'disaster size as a percentage' — express expert judgment on a 0–10 scale.",
    "",
    "Evaluate (when present in the report):",
    "- casualties, deaths, injuries",
    "- displaced people and affected population",
    "- humanitarian needs (observed and implied)",
    "- infrastructure destruction, hospital/school damage",
    "- power outages, water/food shortages",
    "- conflict intensity, earthquake magnitude, flood level, wildfire spread",
    "- geographic scope and vulnerable populations",
    "- urgency language, trend vs escalation/de-escalation",
    "- source reliability and cross-source confirmation",
    "",
    "SCORING GUIDE:",
    "- score 0–10 (one decimal). level: Low (0–3.9), Medium (4–5.9), High (6–7.9), Critical (8–10).",
    "- reasons: 3–8 bullet-style factual statements citing what drove the score.",
    "- reasoning: concise narrative for decision-makers.",
    "",
    `Schema: ${RESPONSE_SCHEMA}`,
    "",
    `Title: ${input.title}`,
    `Crisis type: ${input.nlp.crisisType ?? "Unknown"}`,
    `Affected population: ${input.nlp.affectedPopulation ?? "Not stated"}`,
    `Humanitarian needs: ${needsSummary}`,
    `Priority (separate axis): ${input.priority.priorityLevel}`,
    `Risk trend: ${input.risk.trend}`,
    `Reliability: ${Math.round(input.reliability.finalScore * 100)}%`,
    input.crossSourceAgreementPercent != null
      ? `Cross-source agreement: ${input.crossSourceAgreementPercent}%`
      : "",
    input.trendNote ? `Trend context: ${input.trendNote}` : "",
    input.reasoningBundle?.finalReasoning?.conclusion
      ? `Prior AI summary: ${input.reasoningBundle.finalReasoning.conclusion}`
      : "",
    "",
    `Report content:\n${input.content.slice(0, 8000)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function levelFromScore(score: number): DisasterSeverityLevel {
  if (score >= 8) return "Critical";
  if (score >= 6) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

function fallbackAssessment(input: DisasterSeverityInput): DisasterSeverityAssessment {
  const scoreFromPriority: Record<PriorityLevel, number> = {
    Low: 3.2,
    Medium: 5.5,
    High: 7.2,
    Critical: 9.1,
  };
  const base = scoreFromPriority[input.priority.priorityLevel] ?? 5;
  const reasons = [
    ...input.priority.reasons.slice(0, 4),
    input.nlp.affectedPopulation
      ? `Affected population estimated at ${input.nlp.affectedPopulation.toLocaleString()}`
      : null,
    input.nlp.humanitarianNeeds.length > 0
      ? `${input.nlp.humanitarianNeeds.length} humanitarian need(s) identified`
      : null,
    input.risk.trend === "Increasing"
      ? "Situation trend indicates escalation"
      : null,
  ].filter((r): r is string => Boolean(r));

  if (reasons.length === 0) {
    reasons.push("Limited explicit severity indicators in available source material");
  }

  return {
    level: levelFromScore(base),
    score: base,
    reasoning:
      "Severity estimated from available humanitarian indicators when full AI severity assessment is unavailable.",
    reasons,
    confidence: 0.45,
    source: "fallback",
  };
}

export class DisasterSeverityService {
  async assess(input: DisasterSeverityInput): Promise<DisasterSeverityAssessment> {
    if (!isAiAvailable()) {
      return fallbackAssessment(input);
    }

    if (connectionVerified === null) {
      connectionVerified = await ensureAiConnection();
    }
    if (!connectionVerified) {
      return fallbackAssessment(input);
    }

    try {
      const raw = (await callAiJson(
        buildPrompt(input),
        SYSTEM_INSTRUCTION
      )) as Record<string, unknown>;

      const score = asScore(raw.score);
      const level = asLevel(raw.level);
      const alignedLevel = levelFromScore(score);
      const finalLevel =
        Math.abs(levelScore(level) - score) > 2 ? alignedLevel : level;

      return {
        level: finalLevel,
        score,
        reasoning:
          typeof raw.reasoning === "string" && raw.reasoning.trim()
            ? raw.reasoning.trim()
            : `Humanitarian severity assessed as ${finalLevel}.`,
        reasons: Array.isArray(raw.reasons)
          ? raw.reasons
              .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
              .map((r) => r.trim())
              .slice(0, 10)
          : [],
        confidence: asConfidence(raw.confidence),
        source: "ai",
      };
    } catch (error) {
      console.warn(
        `[DisasterSeverity] AI assessment failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return fallbackAssessment(input);
    }
  }
}

function levelScore(level: DisasterSeverityLevel): number {
  switch (level) {
    case "Critical":
      return 9;
    case "High":
      return 7;
    case "Medium":
      return 5;
    default:
      return 3;
  }
}

export const disasterSeverityService = new DisasterSeverityService();
