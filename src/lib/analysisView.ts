import type { ExtractedEntity, HumanitarianNeed } from "@prisma/client";
import { decodeLocationMeta } from "@/lib/locationConfidence";
import { ensureHumanitarianNeeds } from "@/lib/humanitarianNeedTaxonomy";
import { mergeHumanitarianNeedsFromSources } from "@/lib/humanitarianNeedsView";
import type { NLPAnalysisResult } from "@/types";

export interface NlpViewContext {
  title: string;
  content: string;
}

/** Maps persisted entities to NLP view without inference or taxonomy fill. */
export function buildNlpViewReadOnly(
  extractedEntities: ExtractedEntity[],
  crisis?: {
    crisisType: string;
    humanitarianNeeds: HumanitarianNeed[];
  } | null
): NLPAnalysisResult {
  return buildNlpView(extractedEntities, crisis);
}

export function buildNlpView(
  extractedEntities: ExtractedEntity[],
  crisis?: {
    crisisType: string;
    humanitarianNeeds: HumanitarianNeed[];
  } | null,
  context?: NlpViewContext
): NLPAnalysisResult {
  const locations = extractedEntities
    .filter(
      (entity) =>
        entity.entityType === "LOCATION" ||
        entity.entityType === "GEOGRAPHIC"
    )
    .map((entity) => {
      const meta = decodeLocationMeta(entity.severity);
      return {
        name: entity.value,
        latitude: entity.latitude,
        longitude: entity.longitude,
        confidence: meta?.confidence,
        validationStatus: meta?.validationStatus,
      };
    });

  const crisisTypeEntity = extractedEntities.find(
    (entity) => entity.entityType === "CRISIS_TYPE"
  );
  const populationEntity = extractedEntities.find(
    (entity) => entity.entityType === "AFFECTED_POPULATION"
  );

  const crisisType =
    crisisTypeEntity?.value ?? crisis?.crisisType ?? null;

  let humanitarianNeeds = mergeHumanitarianNeedsFromSources(
    extractedEntities,
    crisis?.humanitarianNeeds
  );

  if (context) {
    humanitarianNeeds = ensureHumanitarianNeeds({
      needs: humanitarianNeeds,
      title: context.title,
      content: context.content,
      crisisType,
    });
  }

  const entities = extractedEntities
    .filter(
      (entity) =>
        entity.entityType === "FACILITY" ||
        entity.entityType === "INFRASTRUCTURE" ||
        entity.entityType === "GEOGRAPHIC"
    )
    .map((entity) => ({
      entityType: entity.entityType,
      entitySubtype: entity.entitySubtype,
      value: entity.value,
      latitude: entity.latitude,
      longitude: entity.longitude,
    }));

  return {
    locations,
    entities,
    crisisType,
    humanitarianNeeds,
    affectedPopulation: populationEntity
      ? parseInt(populationEntity.value, 10)
      : null,
  };
}
