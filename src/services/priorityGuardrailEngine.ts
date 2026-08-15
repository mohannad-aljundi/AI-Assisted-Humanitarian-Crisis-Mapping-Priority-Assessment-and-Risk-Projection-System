import type { PriorityLevel } from "@prisma/client";
import { roundTo } from "@/lib/utils";
import type { AssessmentMethod } from "@/lib/aiAssessmentUtils";
import type {
  AiPriorityAssessmentResult,
  NLPAnalysisResult,
  PriorityAssessmentPipelineResult,
  PriorityScoreBreakdown,
} from "@/types";
import { priorityAssessmentEngine } from "@/services/priorityAssessmentEngine";

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

const PRIORITY_SCORES: Record<PriorityLevel, number> = {
  Low: 20,
  Medium: 40,
  High: 65,
  Critical: 88,
};

function maxPriorityLevel(a: PriorityLevel, b: PriorityLevel): PriorityLevel {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

function scoreToLevel(score: number): PriorityLevel {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
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

interface HardIndicatorFloor {
  minimumLevel: PriorityLevel;
  minimumScore: number;
  evidence: string[];
}

function detectHardIndicatorFloors(
  content: string,
  nlp: NLPAnalysisResult
): HardIndicatorFloor {
  const evidence: string[] = [];
  let minimumLevel: PriorityLevel = "Low";
  let minimumScore = 0;

  const deaths = extractNumber(content, [
    /\b(\d[\d,]*)\s*(?:people\s+)?(?:were\s+)?killed\b/i,
    /\b(\d[\d,]*)\s+deaths?\b/i,
    /\b(\d[\d,]*)\s+dead\b/i,
    /\b(\d[\d,]*)\s+fatalities\b/i,
  ]);

  if (deaths >= 1000) {
    minimumLevel = maxPriorityLevel(minimumLevel, "Critical");
    minimumScore = Math.max(minimumScore, 90);
    evidence.push(`${deaths.toLocaleString()} deaths reported`);
  } else if (deaths >= 100) {
    minimumLevel = maxPriorityLevel(minimumLevel, "High");
    minimumScore = Math.max(minimumScore, 75);
    evidence.push(`${deaths.toLocaleString()} deaths reported`);
  }

  const pop = nlp.affectedPopulation;
  if (pop !== null && pop >= 1_000_000) {
    minimumLevel = maxPriorityLevel(minimumLevel, "Critical");
    minimumScore = Math.max(minimumScore, 88);
    evidence.push(`${pop.toLocaleString()} people affected or displaced`);
  } else if (pop !== null && pop >= 100_000) {
    minimumLevel = maxPriorityLevel(minimumLevel, "High");
    minimumScore = Math.max(minimumScore, 70);
    evidence.push(`${pop.toLocaleString()} people affected or displaced`);
  } else if (pop !== null && pop >= 1000) {
    minimumLevel = maxPriorityLevel(minimumLevel, "High");
    minimumScore = Math.max(minimumScore, 55);
    evidence.push(`${pop.toLocaleString()} people affected or displaced`);
  }

  const displacedInText = extractNumber(content, [
    /\b(\d[\d,]*)\s+(?:people\s+)?(?:displaced|affected|evacuated)\b/i,
  ]);
  if (displacedInText >= 1000) {
    minimumLevel = maxPriorityLevel(minimumLevel, "High");
    minimumScore = Math.max(minimumScore, 55);
    evidence.push(`${displacedInText.toLocaleString()} displaced or affected`);
  }

  if (/\bhospitals?\s+(?:destroyed|damaged)\b/i.test(content)) {
    minimumLevel = maxPriorityLevel(minimumLevel, "High");
    minimumScore = Math.max(minimumScore, 65);
    evidence.push("Hospital destroyed or damaged");
  }

  if (/\bschools?\s+(?:destroyed|damaged)\b/i.test(content)) {
    minimumLevel = maxPriorityLevel(minimumLevel, "Medium");
    minimumScore = Math.max(minimumScore, 45);
    evidence.push("School destroyed or damaged");
  }

  if (
    /\bdisease\s+outbreak\b|\bepidemic\b|\bcholera\s+outbreak\b/i.test(content)
  ) {
    minimumLevel = maxPriorityLevel(minimumLevel, "High");
    minimumScore = Math.max(minimumScore, 70);
    evidence.push("Disease outbreak reported");
  }

  if (
    /\burgent\s+humanitarian\s+assistance\b|\bhumanitarian\s+emergency\b/i.test(
      content
    )
  ) {
    minimumLevel = maxPriorityLevel(minimumLevel, "High");
    minimumScore = Math.max(minimumScore, 55);
    evidence.push("Urgent humanitarian assistance or emergency declared");
  }

  if (/\brescue\s+operations?\b|\bsearch\s+and\s+rescue\b/i.test(content)) {
    if (deaths >= 100 || (pop !== null && pop >= 1000)) {
      minimumLevel = maxPriorityLevel(minimumLevel, "High");
      minimumScore = Math.max(minimumScore, 60);
      evidence.push("Ongoing rescue operations with significant casualties");
    }
  }

  return { minimumLevel, minimumScore, evidence };
}

function buildGuardrailReason(
  aiLevel: PriorityLevel,
  finalLevel: PriorityLevel,
  evidence: string[]
): string {
  const evidenceText =
    evidence.length > 0
      ? evidence.slice(0, 3).join(", ")
      : "hard humanitarian indicators in the report";
  return `AI assessed priority as ${aiLevel.toUpperCase()}. Guardrail raised it to ${finalLevel.toUpperCase()} because the report mentions ${evidenceText}.`;
}

export class PriorityGuardrailEngine {
  apply(
    aiResult: AiPriorityAssessmentResult | null,
    nlp: NLPAnalysisResult,
    content: string,
    reliabilityFinalScore = 0.5,
    aiOutcome?: { assessmentMethod: AssessmentMethod; fallbackReason: string | null }
  ): PriorityAssessmentPipelineResult {
    const hardFloor = detectHardIndicatorFloors(content, nlp);
    const weighted = priorityAssessmentEngine.assess(
      nlp,
      content,
      reliabilityFinalScore
    );

    let assessmentMethod: AssessmentMethod =
      aiOutcome?.assessmentMethod ?? (aiResult ? "AI" : "RULE_FALLBACK");
    const fallbackReason = aiOutcome?.fallbackReason ?? null;

    let finalLevel: PriorityLevel;
    let finalScore: number;
    let guardrailApplied = false;
    let guardrailReason: string | null = null;
    const guardrailEvidence: string[] = [];

    if (aiResult) {
      const aiLevel = aiResult.priorityLevel;
      const aiScore = aiResult.priorityScore;
      finalLevel = aiLevel;
      finalScore = aiScore;

      if (
        PRIORITY_RANK[hardFloor.minimumLevel] > PRIORITY_RANK[finalLevel] ||
        hardFloor.minimumScore > finalScore + 5
      ) {
        finalLevel = maxPriorityLevel(finalLevel, hardFloor.minimumLevel);
        finalScore = Math.max(finalScore, hardFloor.minimumScore);
        finalLevel = maxPriorityLevel(finalLevel, scoreToLevel(finalScore));
        guardrailApplied = true;
        guardrailEvidence.push(...hardFloor.evidence);
        guardrailReason = buildGuardrailReason(aiLevel, finalLevel, hardFloor.evidence);
        assessmentMethod = "AI_VALIDATED";
      }
    } else {
      finalLevel = maxPriorityLevel(weighted.priorityLevel, hardFloor.minimumLevel);
      finalScore = Math.max(weighted.priorityScore, hardFloor.minimumScore);
      finalLevel = maxPriorityLevel(finalLevel, scoreToLevel(finalScore));
      guardrailEvidence.push(...hardFloor.evidence, ...(weighted.evidence ?? []));
      assessmentMethod = "RULE_FALLBACK";
    }

    const reasons: string[] = [];
    if (aiResult) {
      reasons.push(aiResult.reasoning);
      reasons.push(...aiResult.evidenceQuotes.slice(0, 3));
    }
    if (guardrailApplied && guardrailReason) {
      reasons.unshift(guardrailReason);
    }
    if (reasons.length === 0) {
      reasons.push(...(weighted.reasons ?? []));
    }

    const aiLevel = aiResult?.priorityLevel ?? weighted.priorityLevel;
    const aiScore = aiResult?.priorityScore ?? weighted.priorityScore;

    const scoreBreakdown: PriorityScoreBreakdown = {
      aiAssessment: aiResult,
      guardrailAdjustment: {
        applied: guardrailApplied,
        reason: guardrailReason,
        evidence: guardrailEvidence,
        aiPriorityLevel: aiLevel,
        aiPriorityScore: aiScore,
        finalPriorityLevel: finalLevel,
        finalPriorityScore: finalScore,
      },
      weightedIndicators: weighted.breakdown,
    };

    return {
      priorityScore: finalScore,
      severityScore: roundTo(finalScore / 100, 4),
      priorityLevel: finalLevel,
      reasons: reasons.slice(0, 10),
      breakdown: weighted.breakdown,
      indicators: weighted.indicators,
      evidence:
        guardrailEvidence.length > 0 ? guardrailEvidence : weighted.evidence,
      aiAssessment: aiResult,
      guardrailAdjustment: scoreBreakdown.guardrailAdjustment!,
      scoreBreakdown,
      assessmentMethod,
      fallbackReason,
    };
  }
}

export const priorityGuardrailEngine = new PriorityGuardrailEngine();

/** @internal Exported for tests — priority level rank comparison */
export function priorityLevelRank(level: PriorityLevel): number {
  return PRIORITY_RANK[level];
}

/** @internal Score floor from priority level */
export function priorityLevelToScore(level: PriorityLevel): number {
  return PRIORITY_SCORES[level];
}
