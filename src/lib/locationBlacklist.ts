/** Generic / metadata tokens that are never valid standalone place names. */
export const INVALID_LOCATION_TERMS = new Set([
  "medical",
  "source",
  "sources",
  "multiple",
  "none",
  "unknown",
  "unclassified",
  "unspecified",
  "location",
  "locations",
  "report",
  "reports",
  "crisis",
  "humanitarian",
  "emergency",
  "hospital",
  "field",
  "official",
  "media",
  "analysis",
  "food",
  "relief",
  "red cross",
  "redcross",
  "ifrc",
  "ngo",
  "water",
  "shelter",
  "protection",
  "n/a",
  "na",
  "various",
  "global",
  "international",
  "nationwide",
  "region",
  "area",
  "country",
  "city",
  "town",
  "district",
  "province",
  "state",
  "coordinates",
  "undetermined",
  "unverified",
  "aid",
  "assistance",
  "disaster",
  "casualties",
  "injured",
  "deaths",
  "killed",
  "update",
  "updates",
]);

/** Crisis-type and event labels mistaken for geographic locations (e.g. "Terrorism"). */
export const CRISIS_TYPE_LOCATION_TERMS = new Set([
  "terrorism",
  "terrorist",
  "terror",
  "conflict",
  "war",
  "warfare",
  "violence",
  "violent",
  "earthquake",
  "earthquakes",
  "seismic",
  "tremor",
  "aftershock",
  "flood",
  "flooding",
  "inundation",
  "drought",
  "disease",
  "outbreak",
  "epidemic",
  "pandemic",
  "cholera",
  "infection",
  "displacement",
  "displaced",
  "refugee",
  "wildfire",
  "bushfire",
  "storm",
  "hurricane",
  "cyclone",
  "typhoon",
  "landslide",
  "shelling",
  "airstrike",
  "airstrikes",
  "fighting",
  "armed clash",
  "food insecurity",
  "humanitarian crisis",
  "humanitarian emergency",
  "infrastructure damage",
  "malnutrition",
  "starvation",
  "famine",
  "hunger crisis",
]);

function normalizeLocationTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isBlacklistedTerm(term: string): boolean {
  if (!term) return true;
  if (INVALID_LOCATION_TERMS.has(term)) return true;
  if (CRISIS_TYPE_LOCATION_TERMS.has(term)) return true;
  if (/^coordinates\b/i.test(term)) return true;
  return false;
}

export function isBlacklistedLocationName(value: string): boolean {
  const normalized = normalizeLocationTerm(value);
  if (isBlacklistedTerm(normalized)) return true;

  const primarySegment = normalizeLocationTerm(normalized.split(",")[0] ?? normalized);
  return isBlacklistedTerm(primarySegment);
}

export function isCrisisTypeAsLocation(
  value: string,
  crisisType?: string | null
): boolean {
  if (!crisisType?.trim()) return false;
  const normalized = normalizeLocationTerm(value);
  const crisis = normalizeLocationTerm(crisisType);
  if (!normalized || !crisis) return false;
  const primary = normalizeLocationTerm(normalized.split(",")[0] ?? normalized);
  return normalized === crisis || primary === crisis;
}

export function shouldRejectLocationCandidate(
  value: string,
  crisisType?: string | null
): boolean {
  return (
    isBlacklistedLocationName(value) || isCrisisTypeAsLocation(value, crisisType)
  );
}

export function hasValidCoordinates(
  latitude: number | null,
  longitude: number | null
): boolean {
  if (latitude === null || longitude === null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}
