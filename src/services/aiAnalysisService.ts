import type {
  PriorityLevel,
  RiskLevel,
  RiskTrend,
} from "@prisma/client";
import {
  callAiJson,
  getActiveAiModel,
  getAiConfig,
  isAiAvailable,
  isAiConfigured,
  testAiConnection,
} from "@/lib/aiResolver";
import { sleep } from "@/lib/aiAssessmentUtils";
import {
  CRISIS_TAXONOMY,
  CRISIS_TYPE_ALIASES,
} from "@/lib/intelligenceConstants";
import type {
  AiAnalysisResult,
  AiEntityResult,
  AiHumanitarianNeedResult,
  AiIncidentResult,
} from "@/types";

export { testAiConnection } from "@/lib/aiResolver";

const VALID_PRIORITY: PriorityLevel[] = ["Low", "Medium", "High", "Critical"];
const VALID_RISK: RiskLevel[] = ["Low", "Medium", "High", "Critical"];
const VALID_TREND: RiskTrend[] = ["Stable", "Increasing", "Decreasing"];

const AI_RESPONSE_SCHEMA = `{
  "incidents": [
    {
      "country": "Sudan",
      "city": "Khartoum",
      "region": null,
      "crisisType": "Conflict",
      "crisisExplanation": "Armed clashes and displacement in Khartoum indicate active conflict.",
      "entities": [
        { "subtype": "HOSPITAL", "name": "Khartoum Hospital", "country": "Sudan", "latitude": null, "longitude": null },
        { "subtype": "CITY", "name": "Khartoum", "country": "Sudan", "latitude": null, "longitude": null }
      ],
      "humanitarianNeeds": ["Medical", "Shelter", "Protection"],
      "needDetails": [
        { "needType": "Medical", "severity": "High", "reason": "Hospitals overwhelmed by casualties" }
      ],
      "affectedPopulation": 1800000,
      "priorityLevel": "Critical",
      "priorityReasons": ["Over 1.8 million affected", "680,000 children impacted", "Major escalation", "Urgent humanitarian assistance required"],
      "riskLevel": "Critical",
      "riskTrend": "Increasing",
      "riskReasons": ["Conflict likely to spread", "Displacement increasing rapidly"],
      "reliabilityScore": 0.84,
      "reliabilityReasons": ["Multiple official sources", "Consistent population figures", "Recent publication"],
      "segmentSummary": "Heavy fighting in Khartoum with mass displacement.",
      "situationSummary": "Heavy fighting continues in Khartoum. Displacement is increasing rapidly. Hospitals are overwhelmed. Immediate medical and shelter assistance is recommended."
    }
  ],
  "entities": [{ "subtype": "COUNTRY", "name": "Sudan", "country": "Sudan" }],
  "locations": [{ "name": "Khartoum", "country": "Sudan" }],
  "crisisType": "Conflict",
  "crisisExplanation": "Semantic classification based on armed violence and displacement.",
  "humanitarianNeeds": ["Medical", "Shelter"],
  "needDetails": [{ "needType": "Medical", "reason": "Hospital capacity exceeded" }],
  "affectedPopulation": 1800000,
  "severityIndicators": ["mass displacement", "hospitals overwhelmed"],
  "priorityLevel": "Critical",
  "priorityReasons": ["Over 1.8 million affected", "Children disproportionately impacted"],
  "riskLevel": "Critical",
  "riskTrend": "Increasing",
  "riskReasons": ["Conflict escalation expected", "Infrastructure damage worsening"],
  "reliabilityScore": 0.84,
  "reliabilityReasons": ["Credible humanitarian source", "Consistent with ReliefWeb reporting"],
  "situationSummary": "Executive summary of the humanitarian situation in 2-4 sentences.",
  "recommendedActions": ["Deploy emergency medical teams", "Pre-position shelter supplies"]
}`;

export function getAiModelName(): string {
  return getActiveAiModel() ?? getAiConfig().model;
}

const SYSTEM_INSTRUCTION =
  "You are a professional humanitarian intelligence analyst. Reason about humanitarian impact, explain all assessments, split multi-incident articles, and return only valid JSON.";

function extractJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    throw new Error("AI response did not contain valid JSON");
  }
}

function normaliseCrisisType(value: string): string {
  const key = value.trim().toLowerCase();
  const mapped = CRISIS_TYPE_ALIASES[key];
  if (mapped) return mapped;
  const match = CRISIS_TAXONOMY.find(
    (type) => type.toLowerCase() === key
  );
  return match ?? value.trim();
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${field}`);
  }
  return value.trim();
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function asEnum<T extends string>(value: unknown, field: string, allowed: T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Invalid ${field}`);
  }
  return value as T;
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Invalid affectedPopulation");
  }
  return Math.round(parsed);
}

function asScoreOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
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

function parseEntities(raw: unknown): AiEntityResult[] {
  if (!Array.isArray(raw)) return [];
  const results: AiEntityResult[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const entity = item as Record<string, unknown>;
    results.push({
      subtype: asString(entity.subtype, `entities[${index}].subtype`).toUpperCase(),
      name: asString(entity.name, `entities[${index}].name`),
      country: asOptionalString(entity.country),
      latitude: asNumberOrNull(entity.latitude),
      longitude: asNumberOrNull(entity.longitude),
    });
  });
  return results;
}

function parseNeedDetails(raw: unknown): AiHumanitarianNeedResult[] {
  if (!Array.isArray(raw)) return [];
  const results: AiHumanitarianNeedResult[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const need = item as Record<string, unknown>;
    results.push({
      needType: asString(need.needType, `needDetails[${index}].needType`),
      severity: asOptionalString(need.severity) ?? undefined,
      reason: asOptionalString(need.reason) ?? undefined,
    });
  });
  return results;
}

function parseIncident(raw: unknown, index: number): AiIncidentResult {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid incidents[${index}]`);
  }
  const item = raw as Record<string, unknown>;
  return {
    country: asString(item.country, `incidents[${index}].country`),
    city: asOptionalString(item.city),
    region: asOptionalString(item.region),
    crisisType: normaliseCrisisType(asString(item.crisisType, `incidents[${index}].crisisType`)),
    crisisExplanation: asOptionalString(item.crisisExplanation) ?? undefined,
    entities: parseEntities(item.entities),
    humanitarianNeeds: asStringArray(
      item.humanitarianNeeds,
      `incidents[${index}].humanitarianNeeds`,
      true
    ),
    needDetails: parseNeedDetails(item.needDetails),
    affectedPopulation: asNumberOrNull(item.affectedPopulation),
    priorityLevel: asEnum(
      item.priorityLevel,
      `incidents[${index}].priorityLevel`,
      VALID_PRIORITY
    ),
    priorityReasons: asStringArray(item.priorityReasons, `incidents[${index}].priorityReasons`, true),
    riskLevel: asEnum(item.riskLevel, `incidents[${index}].riskLevel`, VALID_RISK),
    riskTrend: asEnum(item.riskTrend, `incidents[${index}].riskTrend`, VALID_TREND),
    riskReasons: asStringArray(item.riskReasons, `incidents[${index}].riskReasons`, true),
    reliabilityScore: asScoreOrNull(item.reliabilityScore),
    reliabilityReasons: asStringArray(item.reliabilityReasons, `incidents[${index}].reliabilityReasons`, true),
    segmentSummary: asString(
      item.segmentSummary,
      `incidents[${index}].segmentSummary`
    ),
    situationSummary: asOptionalString(item.situationSummary) ?? undefined,
  };
}

function buildAnalysisPrompt(title: string, content: string): string {
  const taxonomy = CRISIS_TAXONOMY.join(", ");
  return [
    "You are an AI Humanitarian Intelligence Analyst for UN OCHA-style operations.",
    "Analyse the article and return strict JSON only — no markdown.",
    "",
    "REQUIREMENTS:",
    "1. Split multi-event articles into separate incidents (different countries, cities, or independent crises).",
    "2. Extract entities: countries, cities, villages, rivers, hospitals, schools, airports, refugee camps, roads, ports, power plants, bridges, humanitarian facilities.",
    "3. Classify crisis type semantically (not keyword-only) from: " + taxonomy,
    "4. Infer humanitarian needs from meaning using specific types: Medical Aid, Food, Water, Shelter, Infrastructure, Electricity, Fuel, Communication, Logistics, Psychological Support, Disease Outbreak, Child Protection — never use generic 'Multiple Needs' when specifics are detectable.",
    "5. Assess priority holistically based on semantic humanitarian impact — deaths, injuries, displacement, needs, infrastructure, vulnerable groups.",
    "6. Note: a dedicated AI priority assessment runs separately; provide your best estimate here for incident splitting context.",
    "7. Assess reliability: source credibility, consistency, recency, official agencies, contradictions.",
    "8. Project short-term risk with realistic 24h/72h/7d movement and trend (Increasing/Decreasing/Stable) — avoid flat equal projections.",
    "9. Write a rich 2-4 sentence executive situationSummary (never generic like 'Conflict affecting X').",
    "10. Extract entities: cities, regions, countries, organizations, armed groups, UN/government agencies, casualty numbers, earthquake magnitude, damaged infrastructure, critical facilities.",
    "11. Every score must have explanatory reasons arrays with evidence bullets.",
    "",
    `Schema: ${AI_RESPONSE_SCHEMA}`,
    `Title: ${title}`,
    `Content: ${content.slice(0, 8000)}`,
  ].join("\n");
}

export class AiAnalysisService {
  isConfigured(): boolean {
    return isAiConfigured();
  }

  async analyse(title: string, content: string): Promise<AiAnalysisResult | null> {
    if (!isAiAvailable()) return null;

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const prompt = buildAnalysisPrompt(title, content);
        const raw = await callAiJson(prompt, SYSTEM_INSTRUCTION);

        return this.validateResult(
          typeof raw === "string" ? extractJsonPayload(raw) : raw
        );
      } catch (error) {
        lastError = error;
        if (attempt < 2) await sleep(600);
      }
    }

    console.warn(
      `[AiAnalysis] Assessment failed for "${title}":`,
      lastError instanceof Error ? lastError.message : lastError
    );
    return null;
  }

  validateResult(raw: unknown): AiAnalysisResult {
    if (!raw || typeof raw !== "object") {
      throw new Error("AI output is not an object");
    }

    const data = raw as Record<string, unknown>;
    const locations = Array.isArray(data.locations)
      ? data.locations.map((location, index) => {
          if (!location || typeof location !== "object") {
            throw new Error(`Invalid locations[${index}]`);
          }
          const item = location as Record<string, unknown>;
          return {
            name: asString(item.name, `locations[${index}].name`),
            country: asString(item.country, `locations[${index}].country`),
          };
        })
      : [];

    const incidents = Array.isArray(data.incidents)
      ? data.incidents.map((incident, index) => parseIncident(incident, index))
      : undefined;

    if (locations.length === 0 && (!incidents || incidents.length === 0)) {
      throw new Error("At least one location or incident is required");
    }

    return {
      locations,
      entities: parseEntities(data.entities),
      crisisType: normaliseCrisisType(asString(data.crisisType, "crisisType")),
      crisisExplanation: asOptionalString(data.crisisExplanation) ?? undefined,
      humanitarianNeeds: asStringArray(data.humanitarianNeeds, "humanitarianNeeds", true),
      needDetails: parseNeedDetails(data.needDetails),
      affectedPopulation: asNumberOrNull(data.affectedPopulation),
      severityIndicators: asStringArray(data.severityIndicators, "severityIndicators", true),
      priorityLevel: asEnum(data.priorityLevel, "priorityLevel", VALID_PRIORITY),
      priorityReasons: asStringArray(data.priorityReasons, "priorityReasons", true),
      riskLevel: asEnum(data.riskLevel, "riskLevel", VALID_RISK),
      riskTrend: asEnum(data.riskTrend, "riskTrend", VALID_TREND),
      riskReasons: asStringArray(data.riskReasons, "riskReasons", true),
      reliabilityScore: asScoreOrNull(data.reliabilityScore),
      reliabilityReasons: asStringArray(data.reliabilityReasons, "reliabilityReasons", true),
      recommendedActions: asStringArray(data.recommendedActions, "recommendedActions", true),
      situationSummary: asOptionalString(data.situationSummary) ?? undefined,
      incidents,
    };
  }
}

export const aiAnalysisService = new AiAnalysisService();
