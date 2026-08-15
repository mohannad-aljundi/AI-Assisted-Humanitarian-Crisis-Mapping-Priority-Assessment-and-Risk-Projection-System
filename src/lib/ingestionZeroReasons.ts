export type IngestionZeroReason =
  | "no_events_found"
  | "authentication_failed"
  | "rate_limited"
  | "invalid_endpoint"
  | "api_unavailable"
  | "parsing_failed"
  | "keyword_filtered"
  | "requires_api_key"
  | "disabled"
  | "skipped";

export const ZERO_REASON_LABELS: Record<IngestionZeroReason, string> = {
  no_events_found: "No events found",
  authentication_failed: "Authentication failed",
  rate_limited: "Rate limited",
  invalid_endpoint: "Invalid endpoint",
  api_unavailable: "API unavailable",
  parsing_failed: "Parsing failed",
  keyword_filtered: "All records filtered by keyword",
  requires_api_key: "API key missing",
  disabled: "Source disabled",
  skipped: "Skipped",
};

export function classifyZeroReasonFromError(message: string): IngestionZeroReason {
  const lower = message.toLowerCase();
  if (lower.includes("api key") || lower.includes("authentication") || lower.includes("401") || lower.includes("403")) {
    return "authentication_failed";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "rate_limited";
  }
  if (lower.includes("404") || lower.includes("invalid endpoint")) {
    return "invalid_endpoint";
  }
  if (lower.includes("non-json") || lower.includes("invalid json") || lower.includes("parsing")) {
    return "parsing_failed";
  }
  if (lower.includes("timed out") || lower.includes("econnrefused") || lower.includes("fetch failed") || lower.includes("network")) {
    return "api_unavailable";
  }
  return "api_unavailable";
}

export function formatZeroReason(reason: IngestionZeroReason, detail?: string): string {
  const label = ZERO_REASON_LABELS[reason];
  return detail ? `${label}: ${detail}` : label;
}
