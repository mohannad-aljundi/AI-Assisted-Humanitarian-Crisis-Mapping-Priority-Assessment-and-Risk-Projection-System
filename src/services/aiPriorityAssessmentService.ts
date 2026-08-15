import type { PriorityLevel, RiskLevel } from "@prisma/client";
import {
  callAiJson,
  getAiConfig,
  isAiAvailable,
  isAiConfigured,
} from "@/lib/aiResolver";
import { isAiGloballyBlocked } from "@/lib/aiProviderStatus";
import {
  AI_FALLBACK_UI_MESSAGE,
  classifyAiFailure,
  formatAiFailureReason,
  formatAiFailureUserMessage,
  sleep,
  type AssessmentMethod,
} from "@/lib/aiAssessmentUtils";
import type { AiPriorityAssessmentResult } from "@/types";

const VALID_PRIORITY: PriorityLevel[] = ["Low", "Medium", "High", "Critical"];
const VALID_RISK: RiskLevel[] = ["Low", "Medium", "High", "Critical"];

const PRIORITY_RESPONSE_SCHEMA = `{
  "priorityLevel": "Critical",
  "priorityScore": 88,
  "riskLevel": "Critical",
  "urgency": "Immediate",
  "humanitarianNeeds": ["Medical Aid", "Shelter", "Food"],
  "evidenceQuotes": [
    "Over 1,700 people were killed in the earthquake",
    "Hospitals are overwhelmed and rescue operations continue"
  ],
  "reasoning": "Catastrophic casualty scale with active rescue operations and critical medical needs warrant highest priority.",
  "confidence": 0.85
}`;

const SYSTEM_INSTRUCTION =
  "You are a senior humanitarian priority analyst. Assess humanitarian urgency semantically from the full report. You MUST return valid JSON with priorityLevel, priorityScore, riskLevel, humanitarian needs, evidence, and reasoning. Never return an empty assessment for a humanitarian crisis report.";

export interface AiPriorityAssessmentOutcome {
  result: AiPriorityAssessmentResult | null;
  assessmentMethod: AssessmentMethod;
  fallbackReason: string | null;
}

function buildPriorityPrompt(title: string, content: string): string {
  return [
    "Assess the humanitarian priority of this crisis report. Read the full title and content carefully.",
    "Return strict JSON only — no markdown.",
    "",
    "ASSESSMENT GUIDANCE:",
    "- Reason about real humanitarian impact: casualties, displacement, infrastructure loss, medical capacity, vulnerable groups, and urgency.",
    "- priorityScore: 0–100 (higher = more urgent). priorityLevel: Low (<25), Medium (25–49), High (50–74), Critical (75+).",
    "- riskLevel: projected short-term humanitarian risk independent of response capacity.",
    "- urgency: one word or short phrase (e.g. Immediate, High, Moderate, Low).",
    "- humanitarianNeeds: specific need types detectable from the text.",
    "- evidenceQuotes: 2–5 direct short quotes or paraphrased facts from the report supporting your assessment.",
    "- reasoning: 2–4 sentences explaining your semantic humanitarian judgment.",
    "- confidence: 0.0–1.0 reflecting how clearly the report supports your assessment.",
    "- Use professional humanitarian analyst judgment — this is the PRIMARY assessment for the platform.",
    "",
    `Schema: ${PRIORITY_RESPONSE_SCHEMA}`,
    `Title: ${title}`,
    `Content: ${content.slice(0, 8000)}`,
  ].join("\n");
}

function asEnum<T extends string>(value: unknown, field: string, allowed: T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Invalid ${field}: ${String(value)}`);
  }
  return value as T;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${field}`);
  }
  return value.trim();
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${field}`);
  const items = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  if (items.length === 0) throw new Error(`Invalid ${field}: empty array`);
  return items;
}

function asScore(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function asConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function validateResult(raw: unknown): AiPriorityAssessmentResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI priority output is not an object");
  }
  const data = raw as Record<string, unknown>;
  return {
    priorityLevel: asEnum(data.priorityLevel, "priorityLevel", VALID_PRIORITY),
    priorityScore: asScore(data.priorityScore, "priorityScore"),
    riskLevel: asEnum(data.riskLevel, "riskLevel", VALID_RISK),
    urgency: asString(data.urgency, "urgency"),
    humanitarianNeeds: asStringArray(data.humanitarianNeeds, "humanitarianNeeds"),
    evidenceQuotes: asStringArray(data.evidenceQuotes, "evidenceQuotes"),
    reasoning: asString(data.reasoning, "reasoning"),
    confidence: asConfidence(data.confidence),
  };
}

export class AiPriorityAssessmentService {
  isConfigured(): boolean {
    return isAiConfigured();
  }

  async assess(title: string, content: string): Promise<AiPriorityAssessmentOutcome> {
    const config = getAiConfig();
    const hasOpenAi = Boolean(config.openAiApiKey);

    if (!isAiConfigured()) {
      console.error(
        `[AiPriority] No AI API keys configured — using rule fallback for "${title}"`
      );
      return {
        result: null,
        assessmentMethod: "RULE_FALLBACK",
        fallbackReason: formatAiFailureUserMessage("MISSING_API_KEY"),
      };
    }

    if (isAiGloballyBlocked()) {
      console.error(
        `[AiPriority] AI globally blocked — using rule fallback for "${title}"`
      );
      return {
        result: null,
        assessmentMethod: "RULE_FALLBACK",
        fallbackReason: AI_FALLBACK_UI_MESSAGE,
      };
    }

    if (!isAiAvailable() && !hasOpenAi) {
      console.error(
        `[AiPriority] No usable AI providers — using rule fallback for "${title}"`
      );
      return {
        result: null,
        assessmentMethod: "RULE_FALLBACK",
        fallbackReason: formatAiFailureUserMessage("PROVIDER_ERROR"),
      };
    }

    const prompt = buildPriorityPrompt(title, content);
    let lastError: unknown;
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const raw = await callAiJson(prompt, SYSTEM_INSTRUCTION);
        const result = validateResult(raw);
        console.log(
          `[AiPriority] AI assessment succeeded for "${title}" → ${result.priorityLevel} (${result.priorityScore}/100)`
        );
        return {
          result,
          assessmentMethod: "AI",
          fallbackReason: null,
        };
      } catch (error) {
        lastError = error;
        const category = classifyAiFailure(error);
        const detail = error instanceof Error ? error.message : String(error);
        console.error(
          `[AiPriority] Attempt ${attempt}/${maxAttempts} failed for "${title}" [${category}]: ${detail}`
        );
        if (category === "INSUFFICIENT_CREDITS" || isAiGloballyBlocked()) {
          break;
        }
        if (attempt < maxAttempts) {
          await sleep(600);
        }
      }
    }

    const category = classifyAiFailure(lastError);
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    console.error(
      `[AiPriority] Using rule fallback for "${title}" — ${formatAiFailureReason(category, detail)}`
    );

    return {
      result: null,
      assessmentMethod: "RULE_FALLBACK",
      // Persist user-safe copy only; exact provider error is in server logs above.
      fallbackReason: formatAiFailureUserMessage(category),
    };
  }
}

export const aiPriorityAssessmentService = new AiPriorityAssessmentService();
