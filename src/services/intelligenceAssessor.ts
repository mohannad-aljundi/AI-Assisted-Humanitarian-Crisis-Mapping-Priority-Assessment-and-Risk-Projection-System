import { clamp, roundTo } from "@/lib/utils";
import { OFFICIAL_SOURCE_PATTERNS } from "@/lib/intelligenceConstants";
import { formatAssessmentMethodLabel } from "@/lib/aiAssessmentUtils";
import type {
  AiPriorityAssessmentResult,
  AiAnalysisResult,
  AiDimensionReasoning,
  AiIncidentResult,
  AssessmentExplanation,
  IntelligenceReasoningBundle,
  NLPAnalysisResult,
  PriorityAssessmentPipelineResult,
  PriorityResult,
  ReasoningChainStep,
  ReliabilityResult,
  RiskProjectionResult,
} from "@/types";
import { confidenceEngine } from "@/services/confidenceEngine";
import { priorityGuardrailEngine } from "@/services/priorityGuardrailEngine";
import { reliabilityEngine } from "@/services/reliabilityEngine";
import { riskProjectionEngine } from "@/services/riskProjectionEngine";

export interface AiAssessmentContext {
  title: string;
  content: string;
  reportDate: Date;
  sourceName?: string;
  sourceCredibility?: number;
  ai?: AiAnalysisResult | null;
  aiIncident?: AiIncidentResult | null;
  locationVerified?: boolean;
  /** Pre-computed AI-led priority with guardrail validation */
  priorityPipeline?: PriorityAssessmentPipelineResult;
  /** Structured AI reasoning from aiReasoningService */
  reasoningBundle?: IntelligenceReasoningBundle | null;
}

export interface IntelligenceAssessment {
  nlp: NLPAnalysisResult;
  reliability: ReliabilityResult;
  priority: PriorityResult;
  riskProjection: RiskProjectionResult;
  situationSummary: string | null;
  crisisExplanation: string | null;
  extractionMethod: "ai" | "rules" | "hybrid";
  assessmentMethod: import("@/lib/aiAssessmentUtils").AssessmentMethod;
  assessmentFallbackReason: string | null;
  confidenceLevel: string;
  priorityExplanation: AssessmentExplanation;
  riskExplanation: AssessmentExplanation;
  reliabilityExplanation: AssessmentExplanation;
  evidence: string[];
  confidenceBreakdown: Record<string, number>;
  reasoningChain: ReasoningChainStep[];
  aiPriorityAssessment?: PriorityAssessmentPipelineResult["aiAssessment"];
  guardrailAdjustment?: PriorityAssessmentPipelineResult["guardrailAdjustment"];
  reasoningBundle?: IntelligenceReasoningBundle | null;
}

export class IntelligenceAssessor {
  assess(context: AiAssessmentContext, nlp: NLPAnalysisResult): IntelligenceAssessment {
    const ruleReliability = reliabilityEngine.assess({
      content: context.content,
      reportDate: context.reportDate,
      sourceCredibility: context.sourceCredibility,
      sourceName: context.sourceName,
      locationVerified: context.locationVerified,
    });

    const reliability = this.blendReliability(
      ruleReliability,
      context.content,
      context.sourceName,
      context.aiIncident,
      context.ai
    );

    const priorityPipeline =
      context.priorityPipeline ??
      priorityGuardrailEngine.apply(null, nlp, context.content, reliability.finalScore, {
        assessmentMethod: "RULE_FALLBACK",
        fallbackReason: "Priority pipeline was not pre-computed",
      });

    const priority: PriorityResult = priorityPipeline;

    const ruleRisk = riskProjectionEngine.project(
      nlp,
      priority,
      context.content,
      reliability.finalScore
    );

    const aiIncident = context.aiIncident;
    const ai = context.ai;

    const riskProjection = this.blendRisk(
      ruleRisk,
      aiIncident,
      ai,
      priority,
      reliability,
      priorityPipeline.aiAssessment
    );

    const extractionMethod: IntelligenceAssessment["extractionMethod"] =
      priorityPipeline.assessmentMethod === "LOCAL_REASONING"
        ? "hybrid"
        : priorityPipeline.assessmentMethod === "RULE_FALLBACK"
          ? "rules"
          : priorityPipeline.assessmentMethod === "AI_VALIDATED" ||
              priorityPipeline.assessmentMethod === "AI_WITH_VALIDATION"
            ? "hybrid"
            : "ai";

    const confidence = confidenceEngine.assess({
      nlp,
      reliability,
      content: context.content,
      extractionMethod,
      entityCount: nlp.entities?.length ?? 0,
    });

    const evidence = this.collectEvidence(
      priority,
      reliability,
      riskProjection,
      nlp,
      context.content,
      priorityPipeline
    );

    const priorityExplanation = this.explainPriority(
      priority,
      evidence,
      priorityPipeline,
      context.reasoningBundle
    );
    const riskExplanation = this.explainRisk(
      riskProjection,
      evidence,
      aiIncident,
      ai,
      context.reasoningBundle
    );
    const reliabilityExplanation = this.explainReliability(
      reliability,
      aiIncident,
      ai,
      context.sourceName,
      context.reasoningBundle
    );

    const reasoningChain = this.buildReasoningChain(
      context.reasoningBundle,
      priorityExplanation,
      riskExplanation,
      reliabilityExplanation,
      evidence,
      priorityPipeline
    );

    const situationSummary =
      context.reasoningBundle?.finalReasoning?.conclusion ??
      aiIncident?.situationSummary ??
      ai?.situationSummary ??
      this.buildNarrativeSummary(nlp, priority, riskProjection, context.content);

    const crisisExplanation =
      aiIncident?.crisisExplanation ??
      ai?.crisisExplanation ??
      (nlp.crisisType
        ? `Classified as ${nlp.crisisType} based on semantic analysis of the humanitarian situation described.`
        : null);

    return {
      nlp,
      reliability,
      priority,
      riskProjection,
      situationSummary,
      crisisExplanation,
      extractionMethod,
      assessmentMethod: priorityPipeline.assessmentMethod,
      assessmentFallbackReason: priorityPipeline.fallbackReason ?? null,
      confidenceLevel: confidence.level,
      priorityExplanation,
      riskExplanation,
      reliabilityExplanation,
      evidence,
      confidenceBreakdown: confidence.breakdown,
      reasoningChain,
      aiPriorityAssessment: priorityPipeline.aiAssessment,
      guardrailAdjustment: priorityPipeline.guardrailAdjustment,
      reasoningBundle: context.reasoningBundle ?? null,
    };
  }

  private collectEvidence(
    priority: PriorityResult,
    reliability: ReliabilityResult,
    risk: RiskProjectionResult,
    nlp: NLPAnalysisResult,
    content: string,
    pipeline: PriorityAssessmentPipelineResult
  ): string[] {
    const items = new Set<string>();
    if (pipeline.aiAssessment) {
      for (const quote of pipeline.aiAssessment.evidenceQuotes) items.add(quote);
    }
    for (const e of priority.evidence ?? priority.reasons) items.add(e);
    for (const e of reliability.evidence ?? []) items.add(e);
    for (const e of risk.reasoning ?? []) items.add(e);
    for (const need of nlp.humanitarianNeeds) {
      if (need.evidence) items.add(`${need.needType}: ${need.evidence}`);
      else if (need.reason) items.add(`${need.needType}: ${need.reason}`);
      else if (need.reasoning) items.add(`${need.needType}: ${need.reasoning}`);
    }
    if (nlp.crisisType) items.add(`Crisis classified as ${nlp.crisisType}`);
    if (nlp.affectedPopulation !== null) {
      items.add(`Affected population: ${nlp.affectedPopulation.toLocaleString()}`);
    }
    const loc = nlp.locations[0];
    if (loc?.name) items.add(`Location: ${loc.name}`);
    if (/\bhumanitarian\s+emergency\b/i.test(content)) {
      items.add("Humanitarian emergency language detected in source");
    }
    return [...items].slice(0, 20);
  }

  private buildReasoningChain(
    bundle: IntelligenceReasoningBundle | null | undefined,
    priority: AssessmentExplanation,
    risk: AssessmentExplanation,
    reliability: AssessmentExplanation,
    evidence: string[],
    pipeline: PriorityAssessmentPipelineResult
  ): ReasoningChainStep[] {
    const steps: ReasoningChainStep[] = [];

    if (bundle?.finalReasoning) {
      const fr = bundle.finalReasoning;
      steps.push({
        step: "AI final assessment",
        conclusion: fr.conclusion,
        evidence: [
          ...fr.evidenceIncreasing.slice(0, 3),
          ...fr.evidenceDecreasing.slice(0, 2),
        ],
      });
    } else {
      steps.push({
        step: "Evidence extraction",
        conclusion: `${evidence.length} evidence points collected from source material`,
        evidence: evidence.slice(0, 6),
      });
    }

    if (bundle?.priorityReasoning) {
      steps.push({
        step: "AI priority reasoning",
        conclusion: bundle.priorityReasoning.conclusion,
        evidence: bundle.priorityReasoning.evidenceQuotes.slice(0, 4),
      });
    } else if (pipeline.aiAssessment) {
      steps.push({
        step: "AI priority assessment",
        conclusion: `AI assessed ${pipeline.aiAssessment.priorityLevel} (${pipeline.aiAssessment.priorityScore}/100) — ${pipeline.aiAssessment.urgency} urgency`,
        evidence: pipeline.aiAssessment.evidenceQuotes.slice(0, 4),
      });
    }

    if (bundle?.riskReasoning) {
      steps.push({
        step: "AI risk reasoning",
        conclusion: bundle.riskReasoning.conclusion,
        evidence: bundle.riskReasoning.evidenceQuotes.slice(0, 4),
      });
    }

    if (bundle?.reliabilityReasoning) {
      steps.push({
        step: "AI reliability reasoning",
        conclusion: bundle.reliabilityReasoning.conclusion,
        evidence: bundle.reliabilityReasoning.evidenceQuotes.slice(0, 4),
      });
    }

    if (pipeline.guardrailAdjustment.applied) {
      steps.push({
        step: "Validation rules (guardrail)",
        conclusion: pipeline.guardrailAdjustment.reason ?? "Guardrail validation applied",
        evidence: pipeline.guardrailAdjustment.evidence.slice(0, 4),
      });
    }

    steps.push(
      {
        step: "Final priority",
        conclusion: priority.conclusion,
        evidence: priority.evidence ?? priority.reasons,
      },
      {
        step: "Final risk projection",
        conclusion: risk.conclusion,
        evidence: risk.evidence ?? risk.reasons,
      },
      {
        step: "Final reliability",
        conclusion: reliability.conclusion,
        evidence: reliability.evidence ?? reliability.reasons,
      }
    );

    return steps;
  }

  private dimensionToExplanation(
    dimension: AiDimensionReasoning | null | undefined,
    fallbackConclusion: string,
    fallbackReasons: string[]
  ): AssessmentExplanation {
    if (!dimension) {
      return { conclusion: fallbackConclusion, reasons: fallbackReasons };
    }
    const reasons = [
      dimension.narrative,
      ...dimension.reasons,
      ...(dimension.severityReductionReasons ?? []),
    ].filter(Boolean);
    return {
      conclusion: dimension.conclusion,
      reasons: [...new Set(reasons)].slice(0, 10),
      evidence: dimension.evidenceQuotes,
    };
  }

  private buildNarrativeSummary(
    nlp: NLPAnalysisResult,
    priority: PriorityResult,
    risk: RiskProjectionResult,
    content: string
  ): string {
    const location = nlp.locations[0]?.name ?? "the affected region";
    const crisis = nlp.crisisType ?? "humanitarian crisis";
    const needs =
      nlp.humanitarianNeeds.length > 0
        ? nlp.humanitarianNeeds.map((n) => n.needType.toLowerCase()).join(", ")
        : "multiple humanitarian needs";

    const pop =
      nlp.affectedPopulation !== null
        ? ` An estimated ${nlp.affectedPopulation.toLocaleString()} people are affected.`
        : "";

    const casualtyMatch = content.match(/\b(\d[\d,]*)\s+(?:deaths?|killed|fatalities)\b/i);
    const casualty =
      casualtyMatch
        ? ` Reports indicate ${casualtyMatch[1]} fatalities.`
        : "";

    const urgency = priority.priorityLevel === "Critical" || priority.priorityLevel === "High"
      ? " Immediate humanitarian response is warranted."
      : "";

    return (
      `A ${crisis.toLowerCase()} is unfolding in ${location}.${pop}${casualty} ` +
      `Priority is assessed as ${priority.priorityLevel} with a ${risk.trend.toLowerCase()} risk trend. ` +
      `Primary needs include ${needs}.${urgency}`
    ).trim();
  }

  private blendReliability(
    rule: ReliabilityResult,
    content: string,
    sourceName?: string,
    incident?: AiIncidentResult | null,
    ai?: AiAnalysisResult | null
  ): ReliabilityResult {
    const aiScore = incident?.reliabilityScore ?? ai?.reliabilityScore;
    const officialBoost = OFFICIAL_SOURCE_PATTERNS.some((pattern) =>
      pattern.test(`${sourceName ?? ""} ${content}`)
    )
      ? 0.06
      : 0;

    let finalScore = rule.finalScore;
    if (aiScore !== undefined && aiScore !== null) {
      finalScore = clamp(rule.finalScore * 0.45 + aiScore * 0.55 + officialBoost, 0, 1);
    } else {
      finalScore = clamp(rule.finalScore + officialBoost, 0, 1);
    }

    return {
      ...rule,
      finalScore: roundTo(finalScore),
    };
  }

  private blendRisk(
    rule: RiskProjectionResult,
    incident?: AiIncidentResult | null,
    ai?: AiAnalysisResult | null,
    priority?: PriorityResult,
    reliability?: ReliabilityResult,
    aiPriority?: AiPriorityAssessmentResult | null
  ): RiskProjectionResult {
    const aiRisk = incident?.riskLevel ?? ai?.riskLevel ?? aiPriority?.riskLevel;
    const aiTrend = incident?.riskTrend ?? ai?.riskTrend;
    const aiReasons = incident?.riskReasons ?? ai?.riskReasons ?? [];

    if (!aiRisk || !aiTrend) return rule;

    const confidence = roundTo(
      clamp((reliability?.finalScore ?? 0.5) * 0.6 + rule.confidenceScore * 0.4, 0, 1)
    );

    const aiScore =
      aiRisk === "Critical" ? 88 : aiRisk === "High" ? 68 : aiRisk === "Medium" ? 42 : 22;
    const blendedScore = Math.round((rule.currentScore ?? 45) * 0.4 + aiScore * 0.6);

    return {
      riskLevel: aiRisk,
      trend: aiTrend,
      confidenceScore: confidence,
      reasoning: aiReasons.length > 0 ? aiReasons : rule.reasoning,
      currentScore: blendedScore,
      horizons: rule.horizons,
      breakdown: rule.breakdown,
    };
  }

  private explainPriority(
    priority: PriorityResult,
    evidence: string[],
    pipeline: PriorityAssessmentPipelineResult,
    bundle?: IntelligenceReasoningBundle | null
  ): AssessmentExplanation {
    const methodLabel = formatAssessmentMethodLabel(
      pipeline.assessmentMethod ?? (pipeline.aiAssessment ? "AI" : "RULE_FALLBACK")
    );

    if (bundle?.priorityReasoning) {
      const explained = this.dimensionToExplanation(
        bundle.priorityReasoning,
        `Priority: ${priority.priorityLevel} (score ${priority.priorityScore}/100) — ${methodLabel}`,
        pipeline.aiAssessment?.reasoning ? [pipeline.aiAssessment.reasoning] : priority.reasons
      );
      return {
        ...explained,
        conclusion: `Priority: ${priority.priorityLevel} (score ${priority.priorityScore}/100) — ${methodLabel}`,
        assessmentMethod: pipeline.assessmentMethod,
        fallbackReason: pipeline.fallbackReason ?? null,
      };
    }

    const reasons: string[] = [];

    if (pipeline.guardrailAdjustment.applied && pipeline.guardrailAdjustment.reason) {
      reasons.push(pipeline.guardrailAdjustment.reason);
    }

    if (pipeline.aiAssessment) {
      reasons.push(pipeline.aiAssessment.reasoning);
      reasons.push(...pipeline.aiAssessment.evidenceQuotes.slice(0, 3));
    } else {
      reasons.push(...priority.reasons);
      if (pipeline.fallbackReason) {
        reasons.push(pipeline.fallbackReason);
      }
    }

    return {
      conclusion: `Priority: ${priority.priorityLevel} (score ${priority.priorityScore}/100) — ${methodLabel}`,
      reasons: [...new Set(reasons)].slice(0, 8),
      evidence: evidence.slice(0, 8),
      assessmentMethod: pipeline.assessmentMethod,
      fallbackReason: pipeline.fallbackReason ?? null,
    };
  }

  private explainRisk(
    risk: RiskProjectionResult,
    evidence: string[],
    incident?: AiIncidentResult | null,
    ai?: AiAnalysisResult | null,
    bundle?: IntelligenceReasoningBundle | null
  ): AssessmentExplanation {
    if (bundle?.riskReasoning) {
      return this.dimensionToExplanation(
        bundle.riskReasoning,
        `Risk projection: ${risk.riskLevel} (${risk.trend})`,
        risk.reasoning ?? []
      );
    }

    const aiReasons = incident?.riskReasons ?? ai?.riskReasons ?? [];
    const reasons =
      aiReasons.length > 0
        ? aiReasons
        : risk.reasoning ?? [
            `Projected risk level: ${risk.riskLevel}`,
            `Trend: ${risk.trend}`,
            `Confidence: ${Math.round(risk.confidenceScore * 100)}%`,
          ];

    return {
      conclusion: `Risk projection: ${risk.riskLevel} (${risk.trend}) — current score ${risk.currentScore ?? "—"}/100`,
      reasons,
      evidence: evidence.filter((e) =>
        /risk|escalat|worsen|trend|forecast/i.test(e)
      ).slice(0, 6),
    };
  }

  private explainReliability(
    reliability: ReliabilityResult,
    incident?: AiIncidentResult | null,
    ai?: AiAnalysisResult | null,
    sourceName?: string,
    bundle?: IntelligenceReasoningBundle | null
  ): AssessmentExplanation {
    if (bundle?.reliabilityReasoning) {
      return this.dimensionToExplanation(
        bundle.reliabilityReasoning,
        `Reliability: ${Math.round(reliability.finalScore * 100)}%`,
        reliability.evidence ?? []
      );
    }

    const aiReasons = incident?.reliabilityReasons ?? ai?.reliabilityReasons ?? [];
    const reasons =
      aiReasons.length > 0
        ? aiReasons
        : reliability.evidence ??
          [
            `Source credibility: ${Math.round(reliability.sourceScore * 100)}%`,
            `Content consistency: ${Math.round(reliability.consistencyScore * 100)}%`,
            `Recency: ${Math.round(reliability.recencyScore * 100)}%`,
          ];

    if (sourceName && !reasons.some((r) => r.includes(sourceName))) {
      reasons.push(`Evaluated source: ${sourceName}`);
    }

    return {
      conclusion: `Reliability: ${Math.round(reliability.finalScore * 100)}%`,
      reasons,
      evidence: reliability.evidence,
    };
  }
}

export const intelligenceAssessor = new IntelligenceAssessor();
