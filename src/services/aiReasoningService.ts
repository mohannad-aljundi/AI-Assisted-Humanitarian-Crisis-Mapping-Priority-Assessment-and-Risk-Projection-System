import { callAiJson, isAiAvailable, isAiConfigured } from "@/lib/aiResolver";
import {
  classifyAiFailure,
  formatAiFailureReason,
  sleep,
} from "@/lib/aiAssessmentUtils";
import type {
  AiDimensionReasoning,
  AiFinalReasoning,
  IntelligenceReasoningBundle,
} from "@/types";

const SYSTEM_INSTRUCTION =
  "You are a senior humanitarian intelligence analyst producing explainable, evidence-based assessments. Return only valid JSON. Every field must be specific to this report — quote or paraphrase actual content, never use generic templates.";

const REASONING_SCHEMA = `{
  "finalReasoning": {
    "whatIsHappening": "Specific description of the humanitarian situation in this report",
    "whyImportant": "Why this matters for humanitarian response — cite scale, vulnerability, urgency",
    "evidenceIncreasing": ["Direct quote or fact that raises severity"],
    "evidenceDecreasing": ["Direct quote or fact that lowers severity — required for Medium/Low assessments"],
    "missingInformation": ["What the report does not establish"],
    "assumptionsAvoided": ["What you did not assume without evidence"],
    "aiConfidence": 0.82,
    "conclusion": "2-4 sentence natural-language executive conclusion for decision-makers"
  },
  "priorityReasoning": {
    "conclusion": "Priority judgment headline",
    "narrative": "2-3 sentences on humanitarian severity ONLY — casualties, displacement, needs, vulnerable groups",
    "reasons": ["Severity-specific reason with evidence"],
    "evidenceQuotes": ["Short quote from report"],
    "severityReductionReasons": ["Why NOT Critical/High — required when severity is Medium or Low"]
  },
  "reliabilityReasoning": {
    "conclusion": "Source trust headline",
    "narrative": "2-3 sentences on source credibility, cross-source context, missing info, uncertainty — NOT severity",
    "reasons": ["Trust-specific reason"],
    "evidenceQuotes": ["Quote about source quality or uncertainty"]
  },
  "riskReasoning": {
    "conclusion": "Risk trajectory headline",
    "narrative": "2-3 sentences on escalation or stabilization over time — trends, forecast drivers — NOT current severity alone",
    "reasons": ["Temporal risk driver"],
    "evidenceQuotes": ["Quote about worsening/improving/stable trends"]
  },
  "knownFacts": ["Established fact from report"],
  "unknownFacts": ["Unconfirmed or missing fact affecting confidence"]
}`;

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${field}`);
  }
  return value.trim();
}

function asStringArray(value: unknown, field: string, optional = false): string[] {
  if (!Array.isArray(value)) {
    if (optional) return [];
    throw new Error(`Invalid ${field}`);
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function asConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function parseDimensionReasoning(
  raw: unknown,
  field: string
): AiDimensionReasoning | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  return {
    conclusion: asString(data.conclusion, `${field}.conclusion`),
    narrative: asString(data.narrative, `${field}.narrative`),
    reasons: asStringArray(data.reasons, `${field}.reasons`, true),
    evidenceQuotes: asStringArray(data.evidenceQuotes, `${field}.evidenceQuotes`, true),
    severityReductionReasons: asStringArray(
      data.severityReductionReasons,
      `${field}.severityReductionReasons`,
      true
    ),
  };
}

function parseFinalReasoning(raw: unknown): AiFinalReasoning | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  return {
    whatIsHappening: asString(data.whatIsHappening, "finalReasoning.whatIsHappening"),
    whyImportant: asString(data.whyImportant, "finalReasoning.whyImportant"),
    evidenceIncreasing: asStringArray(data.evidenceIncreasing, "finalReasoning.evidenceIncreasing", true),
    evidenceDecreasing: asStringArray(data.evidenceDecreasing, "finalReasoning.evidenceDecreasing", true),
    missingInformation: asStringArray(data.missingInformation, "finalReasoning.missingInformation", true),
    assumptionsAvoided: asStringArray(data.assumptionsAvoided, "finalReasoning.assumptionsAvoided", true),
    aiConfidence: asConfidence(data.aiConfidence),
    conclusion: asString(data.conclusion, "finalReasoning.conclusion"),
  };
}

function buildReasoningPrompt(
  title: string,
  content: string,
  sourceName?: string
): string {
  return [
    "Analyse this humanitarian crisis report and produce structured explainable reasoning.",
    "Return strict JSON only — no markdown.",
    "",
    "REQUIREMENTS:",
    "1. finalReasoning FIRST: what is happening, why important, evidence for/against severity, gaps, assumptions avoided, confidence, natural-language conclusion.",
    "2. priorityReasoning: humanitarian SEVERITY only — distinct from reliability and risk.",
    "3. reliabilityReasoning: SOURCE TRUST only — credibility, verification language, uncertainty — distinct from priority.",
    "4. riskReasoning: ESCALATION/STABILIZATION over time — trends, forecast — distinct from priority.",
    "5. For Medium or Low severity: MUST populate evidenceDecreasing and severityReductionReasons explaining why NOT Critical (e.g. no confirmed casualties, no infrastructure collapse).",
    "6. knownFacts / unknownFacts: what is established vs what remains uncertain for confidence.",
    "7. Use content-specific quotes and facts — NO generic filler like 'humanitarian situation requires attention'.",
    "8. Each dimension narrative must be UNIQUE — do not copy-paste between priority, reliability, and risk.",
    "",
    sourceName ? `Source: ${sourceName}` : "",
    `Schema: ${REASONING_SCHEMA}`,
    `Title: ${title}`,
    `Content: ${content.slice(0, 8000)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function validateBundle(raw: unknown): IntelligenceReasoningBundle {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI reasoning output is not an object");
  }
  const data = raw as Record<string, unknown>;
  return {
    finalReasoning: parseFinalReasoning(data.finalReasoning),
    priorityReasoning: parseDimensionReasoning(data.priorityReasoning, "priorityReasoning"),
    reliabilityReasoning: parseDimensionReasoning(data.reliabilityReasoning, "reliabilityReasoning"),
    riskReasoning: parseDimensionReasoning(data.riskReasoning, "riskReasoning"),
    knownFacts: asStringArray(data.knownFacts, "knownFacts", true),
    unknownFacts: asStringArray(data.unknownFacts, "unknownFacts", true),
  };
}

export class AiReasoningService {
  isConfigured(): boolean {
    return isAiConfigured();
  }

  async generateIntelligenceReasoning(
    title: string,
    content: string,
    sourceName?: string
  ): Promise<IntelligenceReasoningBundle | null> {
    if (!isAiAvailable()) {
      if (!isAiConfigured()) {
        console.warn(
          `[AiReasoning] No AI API keys configured — skipping reasoning for "${title}"`
        );
      } else {
        console.warn(
          `[AiReasoning] AI providers temporarily unavailable — skipping reasoning for "${title}"`
        );
      }
      return null;
    }

    const prompt = buildReasoningPrompt(title, content, sourceName);
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const raw = await callAiJson(prompt, SYSTEM_INSTRUCTION);
        const bundle = validateBundle(raw);
        console.log(`[AiReasoning] AI reasoning succeeded for "${title}"`);
        return bundle;
      } catch (error) {
        lastError = error;
        const category = classifyAiFailure(error);
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(
          `[AiReasoning] Attempt ${attempt}/2 failed for "${title}" [${category}]: ${detail}`
        );
        if (attempt < 2) {
          await sleep(600);
        }
      }
    }

    const category = classifyAiFailure(lastError);
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    console.error(
      `[AiReasoning] Reasoning unavailable for "${title}" — ${formatAiFailureReason(category, detail)}`
    );
    return null;
  }

  async generateFinalReasoning(
    title: string,
    content: string,
    sourceName?: string
  ): Promise<IntelligenceReasoningBundle | null> {
    return this.generateIntelligenceReasoning(title, content, sourceName);
  }
}

export const aiReasoningService = new AiReasoningService();
