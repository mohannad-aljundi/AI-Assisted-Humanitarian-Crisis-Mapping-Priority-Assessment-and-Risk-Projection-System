import type {
  AiFinalReasoning,
  CrossSourceAnalysis,
  ExtendedAnalysisInsight,
  LocationReasoning,
} from "@/types";

/** Bump when explainability or intelligence pipeline output shape changes. */
export { INTELLIGENCE_PIPELINE_VERSION } from "@/lib/pipelineVersions";

export interface PublicPipelineStep {
  order: number;
  name: string;
  description: string;
}

/** Human-readable analytical steps — no implementation identifiers. */
export const PUBLIC_ANALYTICAL_STEPS: PublicPipelineStep[] = [
  {
    order: 1,
    name: "AI reasoning",
    description:
      "Semantic review of the full report: what is happening, why it matters, and what evidence supports or reduces severity.",
  },
  {
    order: 2,
    name: "Cross-source analysis",
    description:
      "Comparison with corroborating or conflicting sources when multiple reports describe the same crisis.",
  },
  {
    order: 3,
    name: "Entity extraction",
    description:
      "Identification of places, organisations, facilities, casualties, and infrastructure mentioned in the report.",
  },
  {
    order: 4,
    name: "Humanitarian need inference",
    description:
      "Observed and inferred humanitarian needs based on situational context, not keywords alone.",
  },
  {
    order: 5,
    name: "Location verification",
    description:
      "Geographic resolution from extracted place names with confidence and ambiguity handling.",
  },
  {
    order: 6,
    name: "Priority assessment",
    description:
      "AI-led judgement of humanitarian severity using evidence from the report.",
  },
  {
    order: 7,
    name: "Risk projection",
    description:
      "Assessment of whether the situation may escalate or stabilise over the coming days.",
  },
  {
    order: 8,
    name: "Reliability assessment",
    description:
      "Evaluation of source trust, publication recency, and cross-source agreement.",
  },
  {
    order: 9,
    name: "Confidence evaluation",
    description:
      "Overall certainty based on completeness, consistency, and verification of key facts.",
  },
  {
    order: 10,
    name: "Quality assurance validation",
    description:
      "Deterministic checks that prevent obviously inconsistent AI conclusions on hard humanitarian indicators.",
  },
];

const TECHNICAL_NAME_PATTERN =
  /\b(?:aiReasoningService|crossSourceIntelligenceService|humanitarianNeedInferenceService|entityExtractionService|locationValidationService|priorityAssessmentEngine|priorityGuardrailEngine|reliabilityEngine|riskProjectionEngine|confidenceEngine|intelligenceAssessor|analysisService|nlpService|aiAnalysisService|aiPriorityAssessmentService)\b/gi;

const TECHNICAL_FILE_PATTERN = /\b[\w]+(?:Service|Engine)\.ts\b/gi;

const TECHNICAL_CREDENTIAL_PATTERN =
  /\b(?:OPENAI_API_KEY|GEMINI_API_KEY|OPENROUTER_API_KEY|AI_API_KEY|API[_ ]?key|stack trace|Missing credentials|No AI provider configured|Gemini unavailable|OpenAI unavailable)\b/gi;

export function sanitizeAnalystText(text: string): string {
  return text
    .replace(TECHNICAL_FILE_PATTERN, "")
    .replace(TECHNICAL_NAME_PATTERN, "")
    .replace(TECHNICAL_CREDENTIAL_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .trim();
}

export function formatAnalysisMethodLabel(
  extractionMethod?: string | null
): string {
  if (extractionMethod === "hybrid") {
    return "AI-assisted analysis with quality assurance validation";
  }
  if (extractionMethod === "ai") {
    return "AI-assisted humanitarian intelligence";
  }
  if (extractionMethod === "rules") {
    return "Rule-based analysis (AI unavailable for this report)";
  }
  return "AI-assisted humanitarian intelligence";
}

export function formatAiModelForDisplay(model?: string | null): string {
  if (!model?.trim()) return "cloud AI";
  const cleaned = sanitizeAnalystText(model);
  const lower = cleaned.toLowerCase();
  if (lower.includes("gpt-5") || lower.includes("gpt5")) return "GPT-5";
  if (lower.includes("gpt-4") || lower.includes("gpt4")) return "GPT-4";
  if (lower.includes("gpt")) return cleaned.replace(/^openai\//i, "").trim() || "GPT";
  if (lower.includes("gemini")) return "Gemini";
  if (lower.includes("openrouter")) return "cloud AI";
  if (lower.includes("openai")) return "OpenAI";
  return cleaned.replace(/\s*\([^)]*\)\s*$/, "").trim() || "cloud AI";
}

export function formatCrossSourceNarrative(
  analysis: CrossSourceAnalysis
): string {
  const parts: string[] = [sanitizeAnalystText(analysis.narrative)];
  if (analysis.sources.length > 0) {
    parts.push(`Sources reviewed: ${analysis.sources.join(", ")}.`);
  }
  if (analysis.agreementPercent >= 75) {
    parts.push("Cross-source agreement is high.");
  } else if (analysis.agreementPercent < 50) {
    parts.push("Sources show limited agreement — treat details with caution.");
  }
  if (analysis.reliabilityDelta) {
    const { before, after } = analysis.reliabilityDelta;
    if (after > before) {
      parts.push(
        `Reliability increased after corroboration (${Math.round(before * 100)}% → ${Math.round(after * 100)}%).`
      );
    } else if (after < before) {
      parts.push(
        `Reliability reduced due to conflicting information (${Math.round(before * 100)}% → ${Math.round(after * 100)}%).`
      );
    }
  }
  if (analysis.status === "Contradiction detected") {
    parts.push("Contradiction detected between sources.");
  }
  return parts.filter(Boolean).join(" ");
}

export function buildConfidenceExplanation(
  insight: ExtendedAnalysisInsight,
  finalReasoning?: AiFinalReasoning | null
): string {
  if (finalReasoning) {
    const level = finalReasoning.aiConfidence;
    const pct = Math.round(level * 100);
    if (level >= 0.8) {
      return `Confidence is high (${pct}%) because the report provides clear, consistent humanitarian indicators and the AI could anchor conclusions to specific evidence.`;
    }
    if (level >= 0.55) {
      return `Confidence is moderate (${pct}%) because some key facts are present but gaps or mixed certainty language remain.`;
    }
    return `Confidence is limited (${pct}%) because important details are missing, unverified, or contradictory.`;
  }

  const unknown = insight.unknownFacts ?? [];
  if (unknown.length >= 3) {
    return "Confidence is reduced because several critical facts remain unconfirmed.";
  }
  if ((insight.knownFacts ?? []).length >= 3) {
    return "Confidence is supported by multiple established facts from the source material.";
  }
  return "Confidence reflects how complete and consistent the available evidence is.";
}

export function buildObservedEvidence(insight: ExtendedAnalysisInsight): string[] {
  const items = new Set<string>();
  for (const fact of insight.knownFacts ?? []) {
    items.add(sanitizeAnalystText(fact));
  }
  for (const quote of insight.finalReasoning?.evidenceIncreasing ?? []) {
    items.add(sanitizeAnalystText(quote));
  }
  for (const quote of insight.priorityReasoning?.evidenceQuotes ?? []) {
    items.add(sanitizeAnalystText(quote));
  }
  for (const item of insight.evidence ?? []) {
    items.add(sanitizeAnalystText(item));
  }
  return [...items].filter(Boolean).slice(0, 12);
}

export function buildAiInterpretation(insight: ExtendedAnalysisInsight): string {
  const parts: string[] = [];
  if (insight.finalReasoning?.whatIsHappening) {
    parts.push(insight.finalReasoning.whatIsHappening);
  }
  if (insight.finalReasoning?.whyImportant) {
    parts.push(insight.finalReasoning.whyImportant);
  }
  if (parts.length > 0) {
    return sanitizeAnalystText(parts.join(" "));
  }
  if (insight.situationSummary) {
    return sanitizeAnalystText(insight.situationSummary);
  }
  return "The AI interpreted available source material to assess humanitarian significance.";
}

export function buildDecisionSummary(insight: ExtendedAnalysisInsight): string {
  const priority =
    insight.priorityReasoning?.conclusion ??
    insight.priorityExplanation?.conclusion ??
    "Priority assessed from humanitarian severity.";
  const risk =
    insight.riskReasoning?.conclusion ??
    insight.riskExplanation?.conclusion ??
    "Risk trajectory assessed from escalation indicators.";
  return sanitizeAnalystText(
    `${priority} ${risk}`.trim()
  );
}

const FACTOR_EXPLANATIONS: Record<
  string,
  (score: number, insight?: ExtendedAnalysisInsight) => string | null
> = {
  sourceCredibility: (score) =>
    score >= 0.75
      ? "Credible or official source detected"
      : score >= 0.5
        ? "Source credibility is moderate"
        : "Source credibility is limited",
  recency: (score) =>
    score >= 0.7 ? "Recent publication" : "Older publication reduces recency weight",
  consistency: (score) =>
    score >= 0.7
      ? "Strong semantic consistency in the report"
      : "Some internal inconsistency detected",
  crossSource: (score, insight) => {
    const agreement = insight?.crossSourceAnalysis?.agreementPercent;
    if (agreement !== undefined && agreement >= 80) {
      return "Cross-source agreement is high";
    }
    if (agreement !== undefined && agreement < 50) {
      return "Limited cross-source agreement";
    }
    return score >= 0.7
      ? "Corroboration supports reliability"
      : "Awaiting additional corroborating sources";
  },
  crossSourceAgreement: (score, insight) =>
    FACTOR_EXPLANATIONS.crossSource!(score, insight),
  officialSource: (score) =>
    score >= 0.5 ? "Official UN or government source detected" : null,
  duplicateConfirmation: (score) =>
    score >= 0.5 ? "Duplicate reports confirm key details" : null,
  locationVerification: (score, insight) => {
    const status = insight?.locationReasoning?.status;
    if (status === "resolved") return "Location verified";
    if (status === "pending") return "Location pending verification";
    if (status === "approximate") return "Approximate country-level location";
    return score >= 0.6 ? "Location confidence supports the assessment" : null;
  },
  locationConfidence: (score, insight) =>
    FACTOR_EXPLANATIONS.locationVerification!(score, insight),
  completeness: (score, insight) => {
    const missing = insight?.unknownFacts ?? [];
    if (missing.length === 0 && score >= 0.7) {
      return "Key humanitarian fields are well covered";
    }
    if (missing.length > 0) {
      return `Information gaps remain: ${missing.slice(0, 2).join(", ")}`;
    }
    return null;
  },
  entityExtraction: (score) =>
    score >= 0.65
      ? "Multiple humanitarian indicators identified"
      : "Limited structured entities extracted",
  aiConfidence: (score) =>
    score >= 0.7 ? "AI confidence is high" : "AI confidence is moderate",
  aiExtraction: (score) => FACTOR_EXPLANATIONS.aiConfidence!(score),
  reliability: (score) =>
    score >= 0.75
      ? "Overall reliability supports operational use"
      : "Reliability should be treated with caution",
  humanitarianEmergency: (score) =>
    score >= 0.5 ? "Humanitarian emergency indicators present" : null,
  casualties: (score) =>
    score >= 0.5 ? "Significant casualty indicators detected" : null,
  displacement: (score) =>
    score >= 0.5 ? "Displacement or affected population reported" : null,
};

function normalizeScore(value: number): number {
  return value > 1 ? value / 100 : value;
}

export function breakdownToExplanations(
  breakdown: Record<string, number> | undefined,
  insight?: ExtendedAnalysisInsight
): string[] {
  if (!breakdown) return [];

  const explanations = new Set<string>();

  for (const [key, rawScore] of Object.entries(breakdown)) {
    const score = normalizeScore(rawScore);
    const builder = FACTOR_EXPLANATIONS[key];
    if (builder) {
      const line = builder(score, insight);
      if (line) explanations.add(line);
    }
  }

  if (insight?.guardrailAdjustment?.applied && insight.guardrailAdjustment.reason) {
    explanations.add(sanitizeAnalystText(insight.guardrailAdjustment.reason));
  }

  return [...explanations].slice(0, 10);
}

export function buildSupportingExplanations(
  insight: ExtendedAnalysisInsight
): {
  priority: string[];
  reliability: string[];
  risk: string[];
  confidence: string[];
} {
  const priority = [
    ...(insight.priorityReasoning?.reasons ?? []).map(sanitizeAnalystText),
    ...(insight.priorityReasoning?.severityReductionReasons ?? []).map(
      sanitizeAnalystText
    ),
    ...breakdownToExplanations(insight.priorityBreakdown, insight),
  ].filter(Boolean);

  const reliability = [
    ...(insight.reliabilityReasoning?.reasons ?? []).map(sanitizeAnalystText),
    ...breakdownToExplanations(insight.reliabilityBreakdown, insight),
  ].filter(Boolean);

  const risk = [
    ...(insight.riskReasoning?.reasons ?? []).map(sanitizeAnalystText),
    ...breakdownToExplanations(insight.riskBreakdown, insight),
  ].filter(Boolean);

  const confidence = [
    ...breakdownToExplanations(insight.confidenceBreakdown, insight),
    ...(insight.unknownFacts ?? [])
      .slice(0, 3)
      .map((f) => `Uncertainty: ${sanitizeAnalystText(f)}`),
  ].filter(Boolean);

  return {
    priority: [...new Set(priority)].slice(0, 8),
    reliability: [...new Set(reliability)].slice(0, 8),
    risk: [...new Set(risk)].slice(0, 8),
    confidence: [...new Set(confidence)].slice(0, 8),
  };
}

export function formatLocationReasoningForDisplay(
  location: LocationReasoning | null | undefined
): { summary: string; steps: string[] } {
  if (!location) {
    return { summary: "Location could not be assessed.", steps: [] };
  }

  const steps = location.steps
    .map(sanitizeAnalystText)
    .map((step) => {
      if (/geonames/i.test(step)) return "Matched via GeoNames geographic database";
      if (/nominatim|openstreetmap/i.test(step)) {
        return "Matched via OpenStreetMap geocoding";
      }
      if (/country centroid|approximate/i.test(step)) {
        return "Approximate country-level placement";
      }
      if (/ai extraction|ai coordinate/i.test(step)) {
        return "Confirmed by AI extraction";
      }
      if (/database/i.test(step)) return "Matched existing verified location";
      if (/pending/i.test(step)) return step;
      return step;
    })
    .filter(Boolean);

  return {
    summary: sanitizeAnalystText(location.narrative),
    steps,
  };
}

export function humanizeReasoningChainStep(step: string): string {
  const map: Record<string, string> = {
    "AI final reasoning": "AI reasoning",
    "AI priority assessment": "Priority assessment",
    "AI priority reasoning": "Priority assessment",
    "AI risk reasoning": "Risk projection",
    "AI reliability reasoning": "Reliability assessment",
    "Validation rules (guardrail)": "Quality assurance validation",
    "Final priority": "Priority decision",
    "Final risk projection": "Risk decision",
    "Final reliability": "Reliability decision",
  };
  return map[step] ?? sanitizeAnalystText(step);
}
