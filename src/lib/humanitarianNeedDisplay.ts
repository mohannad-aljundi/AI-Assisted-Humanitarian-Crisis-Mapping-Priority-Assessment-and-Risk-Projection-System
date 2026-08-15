import type { HumanitarianNeedDetail } from "@/lib/incidentEnrichment";

export function needExplanation(need: HumanitarianNeedDetail): string {
  const explanation = (need.reasoning ?? need.reason ?? "").trim();
  if (explanation.length > 0) return explanation;
  if (need.source === "Observed") {
    return "Explicitly identified from source material describing this humanitarian requirement.";
  }
  return "Inferred from crisis context and situational indicators in the report.";
}

export function needShortSummary(need: HumanitarianNeedDetail, maxLength = 120): string {
  const full = needExplanation(need);
  if (full.length <= maxLength) return full;
  const truncated = full.slice(0, maxLength).trim();
  const lastSpace = truncated.lastIndexOf(" ");
  const base = lastSpace > 60 ? truncated.slice(0, lastSpace) : truncated;
  return `${base}…`;
}

export function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "Critical":
      return "bg-red-500/25 text-red-100 ring-red-400/40";
    case "High":
      return "bg-orange-500/25 text-orange-100 ring-orange-400/40";
    case "Medium":
      return "bg-amber-500/25 text-amber-100 ring-amber-400/40";
    default:
      return "bg-emerald-500/25 text-emerald-100 ring-emerald-400/40";
  }
}
