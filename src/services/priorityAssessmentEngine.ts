import type { PriorityLevel } from "@prisma/client";
import { clamp, roundTo } from "@/lib/utils";
import type { NLPAnalysisResult, PriorityResult } from "@/types";

export interface WeightedIndicator {
  id: string;
  label: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  evidence: string;
}

export interface PriorityAssessmentOutput extends PriorityResult {
  indicators: WeightedIndicator[];
  breakdown: Record<string, number>;
  evidence: string[];
}

const INDICATOR_WEIGHTS = {
  casualties: 0.18,
  injured: 0.1,
  displaced: 0.12,
  humanitarianNeeds: 0.1,
  infrastructureDamage: 0.08,
  facilitiesDestroyed: 0.08,
  rescueOperations: 0.04,
  shortages: 0.08,
  escalationLanguage: 0.07,
  vulnerableGroups: 0.06,
  conflictIntensity: 0.05,
  disasterMagnitude: 0.04,
} as const;

function mapToPriorityLevel(priorityScore: number): PriorityLevel {
  // Convert the 0–100 weighted score into the operational priority band.
  if (priorityScore >= 75) return "Critical";
  if (priorityScore >= 50) return "High";
  if (priorityScore >= 25) return "Medium";
  return "Low";
}

function extractNumber(content: string, patterns: RegExp[]): number {
  let max = 0;
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (!match) continue;
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    const value = parseInt(raw.replace(/,/g, ""), 10);
    if (!Number.isNaN(value) && value > max) max = value;
  }
  return max;
}

function scoreCasualties(content: string): { raw: number; evidence: string } {
  const deaths = extractNumber(content, [
    /\b(\d[\d,]*)\s*(?:people\s+)?(?:were\s+)?killed\b/i,
    /\b(\d[\d,]*)\s+deaths?\b/i,
    /\b(\d[\d,]*)\s+dead\b/i,
    /\b(\d[\d,]*)\s+fatalities\b/i,
  ]);

  if (deaths >= 1000) {
    return {
      raw: 100,
      evidence: `${deaths.toLocaleString()} deaths reported — catastrophic casualty scale`,
    };
  }
  if (deaths >= 500) return { raw: 92, evidence: `${deaths.toLocaleString()} fatalities reported` };
  if (deaths >= 100) return { raw: 78, evidence: `${deaths.toLocaleString()} deaths reported` };
  if (deaths >= 10) return { raw: 55, evidence: `${deaths} deaths reported` };
  if (deaths > 0) return { raw: 35, evidence: `${deaths} deaths reported` };
  if (/\bcasualties\b|\bfatalities\b|\bkilled\b/i.test(content)) {
    return { raw: 30, evidence: "Casualties mentioned without specific count" };
  }
  return { raw: 0, evidence: "" };
}

function scoreInjured(content: string): { raw: number; evidence: string } {
  const injured = extractNumber(content, [/\b(\d[\d,]*)\s+injur(?:ed|ies)\b/i]);
  if (injured >= 1000) return { raw: 85, evidence: `${injured.toLocaleString()} injured` };
  if (injured >= 100) return { raw: 65, evidence: `${injured} injured` };
  if (injured > 0) return { raw: 40, evidence: `${injured} injured` };
  if (/\binjur(?:ed|ies)\b/i.test(content)) return { raw: 25, evidence: "Injuries reported" };
  return { raw: 0, evidence: "" };
}

function scoreDisplaced(
  nlp: NLPAnalysisResult,
  content: string
): { raw: number; evidence: string } {
  const pop = nlp.affectedPopulation;
  if (pop !== null && pop >= 1_000_000) {
    return { raw: 95, evidence: `${pop.toLocaleString()} people displaced or affected` };
  }
  if (pop !== null && pop >= 100_000) {
    return { raw: 75, evidence: `${pop.toLocaleString()} displaced or affected` };
  }
  if (pop !== null && pop >= 10_000) {
    return { raw: 55, evidence: `${pop.toLocaleString()} affected population` };
  }
  if (/\bdisplaced\b|\brefugees?\b|\bidps?\b|\bevacuat/i.test(content)) {
    return { raw: 45, evidence: "Displacement or evacuation reported" };
  }
  return { raw: 0, evidence: "" };
}

function scoreHumanitarianNeeds(nlp: NLPAnalysisResult): { raw: number; evidence: string } {
  const needs = nlp.humanitarianNeeds;
  if (needs.length === 0) return { raw: 0, evidence: "" };
  const critical = needs.filter((n) => n.severity === "Critical").length;
  const high = needs.filter((n) => n.severity === "High").length;
  const types = needs.map((n) => n.needType).join(", ");
  const raw = clamp(30 + needs.length * 12 + critical * 15 + high * 8, 0, 100);
  return { raw, evidence: `Humanitarian needs: ${types}` };
}

function scoreInfrastructure(content: string): { raw: number; evidence: string } {
  const hits: string[] = [];
  if (/\binfrastructure\s+damage\b|\bdamaged\s+infrastructure\b/i.test(content)) {
    hits.push("infrastructure damage");
  }
  if (/\broads?\s+(?:blocked|destroyed)\b/i.test(content)) hits.push("roads disrupted");
  if (/\bbridge(?:s)?\s+collapsed\b/i.test(content)) hits.push("bridge collapse");
  if (hits.length === 0) return { raw: 0, evidence: "" };
  return { raw: clamp(35 + hits.length * 20, 0, 90), evidence: hits.join("; ") };
}

function scoreFacilitiesDestroyed(content: string): { raw: number; evidence: string } {
  const hits: string[] = [];
  if (/\bhospitals?\s+(?:destroyed|damaged)\b/i.test(content)) hits.push("hospitals destroyed/damaged");
  if (/\bschools?\s+(?:destroyed|damaged)\b/i.test(content)) hits.push("schools destroyed/damaged");
  if (hits.length === 0) return { raw: 0, evidence: "" };
  return { raw: clamp(40 + hits.length * 25, 0, 95), evidence: hits.join("; ") };
}

function scoreRescueOps(content: string): { raw: number; evidence: string } {
  if (/\brescue\s+operations?\b|\bsearch\s+and\s+rescue\b/i.test(content)) {
    return { raw: 50, evidence: "Active rescue operations ongoing" };
  }
  return { raw: 0, evidence: "" };
}

function scoreShortages(content: string): { raw: number; evidence: string } {
  const hits: string[] = [];
  if (/\bfood\s+shortage\b|\bfamine\b|\bstarvation\b/i.test(content)) hits.push("food shortage");
  if (/\bmedical\s+shortage\b|\bmedicine\s+shortage\b|\bhospital\s+overwhelmed\b/i.test(content)) {
    hits.push("medical shortage");
  }
  if (/\bwater\s+shortage\b|\bno\s+clean\s+water\b/i.test(content)) hits.push("water shortage");
  if (hits.length === 0) return { raw: 0, evidence: "" };
  return { raw: clamp(35 + hits.length * 22, 0, 90), evidence: hits.join("; ") };
}

function scoreEscalation(content: string): { raw: number; evidence: string } {
  const terms = [
    "urgent",
    "emergency",
    "critical",
    "catastrophic",
    "escalat",
    "worsening",
    "immediate",
    "life-threatening",
  ];
  const hits = terms.filter((t) => content.toLowerCase().includes(t));
  if (hits.length === 0) return { raw: 0, evidence: "" };
  return {
    raw: clamp(25 + hits.length * 12, 0, 95),
    evidence: `Urgency language: ${hits.join(", ")}`,
  };
}

function scoreVulnerableGroups(content: string): { raw: number; evidence: string } {
  const hits: string[] = [];
  if (/\bchildren\b|\bchild\b/i.test(content)) hits.push("children");
  if (/\bwomen\b|\bgirls\b/i.test(content)) hits.push("women/girls");
  if (/\belderly\b|\bolder\s+people\b/i.test(content)) hits.push("elderly");
  if (/\brefugees?\b|\bidps?\b/i.test(content)) hits.push("refugees/IDPs");
  if (hits.length === 0) return { raw: 0, evidence: "" };
  return { raw: clamp(30 + hits.length * 15, 0, 85), evidence: `Vulnerable groups: ${hits.join(", ")}` };
}

function scoreConflictIntensity(nlp: NLPAnalysisResult, content: string): { raw: number; evidence: string } {
  if (nlp.crisisType !== "Conflict") return { raw: 0, evidence: "" };
  const hits: string[] = [];
  if (/\bairstrike\b|\bshelling\b|\barmed\s+clash/i.test(content)) hits.push("active combat");
  if (/\bescalat/i.test(content)) hits.push("escalation");
  if (hits.length === 0) return { raw: 40, evidence: "Conflict crisis type detected" };
  return { raw: clamp(50 + hits.length * 20, 0, 95), evidence: hits.join("; ") };
}

function scoreDisasterMagnitude(nlp: NLPAnalysisResult, content: string): { raw: number; evidence: string } {
  const magMatch = content.match(/\bmagnitude\s+(\d+(?:\.\d+)?)\b/i);
  if (magMatch) {
    const mag = parseFloat(magMatch[1]!);
    if (mag >= 7) return { raw: 90, evidence: `Earthquake magnitude ${mag}` };
    if (mag >= 6) return { raw: 70, evidence: `Earthquake magnitude ${mag}` };
    if (mag >= 5) return { raw: 50, evidence: `Earthquake magnitude ${mag}` };
  }
  if (nlp.crisisType === "Earthquake" || nlp.crisisType === "Flood" || nlp.crisisType === "Storm") {
    return { raw: 35, evidence: `${nlp.crisisType} event classified` };
  }
  return { raw: 0, evidence: "" };
}

/**
 * Weighted indicator scoring for humanitarian guardrail validation only.
 * Primary priority decisions are AI-led via aiPriorityAssessmentService.
 */
export class PriorityAssessmentEngine {
  assess(
    nlp: NLPAnalysisResult,
    content: string,
    reliabilityFinalScore = 0.5
  ): PriorityAssessmentOutput {
    const scorers: Array<{
      id: keyof typeof INDICATOR_WEIGHTS;
      label: string;
      score: () => { raw: number; evidence: string };
    }> = [
      { id: "casualties", label: "Casualties / fatalities", score: () => scoreCasualties(content) },
      { id: "injured", label: "Injured", score: () => scoreInjured(content) },
      { id: "displaced", label: "Displaced / affected", score: () => scoreDisplaced(nlp, content) },
      { id: "humanitarianNeeds", label: "Humanitarian needs", score: () => scoreHumanitarianNeeds(nlp) },
      { id: "infrastructureDamage", label: "Infrastructure damage", score: () => scoreInfrastructure(content) },
      { id: "facilitiesDestroyed", label: "Hospitals / schools destroyed", score: () => scoreFacilitiesDestroyed(content) },
      { id: "rescueOperations", label: "Rescue operations", score: () => scoreRescueOps(content) },
      { id: "shortages", label: "Food / medical / water shortages", score: () => scoreShortages(content) },
      { id: "escalationLanguage", label: "Escalation / urgency", score: () => scoreEscalation(content) },
      { id: "vulnerableGroups", label: "Vulnerable groups", score: () => scoreVulnerableGroups(content) },
      { id: "conflictIntensity", label: "Conflict intensity", score: () => scoreConflictIntensity(nlp, content) },
      { id: "disasterMagnitude", label: "Disaster magnitude", score: () => scoreDisasterMagnitude(nlp, content) },
    ];

    const indicators: WeightedIndicator[] = [];
    const breakdown: Record<string, number> = {};
    const evidence: string[] = [];
    let totalWeighted = 0;
    let totalWeight = 0;

    for (const scorer of scorers) {
      const weight = INDICATOR_WEIGHTS[scorer.id];
      const { raw, evidence: ev } = scorer.score();
      if (raw <= 0) continue;
      const weightedScore = raw * weight;
      totalWeighted += weightedScore;
      totalWeight += weight;
      indicators.push({
        id: scorer.id,
        label: scorer.label,
        weight,
        rawScore: raw,
        weightedScore: roundTo(weightedScore, 2),
        evidence: ev,
      });
      breakdown[scorer.id] = roundTo(weightedScore, 2);
      if (ev) evidence.push(ev);
    }

    let priorityScore =
      totalWeight > 0 ? Math.round(totalWeighted / totalWeight) : 0;

    if (/\bhumanitarian\s+emergency\b/i.test(content)) {
      priorityScore = Math.max(priorityScore, 55);
      if (!evidence.some((e) => e.includes("humanitarian emergency"))) {
        evidence.push("Humanitarian emergency declared — minimum High priority floor applied");
      }
    }

    const reliabilityPenalty =
      reliabilityFinalScore < 0.4 ? 5 : reliabilityFinalScore < 0.55 ? 2 : 0;
    priorityScore = clamp(priorityScore - reliabilityPenalty, 0, 100);

    let priorityLevel = mapToPriorityLevel(priorityScore);
    if (/\bhumanitarian\s+emergency\b/i.test(content) && priorityLevel === "Low") {
      priorityLevel = "Medium";
    }

    const reasons = evidence.length > 0 ? evidence : ["Limited humanitarian indicators in report text"];

    return {
      priorityScore,
      severityScore: roundTo(priorityScore / 100, 4),
      priorityLevel,
      reasons,
      indicators,
      breakdown,
      evidence,
    };
  }
}

export const priorityAssessmentEngine = new PriorityAssessmentEngine();
