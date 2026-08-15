import type { HumanitarianNeed } from "@prisma/client";
import type { ExtractedEntity } from "@prisma/client";
import {
  dedupeExtractedHumanitarianNeeds,
  normaliseNeedName,
} from "@/lib/humanitarianNeedTaxonomy";
import type { ExtractedHumanitarianNeed } from "@/types";

const SEVERITY_RANK: Record<ExtractedHumanitarianNeed["severity"], number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

export function needsFromEntities(
  entities: ExtractedEntity[]
): ExtractedHumanitarianNeed[] {
  return entities
    .filter((entity) => entity.entityType === "HUMANITARIAN_NEED")
    .map((entity) => ({
      needType: normaliseNeedName(entity.value),
      severity: (entity.severity ?? "Medium") as ExtractedHumanitarianNeed["severity"],
    }));
}

export function needsFromCrisisRecords(
  crisisNeeds: HumanitarianNeed[]
): ExtractedHumanitarianNeed[] {
  return crisisNeeds.map((need) => ({
    needType: normaliseNeedName(need.needType),
    severity: need.severity as ExtractedHumanitarianNeed["severity"],
    source: need.source ?? undefined,
    evidence: need.evidence ?? undefined,
    reasoning: need.reasoning ?? undefined,
    confidence: need.confidenceScore ?? undefined,
  }));
}

/** Merge entity snapshots and persisted crisis needs without losing inference metadata. */
export function mergeHumanitarianNeedsFromSources(
  entities: ExtractedEntity[],
  crisisNeeds?: HumanitarianNeed[] | null
): ExtractedHumanitarianNeed[] {
  const combined = [
    ...needsFromEntities(entities),
    ...needsFromCrisisRecords(crisisNeeds ?? []),
  ];

  return dedupeExtractedHumanitarianNeeds(combined);
}

export function splitObservedAndInferred(needs: ExtractedHumanitarianNeed[]): {
  observed: ExtractedHumanitarianNeed[];
  inferred: ExtractedHumanitarianNeed[];
} {
  const observed: ExtractedHumanitarianNeed[] = [];
  const inferred: ExtractedHumanitarianNeed[] = [];

  for (const need of needs) {
    if (need.source === "Inferred") {
      inferred.push(need);
    } else {
      observed.push(need);
    }
  }

  return { observed, inferred };
}

export { SEVERITY_RANK };
