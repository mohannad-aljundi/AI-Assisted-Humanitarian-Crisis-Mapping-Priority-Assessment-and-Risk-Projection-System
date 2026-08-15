import type { ExtractedEntityType } from "@prisma/client";
import { ENTITY_SUBTYPES } from "@/lib/intelligenceConstants";
import { getSafeCoordinates, hasSafeCoordinates } from "@/lib/coordinates";
import { locationValidationService } from "@/services/locationValidationService";

export interface ExtractedIntelligenceEntity {
  entityType: ExtractedEntityType;
  entitySubtype: string;
  value: string;
  latitude: number | null;
  longitude: number | null;
  severity?: string;
}

const FACILITY_PATTERNS: Array<{ subtype: string; pattern: RegExp }> = [
  { subtype: "HOSPITAL", pattern: /\b([\w\s'-]{2,40}?\s*)?hospitals?\b/gi },
  { subtype: "SCHOOL", pattern: /\b([\w\s'-]{2,40}?\s*)?schools?\b/gi },
  { subtype: "AIRPORT", pattern: /\b([\w\s'-]{2,40}?\s*)?airports?\b/gi },
  {
    subtype: "REFUGEE_CAMP",
    pattern: /\b([\w\s'-]{2,40}?\s*)?(?:refugee\s+camps?|idp\s+camps?|displacement\s+camps?)\b/gi,
  },
  {
    subtype: "HUMANITARIAN_FACILITY",
    pattern: /\b([\w\s'-]{2,40}?\s*)?(?:aid\s+warehouse|humanitarian\s+hub|clinic|health\s+cent(?:er|re))\b/gi,
  },
];

const INFRASTRUCTURE_PATTERNS: Array<{ subtype: string; pattern: RegExp }> = [
  { subtype: "BRIDGE", pattern: /\b([\w\s'-]{2,40}?\s*)?bridges?\b/gi },
  { subtype: "ROAD", pattern: /\b([\w\s'-]{2,40}?\s*)?(?:highways?|roads?|motorways?)\b/gi },
  { subtype: "PORT", pattern: /\b([\w\s'-]{2,40}?\s*)?ports?\b/gi },
  {
    subtype: "POWER_PLANT",
    pattern: /\b([\w\s'-]{2,40}?\s*)?(?:power\s+plants?|power\s+stations?|electricity\s+grid)\b/gi,
  },
];

const ORGANIZATION_PATTERNS: Array<{ subtype: string; pattern: RegExp }> = [
  { subtype: "UN_AGENCY", pattern: /\b(UNHCR|UNICEF|WFP|WHO|UNOCHA|OCHA|UNRWA|ICRC|IFRC)\b/gi },
  { subtype: "GOVERNMENT", pattern: /\b(ministry of|government of|president of|prime minister)\b/gi },
  { subtype: "ORGANIZATION", pattern: /\b(Red Cross|Red Crescent|MSF|Médecins Sans Frontières|Save the Children)\b/gi },
  { subtype: "ARMED_GROUP", pattern: /\b(RSF|Hamas|Hezbollah|Wagner|militia|rebel forces?|armed group)\b/gi },
];

const CASUALTY_PATTERNS: Array<{ subtype: string; pattern: RegExp }> = [
  { subtype: "DEATHS", pattern: /\b(\d[\d,]*)\s+(?:people\s+)?(?:were\s+)?killed\b|\b(\d[\d,]*)\s+deaths?\b/gi },
  { subtype: "INJURED", pattern: /\b(\d[\d,]*)\s+injur(?:ed|ies)\b/gi },
  { subtype: "DISPLACED", pattern: /\b(\d[\d,]*)\s+(?:people\s+)?displaced\b/gi },
  { subtype: "MAGNITUDE", pattern: /\bmagnitude\s+(\d+(?:\.\d+)?)\b/gi },
];

const REGION_PATTERNS: Array<{ subtype: string; pattern: RegExp }> = [
  { subtype: "REGION", pattern: /\b([\w\s'-]{2,30})\s+(?:province|region|governorate|state)\b/gi },
  { subtype: "CITY", pattern: /\b(?:in|near|at)\s+([A-Z][\w\s'-]{2,25})\b/g },
];

const GEOGRAPHIC_PATTERNS: Array<{ subtype: string; pattern: RegExp }> = [
  { subtype: "RIVER", pattern: /\b([\w\s'-]{2,40}?\s*)?(?:rivers?|nile|tigris|euphrates|congo)\b/gi },
  { subtype: "VILLAGE", pattern: /\b([\w\s'-]{2,40}?\s*)?villages?\b/gi },
  ...REGION_PATTERNS,
];

function uniqueKey(type: string, value: string): string {
  return `${type}:${value.trim().toLowerCase()}`;
}

function collectCasualtyEntities(content: string): ExtractedIntelligenceEntity[] {
  const found: ExtractedIntelligenceEntity[] = [];
  for (const { subtype, pattern } of CASUALTY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const value = match[0].trim();
      if (value.length < 3) continue;
      found.push({
        entityType: "AFFECTED_POPULATION",
        entitySubtype: subtype,
        value,
        latitude: null,
        longitude: null,
        severity: subtype === "MAGNITUDE" ? match[1] : undefined,
      });
    }
  }
  return found;
}

function collectOrganizationEntities(content: string): ExtractedIntelligenceEntity[] {
  const found = new Map<string, ExtractedIntelligenceEntity>();
  for (const { subtype, pattern } of ORGANIZATION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const value = match[0].trim();
      const key = uniqueKey(subtype, value);
      if (found.has(key)) continue;
      found.set(key, {
        entityType: "GEOGRAPHIC",
        entitySubtype: subtype,
        value,
        latitude: null,
        longitude: null,
      });
    }
  }
  return [...found.values()];
}

function collectMatches(
  content: string,
  patterns: Array<{ subtype: string; pattern: RegExp }>,
  entityType: ExtractedEntityType
): ExtractedIntelligenceEntity[] {
  const found = new Map<string, ExtractedIntelligenceEntity>();

  for (const { subtype, pattern } of patterns) {
    if (!ENTITY_SUBTYPES.includes(subtype as (typeof ENTITY_SUBTYPES)[number])) continue;
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const raw = match[0].trim();
      if (raw.length < 4) continue;
      const key = uniqueKey(subtype, raw);
      if (found.has(key)) continue;
      found.set(key, {
        entityType,
        entitySubtype: subtype,
        value: raw.replace(/\s+/g, " "),
        latitude: null,
        longitude: null,
      });
    }
  }

  return [...found.values()];
}

export class EntityExtractionService {
  extractFromText(content: string, countryHint?: string): ExtractedIntelligenceEntity[] {
    const entities: ExtractedIntelligenceEntity[] = [
      ...collectMatches(content, FACILITY_PATTERNS, "FACILITY"),
      ...collectMatches(content, INFRASTRUCTURE_PATTERNS, "INFRASTRUCTURE"),
      ...collectMatches(content, GEOGRAPHIC_PATTERNS, "GEOGRAPHIC"),
      ...collectOrganizationEntities(content),
      ...collectCasualtyEntities(content),
    ];

    if (countryHint?.trim()) {
      entities.push({
        entityType: "GEOGRAPHIC",
        entitySubtype: "COUNTRY",
        value: countryHint.trim(),
        latitude: null,
        longitude: null,
      });
    }

    return entities;
  }

  mergeAiEntities(
    aiEntities: Array<{
      subtype: string;
      name: string;
      country?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }>,
    ruleEntities: ExtractedIntelligenceEntity[]
  ): ExtractedIntelligenceEntity[] {
    const merged = new Map<string, ExtractedIntelligenceEntity>();

    for (const entity of ruleEntities) {
      merged.set(uniqueKey(entity.entitySubtype, entity.value), entity);
    }

    for (const entity of aiEntities) {
      const subtype = entity.subtype.toUpperCase();
      const value = entity.country
        ? `${entity.name}, ${entity.country}`
        : entity.name;
      const entityType: ExtractedEntityType =
        subtype === "COUNTRY" || subtype === "CITY" || subtype === "VILLAGE" || subtype === "RIVER" || subtype === "REGION"
          ? "GEOGRAPHIC"
          : ["UN_AGENCY", "GOVERNMENT", "ORGANIZATION", "ARMED_GROUP"].includes(subtype)
            ? "GEOGRAPHIC"
            : ["HOSPITAL", "SCHOOL", "AIRPORT", "REFUGEE_CAMP", "HUMANITARIAN_FACILITY"].includes(
                subtype
              )
              ? "FACILITY"
              : ["BRIDGE", "ROAD", "PORT", "POWER_PLANT"].includes(subtype)
                ? "INFRASTRUCTURE"
                : ["DEATHS", "INJURED", "DISPLACED", "MAGNITUDE"].includes(subtype)
                  ? "AFFECTED_POPULATION"
                  : "LOCATION";

      merged.set(uniqueKey(subtype, value), {
        entityType,
        entitySubtype: subtype,
        value,
        latitude: entity.latitude ?? null,
        longitude: entity.longitude ?? null,
      });
    }

    return [...merged.values()];
  }

  async geocodeEntities(
    entities: ExtractedIntelligenceEntity[],
    countryHint?: string
  ): Promise<ExtractedIntelligenceEntity[]> {
    const results: ExtractedIntelligenceEntity[] = [];

    for (const entity of entities) {
      if (hasSafeCoordinates(entity)) {
        results.push(entity);
        continue;
      }

      const query = countryHint
        ? `${entity.value}, ${countryHint}`
        : entity.value;
      const validated = await locationValidationService.validateLocations([
        { name: query, latitude: null, longitude: null },
      ]);

      const loc = validated[0];
      const coords = getSafeCoordinates(loc);
      if (coords) {
        results.push({
          ...entity,
          latitude: coords.lat,
          longitude: coords.lng,
          severity: loc?.confidence !== undefined ? String(loc.confidence) : entity.severity,
        });
      } else {
        results.push(entity);
      }
    }

    return results;
  }
}

export const entityExtractionService = new EntityExtractionService();
