export type AssessmentMethod =
  | "LOCAL_REASONING"
  | "AI_ENHANCED"
  | "AI_VALIDATED"
  | "AI"
  | "AI_WITH_VALIDATION"
  | "RULE_FALLBACK";

export type AiFailureCategory =
  | "MISSING_API_KEY"
  | "PROVIDER_ERROR"
  | "INSUFFICIENT_CREDITS"
  | "TIMEOUT"
  | "INVALID_JSON"
  | "EMPTY_RESPONSE"
  | "UNKNOWN";

export function classifyAiFailure(error: unknown): AiFailureCategory {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (
    message.includes("requires more credits") ||
    message.includes("insufficient credits") ||
    message.includes("out of credits") ||
    message.includes("payment required")
  ) {
    return "INSUFFICIENT_CREDITS";
  }

  if (message.includes("not configured") || message.includes("no ai provider")) {
    return "MISSING_API_KEY";
  }
  if (message.includes("timeout") || message.includes("timed out") || message.includes("abort")) {
    return "TIMEOUT";
  }
  if (
    message.includes("invalid") ||
    message.includes("json") ||
    message.includes("parse") ||
    message.includes("no parseable") ||
    message.includes("not an object")
  ) {
    return "INVALID_JSON";
  }
  if (message.includes("empty") || message.includes("no humanitarian") || message.includes("returned no")) {
    return "EMPTY_RESPONSE";
  }
  if (
    message.includes("api") ||
    message.includes("provider") ||
    message.includes("429") ||
    message.includes("500") ||
    message.includes("503")
  ) {
    return "PROVIDER_ERROR";
  }
  return "UNKNOWN";
}

export function formatAiFailureReason(category: AiFailureCategory, detail?: string): string {
  const base: Record<AiFailureCategory, string> = {
    MISSING_API_KEY: "No AI API keys configured",
    PROVIDER_ERROR: "AI provider request failed",
    INSUFFICIENT_CREDITS: "AI provider unavailable or out of credits",
    TIMEOUT: "AI request timed out",
    INVALID_JSON: "AI returned invalid JSON",
    EMPTY_RESPONSE: "AI returned an empty or unusable response",
    UNKNOWN: "AI assessment failed",
  };
  // Server logs only — include the exact provider error when available.
  return detail ? `${base[category]}: ${detail}` : base[category];
}

/** Safe user-facing fallback copy — never includes env var names or stack details. */
export function formatAiFailureUserMessage(category: AiFailureCategory): string {
  switch (category) {
    case "MISSING_API_KEY":
      return "Cloud AI is not configured. The built-in humanitarian intelligence engine completed the analysis.";
    case "INSUFFICIENT_CREDITS":
      return "Cloud AI service is temporarily unavailable. Automatic fallback completed successfully.";
    case "TIMEOUT":
      return "Cloud AI request timed out. Automatic fallback completed successfully.";
    case "PROVIDER_ERROR":
    case "INVALID_JSON":
    case "EMPTY_RESPONSE":
    case "UNKNOWN":
    default:
      return "Cloud AI service is temporarily unavailable. The built-in humanitarian intelligence engine completed the analysis.";
  }
}

export function formatAssessmentMethodLabel(method: AssessmentMethod): string {
  switch (method) {
    case "LOCAL_REASONING":
      return "Built-in humanitarian intelligence engine";
    case "AI_ENHANCED":
      return "AI-enhanced humanitarian reasoning";
    case "AI_VALIDATED":
      return "AI-validated humanitarian reasoning";
    case "AI":
      return "AI-enhanced humanitarian reasoning";
    case "AI_WITH_VALIDATION":
      return "AI-validated humanitarian reasoning";
    case "RULE_FALLBACK":
      return "Built-in humanitarian intelligence engine";
  }
}

export const AI_FALLBACK_UI_MESSAGE =
  "Cloud AI service is temporarily unavailable. The built-in humanitarian intelligence engine completed the analysis.";

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
