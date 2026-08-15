import { getAiConfig } from "@/lib/aiResolver";
import {
  formatAiModelForDisplay,
  formatAnalysisMethodLabel,
  PUBLIC_ANALYTICAL_STEPS,
  type PublicPipelineStep,
} from "@/lib/explainabilityPresentation";

export type { PublicPipelineStep };

/** @deprecated Use PUBLIC_ANALYTICAL_STEPS — internal stages retained for legacy imports only */
export interface IntelligencePipelineStage {
  order: number;
  name: string;
  engine: string;
  role: string;
  module: string;
}

/** Legacy internal reference — not shown in user-facing UI */
export const INTELLIGENCE_PIPELINE_STAGES: IntelligencePipelineStage[] =
  PUBLIC_ANALYTICAL_STEPS.map((step) => ({
    order: step.order,
    name: step.name,
    engine: step.name,
    role: step.description,
    module: "",
  }));

export const RELIABILITY_ENGINE_DESCRIPTION =
  "Reliability reflects source trust, publication recency, factual consistency, cross-source agreement, official source status, duplicate confirmation, location verification, and information completeness.";

export const PRIORITY_ENGINE_DESCRIPTION =
  "Priority is determined by AI semantic assessment of humanitarian severity, validated by quality assurance checks when hard indicators (mass casualties, displacement, destroyed facilities) warrant escalation.";

export const RISK_ENGINE_DESCRIPTION =
  "Risk projection estimates escalation or stabilization over 24 hours, 72 hours, and 7 days using trend language, report frequency, and severity context.";

export const CONFIDENCE_ENGINE_DESCRIPTION =
  "Confidence combines source credibility, entity and location certainty, cross-source agreement, AI extraction quality, data completeness, and overall reliability.";

export type ExtractionMethodKind = "ai" | "rules" | "hybrid" | string | null | undefined;

export function resolveConfiguredAiModel(fallback?: string | null): string {
  return formatAiModelForDisplay(fallback);
}

export function formatAiModelLabel(storedModel?: string | null): string {
  return formatAiModelForDisplay(storedModel);
}

export function formatPipelineApproach(extractionMethod: ExtractionMethodKind): string {
  return formatAnalysisMethodLabel(extractionMethod);
}

export function formatExtractionMethodLabel(
  extractionMethod: ExtractionMethodKind,
  locationMethod?: string
): string {
  const base = formatAnalysisMethodLabel(extractionMethod);
  if (!locationMethod?.trim()) return base;

  const locationLabel = locationMethod
    .replace(/spaCy/gi, "linguistic analysis")
    .replace(/NER/gi, "named-entity recognition")
    .replace(/GeoNames/gi, "GeoNames database")
    .replace(/Nominatim/gi, "OpenStreetMap geocoding");

  return `${base} · location via ${locationLabel}`;
}

export function getPublicAnalyticalSteps(): PublicPipelineStep[] {
  return PUBLIC_ANALYTICAL_STEPS;
}

export function resolveActiveAiProviderLabel(): string {
  const config = getAiConfig();
  if (config.openAiApiKey) {
    if (config.provider === "openai+gemini+openrouter") {
      return "OpenAI with Gemini and OpenRouter fallback";
    }
    if (config.provider === "openai+gemini") {
      return "OpenAI with Gemini fallback";
    }
    if (config.provider === "openai+openrouter") {
      return "OpenAI with OpenRouter fallback";
    }
    return "OpenAI";
  }
  if (!config.provider) return "Large language model not configured";
  if (config.provider === "openai+gemini+openrouter") {
    return "OpenAI with Gemini and OpenRouter fallback";
  }
  if (config.provider === "openai+gemini") {
    return "OpenAI with Gemini fallback";
  }
  if (config.provider === "openai+openrouter") {
    return "OpenAI with OpenRouter fallback";
  }
  if (config.provider === "openrouter") return "OpenRouter";
  if (config.provider === "openai") return "OpenAI";
  if (config.provider === "gemini") return "Gemini";
  return "OpenAI";
}
