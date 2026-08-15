import type { HumanitarianNeedDetail } from "@/lib/incidentEnrichment";
import { normaliseNeedName } from "@/lib/humanitarianNeedTaxonomy";

const SEVERITY_ORDER: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

export function evidenceStrengthScore(need: HumanitarianNeedDetail): number {
  let strength = Math.max(need.score, 0);
  if (need.source === "Observed") strength += 0.12;
  if (need.evidence && need.evidence.trim().length > 24) strength += 0.08;
  return Math.min(1, strength);
}

export function sortHumanitarianNeedsByPriority(
  needs: HumanitarianNeedDetail[]
): HumanitarianNeedDetail[] {
  return [...needs].sort((a, b) => {
    const severityDiff =
      (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0);
    if (severityDiff !== 0) return severityDiff;

    const confidenceDiff = b.confidence - a.confidence;
    if (Math.abs(confidenceDiff) > 0.001) return confidenceDiff;

    const evidenceDiff = evidenceStrengthScore(b) - evidenceStrengthScore(a);
    if (Math.abs(evidenceDiff) > 0.001) return evidenceDiff;

    return normaliseNeedName(a.needType).localeCompare(normaliseNeedName(b.needType));
  });
}

export function getTopHumanitarianNeeds(
  needs: HumanitarianNeedDetail[],
  count = 3
): HumanitarianNeedDetail[] {
  return sortHumanitarianNeedsByPriority(needs).slice(0, count);
}
