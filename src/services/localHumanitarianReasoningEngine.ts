import type { PriorityLevel, RiskLevel, RiskTrend } from "@prisma/client";
import {
  buildHumanitarianReasoningContext,
  type HumanitarianReasoningContext,
} from "@/lib/humanitarianAnalystReasoning";
import type { AssessmentMethod } from "@/lib/aiAssessmentUtils";
import { NEED_INFERENCE_RULES } from "@/lib/intelligenceConstants";
import {
  canonicalNeedKey,
  normaliseNeedName,
} from "@/lib/humanitarianNeedTaxonomy";
import { priorityAssessmentEngine } from "@/services/priorityAssessmentEngine";
import { reliabilityEngine } from "@/services/reliabilityEngine";
import { riskProjectionEngine } from "@/services/riskProjectionEngine";
import { continuousHumanitarianLearningEngine } from "@/services/continuousHumanitarianLearningEngine";
import type {
  ExtractedHumanitarianNeed,
  NLPAnalysisResult,
  PriorityResult,
  ReasoningChainStep,
  ReliabilityResult,
  RiskProjectionResult,
} from "@/types";

export interface LocalEvidenceItem {
  category: string;
  snippet: string;
  confidence: number;
}

export interface LocalReasoningStep {
  stage: string;
  observedEvidence: string[];
  interpretation: string;
  inferredConsequence: string;
  finalDecision: string;
  confidence: number;
}

export interface LocalReasoningInput {
  title: string;
  content: string;
  reportDate?: Date;
  sourceName?: string;
  sourceCredibility?: number;
  nlp?: NLPAnalysisResult;
  reportId?: string;
}

export interface LocalReasoningAssessment {
  context: HumanitarianReasoningContext;
  evidence: LocalEvidenceItem[];
  humanitarianNeeds: ExtractedHumanitarianNeed[];
  priority: PriorityResult;
  reliability: ReliabilityResult;
  riskProjection: RiskProjectionResult;
  reasoningChain: ReasoningChainStep[];
  situationSummary: string;
  assessmentMethod: AssessmentMethod;
  learningInfluence: string | null;
}

const EVIDENCE_PATTERNS: Array<{ category: string; pattern: RegExp; confidence: number }> = [
  { category: "Deaths", pattern: /\b(\d[\d,]*)\s+(?:people\s+)?(?:killed|dead|deaths?|fatalities)\b/i, confidence: 0.92 },
  { category: "Injuries", pattern: /\b(\d[\d,]*)\s+injur(?:ed|ies)\b/i, confidence: 0.9 },
  { category: "Displaced", pattern: /\b(\d[\d,]*)\s+(?:displaced|evacuated|affected)\b/i, confidence: 0.88 },
  { category: "Damaged homes", pattern: /\b(?:destroyed|damaged)\s+(?:homes|houses|buildings)\b/i, confidence: 0.86 },
  { category: "Damaged hospitals", pattern: /\bhospital(?:s)?\s+(?:destroyed|damaged|overwhelmed)\b/i, confidence: 0.9 },
  { category: "Damaged roads", pattern: /\b(?:road|bridge)(?:s)?\s+(?:blocked|destroyed|damaged|collapsed)\b/i, confidence: 0.85 },
  { category: "Food shortage", pattern: /\bfood\s+(?:shortage|insecurity|crisis)\b/i, confidence: 0.88 },
  { category: "Water shortage", pattern: /\b(?:no\s+clean\s+water|water\s+shortage|contaminated\s+water)\b/i, confidence: 0.88 },
  { category: "Disease outbreak", pattern: /\b(?:disease\s+outbreak|epidemic|cholera|outbreak)\b/i, confidence: 0.87 },
  { category: "Power outage", pattern: /\b(?:power\s+outage|blackout|grid\s+down)\b/i, confidence: 0.84 },
  { category: "Blocked access", pattern: /\b(?:blocked\s+access|cut\s+off|inaccessible|roads?\s+blocked)\b/i, confidence: 0.86 },
  { category: "Vulnerable groups", pattern: /\b(?:children|elderly|pregnant|disabled|vulnerable\s+(?:groups|populations))\b/i, confidence: 0.8 },
  { category: "Trapped people", pattern: /\b(?:trapped|buried|under\s+debris)\b/i, confidence: 0.9 },
];

const CONTROLLED_INFERENCE: Array<{
  evidenceCategories: string[];
  need: string;
  reasoning: string;
  minConfidence: number;
}> = [
  {
    evidenceCategories: ["Trapped people", "Damaged homes"],
    need: "Search & Rescue",
    reasoning: "Structural collapse with people trapped implies immediate search and rescue capacity.",
    minConfidence: 0.75,
  },
  {
    evidenceCategories: ["Damaged hospitals", "Injuries", "Deaths"],
    need: "Medical Aid",
    reasoning: "Casualties combined with damaged or overwhelmed medical facilities imply medical response needs.",
    minConfidence: 0.7,
  },
  {
    evidenceCategories: ["Displaced", "Damaged homes"],
    need: "Shelter",
    reasoning: "Displacement or destroyed housing implies emergency shelter requirements.",
    minConfidence: 0.72,
  },
  {
    evidenceCategories: ["Water shortage"],
    need: "Water",
    reasoning: "Explicit water access problems imply WASH response needs.",
    minConfidence: 0.8,
  },
  {
    evidenceCategories: ["Food shortage"],
    need: "Food",
    reasoning: "Explicit food insecurity language implies nutrition assistance needs.",
    minConfidence: 0.8,
  },
  {
    evidenceCategories: ["Blocked access", "Damaged roads"],
    need: "Logistics",
    reasoning: "Access constraints imply logistics and route clearance priorities.",
    minConfidence: 0.75,
  },
  {
    evidenceCategories: ["Disease outbreak"],
    need: "Medical Aid",
    reasoning: "Disease outbreak signals require medical surveillance and treatment capacity.",
    minConfidence: 0.78,
  },
  {
    evidenceCategories: ["Power outage"],
    need: "Power/Electricity",
    reasoning: "Power infrastructure failure affects hospitals, water systems, and cold chains.",
    minConfidence: 0.72,
  },
  {
    evidenceCategories: ["Vulnerable groups"],
    need: "Protection",
    reasoning: "Explicit vulnerable population mentions elevate protection monitoring needs.",
    minConfidence: 0.68,
  },
];

function extractEvidence(content: string): LocalEvidenceItem[] {
  const items: LocalEvidenceItem[] = [];
  const seen = new Set<string>();

  for (const rule of EVIDENCE_PATTERNS) {
    const match = content.match(rule.pattern);
    if (!match) continue;
    const snippet = match[0].trim();
    const key = `${rule.category}:${snippet.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ category: rule.category, snippet, confidence: rule.confidence });
  }

  return items.sort((a, b) => b.confidence - a.confidence);
}

function inferNeedsFromEvidence(
  content: string,
  evidence: LocalEvidenceItem[],
  context: HumanitarianReasoningContext
): ExtractedHumanitarianNeed[] {
  const needs: ExtractedHumanitarianNeed[] = [];
  const seen = new Set<string>();
  const categories = new Set(evidence.map((item) => item.category));

  const addNeed = (
    need: string,
    source: "Observed" | "Inferred",
    evidenceText: string,
    reasoning: string,
    confidence: number
  ) => {
    const key = canonicalNeedKey(normaliseNeedName(need));
    if (seen.has(key)) return;
    seen.add(key);
    needs.push({
      needType: normaliseNeedName(need),
      severity: confidence >= 0.85 ? "High" : confidence >= 0.65 ? "Medium" : "Low",
      reason: reasoning,
      source,
      evidence: evidenceText,
      reasoning,
      confidence,
    });
  };

  for (const rule of NEED_INFERENCE_RULES) {
    const match = content.match(rule.pattern);
    if (!match) continue;
    addNeed(
      rule.need,
      "Observed",
      `Report states: "${match[0]}"`,
      rule.reason,
      0.88
    );
  }

  if (context.allowsEmergencyNeedInference) {
    for (const rule of CONTROLLED_INFERENCE) {
      const matched = rule.evidenceCategories.filter((cat) => categories.has(cat));
      if (matched.length === 0) continue;
      const avgConfidence =
        evidence
          .filter((item) => matched.includes(item.category))
          .reduce((sum, item) => sum + item.confidence, 0) / matched.length;
      if (avgConfidence < rule.minConfidence) continue;

      const evidenceText = evidence
        .filter((item) => matched.includes(item.category))
        .map((item) => item.snippet)
        .join("; ");

      addNeed(rule.need, "Inferred", evidenceText, rule.reasoning, avgConfidence);
    }
  }

  return needs;
}

function buildReasoningChain(
  context: HumanitarianReasoningContext,
  evidence: LocalEvidenceItem[],
  priority: PriorityResult,
  needs: ExtractedHumanitarianNeed[],
  risk: RiskProjectionResult,
  reliability: ReliabilityResult,
  learningInfluence: string | null
): ReasoningChainStep[] {
  const steps: ReasoningChainStep[] = [
    {
      step: "Context understanding",
      conclusion: context.analystSummary,
      evidence: [context.reportPurpose, context.crisisPhase],
    },
    {
      step: "Evidence review",
      conclusion:
        evidence.length > 0
          ? `Identified ${evidence.length} explicit evidence signal(s).`
          : "No strong explicit evidence signals detected.",
      evidence: evidence.slice(0, 5).map((item) => `${item.category}: ${item.snippet}`),
    },
    {
      step: "Humanitarian needs",
      conclusion:
        needs.length > 0
          ? `Evidence-supported needs: ${needs.map((n) => n.needType).join(", ")}.`
          : "No evidence-supported humanitarian needs inferred.",
      evidence: needs.slice(0, 4).map((n) => n.evidence ?? n.needType),
    },
    {
      step: "Priority assessment",
      conclusion: `Priority ${priority.priorityLevel} based on severity indicators and urgency language.`,
      evidence: priority.reasons.slice(0, 4),
    },
    {
      step: "Risk projection",
      conclusion: `Risk trend assessed as ${risk.trend} with ${risk.riskLevel} current risk level.`,
      evidence: risk.reasoning ?? [],
    },
    {
      step: "Reliability assessment",
      conclusion: `Source reliability scored at ${Math.round(reliability.finalScore * 100)}%.`,
      evidence: reliability.evidence ?? [],
    },
  ];

  if (learningInfluence) {
    steps.push({
      step: "Learning memory",
      conclusion: learningInfluence,
      evidence: [],
    });
  }

  return steps;
}

function buildSituationSummary(
  title: string,
  context: HumanitarianReasoningContext,
  evidence: LocalEvidenceItem[],
  priority: PriorityLevel
): string {
  const evidenceSummary =
    evidence.length > 0
      ? ` Key evidence includes ${evidence
          .slice(0, 3)
          .map((item) => item.category.toLowerCase())
          .join(", ")}.`
      : "";
  return `${title}: classified as ${context.reportPurpose} during ${context.crisisPhase} phase with ${priority} priority.${evidenceSummary}`;
}

export class LocalHumanitarianReasoningEngine {
  async assess(input: LocalReasoningInput): Promise<LocalReasoningAssessment> {
    const reportDate = input.reportDate ?? new Date();
    const nlp =
      input.nlp ??
      ({
        locations: [],
        entities: [],
        crisisType: null,
        humanitarianNeeds: [],
        affectedPopulation: null,
      } satisfies NLPAnalysisResult);

    const context = buildHumanitarianReasoningContext(
      input.title,
      input.content,
      nlp.crisisType
    );

    const evidence = extractEvidence(input.content);
    const humanitarianNeeds = inferNeedsFromEvidence(input.content, evidence, context);

    const priorityOutput = priorityAssessmentEngine.assess(
      nlp,
      input.content,
      input.sourceCredibility ?? 0.5
    );

    const priority: PriorityResult = {
      priorityScore: priorityOutput.priorityScore,
      severityScore: priorityOutput.severityScore,
      priorityLevel: priorityOutput.priorityLevel,
      reasons: priorityOutput.reasons,
    };

    const reliability = reliabilityEngine.assess({
      content: input.content,
      reportDate,
      sourceCredibility: input.sourceCredibility,
      sourceName: input.sourceName,
      locationVerified: nlp.locations.some(
        (loc) => loc.validationStatus === "verified" || loc.confidence !== undefined
      ),
    });

    const riskProjection = riskProjectionEngine.project(
      nlp,
      priority,
      input.content,
      reliability.finalScore
    );

    let learningInfluence: string | null = null;
    if (input.reportId) {
      try {
        const similar = await continuousHumanitarianLearningEngine.findSimilarIncidents({
          reportId: input.reportId,
          title: input.title,
          content: input.content,
          crisisType: nlp.crisisType,
          reportPurpose: context.reportPurpose,
          crisisPhase: context.crisisPhase,
          priorityLevel: priority.priorityLevel,
          limit: 2,
        });
        if (similar.length > 0) {
          const top = similar[0]!;
          learningInfluence = `Historical case "${top.title}" (${Math.round(top.similarityScore * 100)}% similar) informed confidence calibration. ${top.similarityReasons.slice(0, 2).join("; ")}.`;
        }
      } catch {
        learningInfluence = null;
      }
    }

    const reasoningChain = buildReasoningChain(
      context,
      evidence,
      priority,
      humanitarianNeeds,
      riskProjection,
      reliability,
      learningInfluence
    );

    return {
      context,
      evidence,
      humanitarianNeeds,
      priority,
      reliability,
      riskProjection,
      reasoningChain,
      situationSummary: buildSituationSummary(
        input.title,
        context,
        evidence,
        priority.priorityLevel
      ),
      assessmentMethod: "LOCAL_REASONING",
      learningInfluence,
    };
  }
}

export const localHumanitarianReasoningEngine = new LocalHumanitarianReasoningEngine();
