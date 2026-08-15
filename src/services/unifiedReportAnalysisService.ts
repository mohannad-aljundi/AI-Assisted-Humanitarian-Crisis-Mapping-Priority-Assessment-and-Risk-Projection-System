import type { PriorityLevel, RiskLevel, RiskTrend } from "@prisma/client";
import type {
  AiAnalysisResult,
  AiPriorityAssessmentResult,
  AnalyticalRiskProjection,
  DisasterSeverityAssessment,
  DisasterSeverityLevel,
  IntelligenceReasoningBundle,
} from "@/types";
import type {
  CrisisPhase,
  HumanitarianReasoningContext,
  ReportPurpose,
} from "@/lib/humanitarianAnalystReasoning";
import {
  callOpenAiJson,
  isAiAvailable,
  isAiConfigured,
} from "@/lib/aiResolver";
import { sleep } from "@/lib/aiAssessmentUtils";
import { CRISIS_TAXONOMY } from "@/lib/intelligenceConstants";
import {
  normaliseIncidentLabel,
  parseDimensionReasoning,
  parseFinalReasoning,
} from "@/lib/unifiedAnalysisMapper";
import { aiAnalysisService } from "@/services/aiAnalysisService";

/** Legacy per-report AI calls eliminated by unified analysis (7 → 1). */
export const UNIFIED_AI_CALLS_SAVED = 6;

/** Single-call structured output for one report analysis. */
export interface UnifiedReportAnalysisResult {
  incidentLabel: string;
  analysis: AiAnalysisResult;
  priority: AiPriorityAssessmentResult;
  reasoning: IntelligenceReasoningBundle;
  reliabilityScore: number;
  reliabilityReasons: string[];
  riskProjection: AnalyticalRiskProjection;
  disasterSeverity: DisasterSeverityAssessment;
  humanitarianReasoning: HumanitarianReasoningContext;
  overallConfidence: number;
  evidence: string[];
}

const VALID_PRIORITY: PriorityLevel[] = ["Low", "Medium", "High", "Critical"];
const VALID_RISK: RiskLevel[] = ["Low", "Medium", "High", "Critical"];
const VALID_SEVERITY: DisasterSeverityLevel[] = ["Low", "Medium", "High", "Critical"];
const VALID_TRENDS = ["improving", "stable", "worsening"] as const;
const VALID_PURPOSES: ReportPurpose[] = [
  "Active Humanitarian Emergency",
  "Ongoing Disaster Response",
  "Recovery and Reconstruction",
  "Government Funding Announcement",
  "Infrastructure Improvement Project",
  "Early Warning",
  "Preparedness Activity",
  "Policy Announcement",
  "Humanitarian Aid Delivery",
  "Situation Update",
  "Damage Assessment",
  "Monitoring",
  "General News",
  "Unknown",
];
const VALID_PHASES: CrisisPhase[] = [
  "Emergency",
  "Response",
  "Recovery",
  "Reconstruction",
  "Preparedness",
  "Mitigation",
  "Monitoring",
];

const UNIFIED_SCHEMA = `{
  "incidentLabel": "Myanmar Floods",
  "confidence": 0.84,
  "crisisType": "Flood",
  "locations": [{ "name": "Yangon", "country": "Myanmar" }],
  "extractedEntities": [{ "subtype": "CITY", "name": "Yangon", "country": "Myanmar" }],
  "humanitarianNeeds": ["Shelter", "Water"],
  "needDetails": [{ "needType": "Shelter", "severity": "High", "reason": "..." }],
  "affectedPopulation": 12000,
  "situationSummary": "2-4 sentence executive summary.",
  "recommendedActions": ["Deploy shelter supplies"],
  "evidence": ["direct quote or fact from report"],
  "priorityAssessment": {
    "priorityLevel": "High",
    "priorityScore": 72,
    "riskLevel": "High",
    "urgency": "Immediate",
    "humanitarianNeeds": ["Shelter", "Water"],
    "evidenceQuotes": ["quote from report"],
    "reasoning": "Why this priority level.",
    "confidence": 0.85
  },
  "reliabilityAssessment": {
    "score": 0.8,
    "reasons": ["credible source", "consistent with prior reports"]
  },
  "finalReasoning": { "whatIsHappening": "...", "whyImportant": "...", "evidenceIncreasing": [], "evidenceDecreasing": [], "missingInformation": [], "assumptionsAvoided": [], "aiConfidence": 0.8, "conclusion": "..." },
  "priorityReasoning": { "conclusion": "...", "narrative": "...", "reasons": [], "evidenceQuotes": [] },
  "reliabilityReasoning": { "conclusion": "...", "narrative": "...", "reasons": [], "evidenceQuotes": [] },
  "riskReasoning": { "conclusion": "...", "narrative": "...", "reasons": [], "evidenceQuotes": [] },
  "knownFacts": ["fact"],
  "unknownFacts": ["unknown"],
  "riskProjection": {
    "currentScore": 72,
    "forecast24h": 75,
    "forecast72h": 70,
    "forecast7d": 65,
    "trend": "worsening",
    "riskLevel": "High",
    "confidence": 0.82,
    "riskNarrative": "...",
    "currentRiskReason": "...",
    "forecast24hReason": "...",
    "forecast72hReason": "...",
    "forecast7dReason": "...",
    "riskDrivers": [],
    "riskMitigatingFactors": [],
    "uncertainties": [],
    "similarCasesInfluence": []
  },
  "disasterSeverity": {
    "level": "High",
    "score": 7.5,
    "reasoning": "...",
    "reasons": ["..."],
    "confidence": 0.88
  },
  "humanitarianReasoning": {
    "reportPurpose": "Active Humanitarian Emergency",
    "crisisPhase": "Emergency",
    "describesActiveSuffering": true,
    "describesPreventiveOrFutureAction": false,
    "allowsEmergencyNeedInference": true,
    "analystSummary": "..."
  },
  "incidents": [{ "country": "Myanmar", "city": "Yangon", "region": null, "crisisType": "Flood", "crisisExplanation": "...", "entities": [], "humanitarianNeeds": ["Shelter"], "needDetails": [], "affectedPopulation": 12000, "priorityLevel": "High", "priorityReasons": ["..."], "riskLevel": "High", "riskTrend": "Increasing", "riskReasons": ["..."], "reliabilityScore": 0.8, "reliabilityReasons": ["..."], "segmentSummary": "...", "situationSummary": "..." }]
}`;

const SYSTEM_INSTRUCTION =
  "You are a senior UN OCHA humanitarian intelligence analyst. Return ONLY one valid JSON object matching the schema. No markdown fences, no prose, no text before or after the JSON object.";

function buildUnifiedPrompt(title: string, content: string): string {
  const taxonomy = CRISIS_TAXONOMY.join(", ");
  return [
    "Analyse this humanitarian report in a SINGLE pass. Return strict JSON only — no markdown.",
    "",
    "Include ALL required fields in one response:",
    "- incidentLabel, crisisType, locations, extractedEntities",
    "- humanitarianNeeds, priorityAssessment, reliabilityAssessment",
    "- riskProjection, disasterSeverity, humanitarianReasoning",
    "- finalReasoning, priorityReasoning, reliabilityReasoning, riskReasoning",
    "- knownFacts, unknownFacts, evidence, confidence",
    "- situationSummary, recommendedActions",
    "",
    `Crisis types: ${taxonomy}`,
    `Schema: ${UNIFIED_SCHEMA}`,
    `Title: ${title}`,
    `Content: ${content.slice(0, 6000)}`,
  ].join("\n");
}

function buildCompactUnifiedPrompt(title: string, content: string): string {
  return [
    "Return ONE compact JSON object only. No markdown. No prose outside JSON.",
    "Required keys: incidentLabel, crisisType, locations, extractedEntities, humanitarianNeeds,",
    "priorityAssessment, reliabilityAssessment, riskProjection, disasterSeverity,",
    "finalReasoning, priorityReasoning, reliabilityReasoning, riskReasoning,",
    "knownFacts, unknownFacts, evidence, confidence, situationSummary, recommendedActions.",
    `Title: ${title}`,
    `Content: ${content.slice(0, 3500)}`,
  ].join("\n");
}

function asEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function asScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function asReliability(value: unknown, fallback = 0.65): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function parsePriority(raw: unknown, fallbackLevel: PriorityLevel): AiPriorityAssessmentResult {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const level = asEnum(data.priorityLevel, VALID_PRIORITY, fallbackLevel);
  return {
    priorityLevel: level,
    priorityScore: asScore(data.priorityScore, level === "Critical" ? 88 : level === "High" ? 65 : 40),
    riskLevel: asEnum(data.riskLevel, VALID_RISK, "Medium"),
    urgency: typeof data.urgency === "string" && data.urgency.trim() ? data.urgency.trim() : "Moderate",
    humanitarianNeeds: Array.isArray(data.humanitarianNeeds)
      ? data.humanitarianNeeds.filter((n): n is string => typeof n === "string")
      : [],
    evidenceQuotes: Array.isArray(data.evidenceQuotes)
      ? data.evidenceQuotes.filter((n): n is string => typeof n === "string")
      : [],
    reasoning:
      typeof data.reasoning === "string" && data.reasoning.trim()
        ? data.reasoning.trim()
        : "Priority assessed from reported humanitarian impact.",
    confidence: asReliability(data.confidence, 0.7),
  };
}

function parseRiskProjection(raw: unknown, analysis: { riskLevel: RiskLevel; riskTrend: import("@prisma/client").RiskTrend }): AnalyticalRiskProjection {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const trend = asEnum(data.trend, [...VALID_TRENDS], analysis.riskTrend === "Increasing" ? "worsening" : analysis.riskTrend === "Decreasing" ? "improving" : "stable");
  const currentScore = asScore(data.currentScore, 50);
  const asStrings = (v: unknown) =>
    Array.isArray(v) ? v.filter((i): i is string => typeof i === "string" && i.trim().length > 0) : [];

  return {
    currentScore,
    forecast24h: asScore(data.forecast24h, currentScore),
    forecast72h: asScore(data.forecast72h, currentScore),
    forecast7d: asScore(data.forecast7d, currentScore),
    trend,
    riskLevel: asEnum(data.riskLevel, VALID_RISK, analysis.riskLevel),
    confidence: asReliability(data.confidence, 0.7),
    riskNarrative: typeof data.riskNarrative === "string" ? data.riskNarrative : "",
    currentRiskReason: typeof data.currentRiskReason === "string" ? data.currentRiskReason : "",
    forecast24hReason: typeof data.forecast24hReason === "string" ? data.forecast24hReason : "",
    forecast72hReason: typeof data.forecast72hReason === "string" ? data.forecast72hReason : "",
    forecast7dReason: typeof data.forecast7dReason === "string" ? data.forecast7dReason : "",
    riskDrivers: asStrings(data.riskDrivers),
    riskMitigatingFactors: asStrings(data.riskMitigatingFactors),
    uncertainties: asStrings(data.uncertainties),
    similarCasesInfluence: asStrings(data.similarCasesInfluence),
  };
}

function parseDisasterSeverity(raw: unknown): DisasterSeverityAssessment {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const level = asEnum(data.level, VALID_SEVERITY, "Medium");
  const score = Number(data.score);
  return {
    level,
    score: Number.isFinite(score) ? Math.max(0, Math.min(10, Math.round(score * 10) / 10)) : 5,
    reasoning:
      typeof data.reasoning === "string" && data.reasoning.trim()
        ? data.reasoning.trim()
        : "Severity assessed from reported humanitarian impact.",
    reasons: Array.isArray(data.reasons)
      ? data.reasons.filter((r): r is string => typeof r === "string")
      : [],
    confidence: asReliability(data.confidence, 0.7),
    source: "ai",
  };
}

function parseHumanitarianReasoning(
  raw: unknown,
  situationSummary: string
): HumanitarianReasoningContext {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    reportPurpose: asEnum(data.reportPurpose, VALID_PURPOSES, "Situation Update"),
    crisisPhase: asEnum(data.crisisPhase, VALID_PHASES, "Response"),
    describesActiveSuffering: data.describesActiveSuffering !== false,
    describesPreventiveOrFutureAction: data.describesPreventiveOrFutureAction === true,
    allowsEmergencyNeedInference: data.allowsEmergencyNeedInference !== false,
    analystSummary:
      typeof data.analystSummary === "string" && data.analystSummary.trim()
        ? data.analystSummary.trim()
        : situationSummary,
    usedLastResortPackage: false,
  };
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function parseReliabilityFromUnified(
  data: Record<string, unknown>,
  analysisFallback: { score?: number; reasons?: string[] }
): { score: number; reasons: string[] } {
  const nested =
    data.reliabilityAssessment && typeof data.reliabilityAssessment === "object"
      ? (data.reliabilityAssessment as Record<string, unknown>)
      : null;

  const score = asReliability(
    nested?.score ?? data.reliabilityScore ?? analysisFallback.score,
    analysisFallback.score ?? 0.65
  );
  const reasons = nested
    ? parseStringArray(nested.reasons)
    : parseStringArray(data.reliabilityReasons);

  return {
    score,
    reasons: reasons.length > 0 ? reasons : analysisFallback.reasons ?? [],
  };
}

function parseReasoningBundle(
  data: Record<string, unknown>,
  situationSummary: string
): IntelligenceReasoningBundle {
  const nested =
    data.reasoning && typeof data.reasoning === "object"
      ? (data.reasoning as Record<string, unknown>)
      : {};

  return {
    finalReasoning: parseFinalReasoning(
      nested.finalReasoning ?? data.finalReasoning,
      situationSummary
    ),
    priorityReasoning: parseDimensionReasoning(
      nested.priorityReasoning ?? data.priorityReasoning,
      "Priority reflects reported humanitarian urgency."
    ),
    reliabilityReasoning: parseDimensionReasoning(
      nested.reliabilityReasoning ?? data.reliabilityReasoning,
      "Reliability reflects source credibility and consistency."
    ),
    riskReasoning: parseDimensionReasoning(
      nested.riskReasoning ?? data.riskReasoning,
      "Risk reflects projected deterioration or stabilization."
    ),
    knownFacts: parseStringArray(nested.knownFacts ?? data.knownFacts),
    unknownFacts: parseStringArray(nested.unknownFacts ?? data.unknownFacts),
  };
}

function normalizeUnifiedPayload(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...data };

  const coercePriorityLevel = (value: unknown): PriorityLevel => {
    if (typeof value === "string" && VALID_PRIORITY.includes(value as PriorityLevel)) {
      return value as PriorityLevel;
    }
    const text = typeof value === "string" ? value.toLowerCase() : "";
    if (text.includes("critical")) return "Critical";
    if (text.includes("high")) return "High";
    if (text.includes("low")) return "Low";
    return "Medium";
  };

  const priorityAssessment =
    normalized.priorityAssessment && typeof normalized.priorityAssessment === "object"
      ? (normalized.priorityAssessment as Record<string, unknown>)
      : null;
  const riskProjection =
    normalized.riskProjection && typeof normalized.riskProjection === "object"
      ? (normalized.riskProjection as Record<string, unknown>)
      : null;

  normalized.priorityLevel = coercePriorityLevel(
    normalized.priorityLevel ?? priorityAssessment?.priorityLevel
  );
  normalized.riskLevel = coercePriorityLevel(
    normalized.riskLevel ?? priorityAssessment?.riskLevel ?? riskProjection?.riskLevel
  );
  if (!normalized.riskTrend) {
    const trend = typeof riskProjection?.trend === "string" ? riskProjection.trend : "";
    normalized.riskTrend =
      trend === "worsening" ? "Increasing" : trend === "improving" ? "Decreasing" : "Stable";
  }
  if (!normalized.crisisType || typeof normalized.crisisType !== "string") {
    normalized.crisisType = "Unknown";
  }
  if (!Array.isArray(normalized.humanitarianNeeds)) {
    normalized.humanitarianNeeds = [];
  }
  if (!Array.isArray(normalized.locations) || normalized.locations.length === 0) {
    normalized.locations = [{ name: "Unknown", country: "Unknown" }];
  }

  const normalizeEntityList = (raw: unknown): unknown => {
    if (!Array.isArray(raw)) return raw;
    return raw.map((item) => {
      if (typeof item === "string") {
        return { subtype: "LOCATION", name: item };
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const subtype =
          record.subtype ?? record.type ?? record.entitySubtype ?? "LOCATION";
        const name =
          typeof record.name === "string"
            ? record.name
            : typeof record.value === "string"
              ? record.value
              : "Unknown";
        return { ...record, subtype, name };
      }
      return item;
    });
  };

  if (Array.isArray(normalized.extractedEntities)) {
    normalized.entities = normalizeEntityList(normalized.extractedEntities);
  } else if (Array.isArray(normalized.entities)) {
    normalized.entities = normalizeEntityList(normalized.entities);
  }

  if (Array.isArray(normalized.locations)) {
    normalized.locations = normalized.locations.map((loc) => {
      if (typeof loc === "string") {
        const parts = loc.split(",").map((part) => part.trim());
        return {
          name: parts[0] ?? loc,
          country: parts[parts.length - 1] ?? "Unknown",
        };
      }
      return loc;
    });
  }

  return normalized;
}

export class UnifiedReportAnalysisService {
  isConfigured(): boolean {
    return isAiConfigured();
  }

  async analyse(title: string, content: string): Promise<UnifiedReportAnalysisResult | null> {
    if (!isAiAvailable()) return null;

    console.info("[AI] Unified report analysis started");
    const started = Date.now();

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const compact = attempt > 1;
      try {
        const prompt = compact
          ? buildCompactUnifiedPrompt(title, content)
          : buildUnifiedPrompt(title, content);
        const raw = await callOpenAiJson(prompt, SYSTEM_INSTRUCTION, {
          maxOutputTokens: compact ? 4096 : 6000,
        });
        const result = this.validateResult(raw);
        const durationMs = Date.now() - started;
        console.info(`[AI] Unified report analysis completed (${durationMs}ms)`);
        console.info(`[AI] Calls saved: ${UNIFIED_AI_CALLS_SAVED}`);
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          console.warn(
            `[AI] Unified analysis attempt ${attempt} failed — retrying OpenAI with compact prompt:`,
            error instanceof Error ? error.message : error
          );
          await sleep(300);
        }
      }
    }

    console.warn(
      `[AI] Unified report analysis failed for "${title}":`,
      lastError instanceof Error ? lastError.message : lastError
    );
    return null;
  }

  validateResult(raw: unknown): UnifiedReportAnalysisResult {
    if (!raw || typeof raw !== "object") {
      throw new Error("Unified AI output is not an object");
    }

    const data = normalizeUnifiedPayload({ ...(raw as Record<string, unknown>) });
    if (
      Array.isArray(data.extractedEntities) &&
      data.extractedEntities.length > 0 &&
      (!Array.isArray(data.entities) || data.entities.length === 0)
    ) {
      data.entities = data.extractedEntities;
    }

    const analysis = aiAnalysisService.validateResult(data);
    const situationSummary =
      analysis.situationSummary ??
      analysis.crisisExplanation ??
      "Humanitarian situation requires assessment.";

    const incidentLabel = normaliseIncidentLabel(
      typeof data.incidentLabel === "string" && data.incidentLabel.trim()
        ? data.incidentLabel
        : `${analysis.crisisType} Incident`
    );

    const priority = parsePriority(
      data.priorityAssessment ?? data.priority,
      analysis.priorityLevel
    );
    const reasoning = parseReasoningBundle(data, situationSummary);
    const riskProjection = parseRiskProjection(data.riskProjection, {
      riskLevel: analysis.riskLevel,
      riskTrend: analysis.riskTrend,
    });
    const disasterSeverity = parseDisasterSeverity(data.disasterSeverity);
    const humanitarianReasoning = parseHumanitarianReasoning(
      data.humanitarianReasoning,
      situationSummary
    );
    const reliability = parseReliabilityFromUnified(data, {
      score: analysis.reliabilityScore,
      reasons: analysis.reliabilityReasons,
    });
    analysis.reliabilityScore = reliability.score;
    analysis.reliabilityReasons = reliability.reasons;

    const evidence = parseStringArray(data.evidence);
    if (evidence.length === 0) {
      evidence.push(
        ...priority.evidenceQuotes,
        ...(reasoning.finalReasoning?.evidenceIncreasing ?? [])
      );
    }

    return {
      incidentLabel,
      analysis,
      priority,
      reasoning,
      reliabilityScore: reliability.score,
      reliabilityReasons: reliability.reasons,
      riskProjection,
      disasterSeverity,
      humanitarianReasoning,
      overallConfidence: asReliability(
        data.confidence ?? data.overallConfidence,
        priority.confidence
      ),
      evidence,
    };
  }
}

export const unifiedReportAnalysisService = new UnifiedReportAnalysisService();
