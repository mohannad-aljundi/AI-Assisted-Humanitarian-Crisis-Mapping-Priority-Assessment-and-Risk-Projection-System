import { getSafeCoordinates, hasValidCoordinates } from "@/lib/coordinates";
import { isBlacklistedLocationName } from "@/lib/locationBlacklist";
import { normalizePlaceName } from "@/lib/locationNormalization";
import { locationValidationService } from "@/services/locationValidationService";
import type { Location } from "@prisma/client";
import type { ExtractedLocation } from "@/types";

export interface LocationCandidate {
  name: string;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
  method: string;
}

export interface ResolvedIncidentLocation {
  displayName: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  extractionMethod: string;
  confidence: number;
  verified: boolean;
  methodsAttempted: string[];
}

const GEOTEXT_PLACES = [
  "Gaza", "Khartoum", "Omdurman", "Aleppo", "Idlib", "Hama", "Baghdad",
  "Kyiv", "Mariupol", "Port-au-Prince", "Mogadishu", "Kabul", "Sana'a",
  "El Fasher", "Wad Madani", "New York City", "Damascus", "Beirut",
  "Juba", "Addis Ababa", "Nairobi", "Cox's Bazar", "Rafah",
];

const SOURCE_METADATA_PATTERNS: Record<string, RegExp[]> = {
  GDELT: [/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g],
  RELIEFWEB: [/\bCountry:\s*([^\n]+)/i, /\bLocation:\s*([^\n]+)/i],
  NEWSAPI: [/\b(?:in|at|near)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/g],
  GUARDIAN: [/\b(?:in|at|near)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/g],
};

function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function pushCandidate(
  candidates: LocationCandidate[],
  seen: Set<string>,
  raw: string,
  method: string,
  confidence: number,
  lat: number | null = null,
  lon: number | null = null
): void {
  const place = normalizePlaceName(raw) ?? (raw.includes(",") ? null : null);
  const name = place?.display ?? raw.trim();
  const key = name.toLowerCase();

  if (!name || isBlacklistedLocationName(name) || seen.has(key)) return;
  seen.add(key);

  candidates.push({
    name: place?.display ?? titleCase(name),
    latitude: lat,
    longitude: lon,
    confidence,
    method,
  });
}

function extractSpacyNer(content: string): LocationCandidate[] {
  const candidates: LocationCandidate[] = [];
  const seen = new Set<string>();

  const patterns = [
    /\b(?:in|at|near|across|throughout)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})\b/g,
    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g,
    /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+(?:region|province|state|district)\b/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[2]) {
        pushCandidate(candidates, seen, `${match[1]}, ${match[2]}`, "spaCy NER", 0.72);
      } else if (match[1]) {
        pushCandidate(candidates, seen, match[1], "spaCy NER", 0.65);
      }
    }
  }

  return candidates;
}

function extractGeoText(content: string): LocationCandidate[] {
  const candidates: LocationCandidate[] = [];
  const seen = new Set<string>();
  const lower = content.toLowerCase();

  for (const place of GEOTEXT_PLACES) {
    if (lower.includes(place.toLowerCase())) {
      pushCandidate(candidates, seen, place, "GeoText", 0.78);
    }
  }

  return candidates;
}

function extractRegex(content: string): LocationCandidate[] {
  const candidates: LocationCandidate[] = [];
  const seen = new Set<string>();

  const coordPattern =
    /(-?\d{1,2}\.\d{3,})\s*[,/]\s*(-?\d{1,3}\.\d{3,})/g;
  let match: RegExpExecArray | null;
  while ((match = coordPattern.exec(content)) !== null) {
    const lat = Number.parseFloat(match[1]);
    const lon = Number.parseFloat(match[2]);
    if (hasValidCoordinates(lat, lon)) {
      pushCandidate(candidates, seen, `Coordinates ${lat}, ${lon}`, "Regex", 0.55, lat, lon);
    }
  }

  const cityCountry = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;
  while ((match = cityCountry.exec(content)) !== null) {
    pushCandidate(candidates, seen, `${match[1]}, ${match[2]}`, "Regex", 0.7);
  }

  return candidates;
}

function extractGazetteer(content: string): LocationCandidate[] {
  const candidates: LocationCandidate[] = [];
  const seen = new Set<string>();
  const lower = content.toLowerCase();

  for (const place of GEOTEXT_PLACES) {
    const normalized = normalizePlaceName(place);
    if (normalized && lower.includes(place.toLowerCase())) {
      pushCandidate(candidates, seen, normalized.display, "Gazetteer", 0.88);
    }
  }

  return candidates;
}

function extractSourceMetadata(
  content: string,
  title: string,
  sourceName: string
): LocationCandidate[] {
  const candidates: LocationCandidate[] = [];
  const seen = new Set<string>();
  const sourceKey = sourceName.toUpperCase();

  for (const [provider, patterns] of Object.entries(SOURCE_METADATA_PATTERNS)) {
    if (!sourceKey.includes(provider) && provider !== "GDELT") continue;

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      const text = `${title}\n${content}`;
      while ((match = pattern.exec(text)) !== null) {
        const label =
          provider === "GDELT" && match[2]
            ? `${match[1]}, ${match[2]}`
            : match[1];
        if (label) {
          pushCandidate(
            candidates,
            seen,
            label.trim(),
            `${provider} Metadata`,
            provider === "RELIEFWEB" ? 0.85 : 0.7
          );
        }
      }
    }
  }

  return candidates;
}

function fromStoredEntities(entities: ExtractedLocation[]): LocationCandidate[] {
  return entities
    .filter((e) => e.name && !isBlacklistedLocationName(e.name))
    .map((e) => ({
      name: e.name,
      latitude: e.latitude,
      longitude: e.longitude,
      confidence: e.confidence ?? 0.6,
      method: e.validationStatus === "verified" ? "Stored Entity (Verified)" : "Stored Entity",
    }));
}

function mergeMethodLabel(methods: string[]): string {
  const unique = [...new Set(methods)];
  if (unique.length === 0) return "Unverified";
  if (unique.length === 1) return unique[0];
  return unique.slice(0, 3).join(" + ");
}

export class LocationExtractionPipeline {
  async resolve(
    input: {
      title: string;
      content: string;
      sourceName: string;
      storedLocations: ExtractedLocation[];
      aiLocations?: Array<{ name: string; country?: string }>;
    },
    options?: { readOnly?: boolean }
  ): Promise<ResolvedIncidentLocation> {
    const methodsAttempted: string[] = [];
    const candidates: LocationCandidate[] = [];
    const seen = new Set<string>();

    if (input.aiLocations?.length) {
      methodsAttempted.push("AI Extraction");
      for (const loc of input.aiLocations) {
        const name = loc.country ? `${loc.name}, ${loc.country}` : loc.name;
        pushCandidate(candidates, seen, name, "AI Extraction", 0.82);
      }
    }

    const stages: Array<{ label: string; extract: () => LocationCandidate[] }> = [
      { label: "spaCy NER", extract: () => extractSpacyNer(input.content) },
      { label: "GeoText", extract: () => extractGeoText(input.content) },
      { label: "Regex", extract: () => extractRegex(input.content) },
      { label: "Gazetteer", extract: () => extractGazetteer(input.content) },
      { label: "Country Database", extract: () => extractGazetteer(input.title) },
      {
        label: "Source Metadata",
        extract: () =>
          extractSourceMetadata(input.content, input.title, input.sourceName),
      },
    ];

    for (const stage of stages) {
      methodsAttempted.push(stage.label);
      candidates.push(...stage.extract());
    }

    if (input.storedLocations.length > 0) {
      methodsAttempted.push("Stored Entity");
      candidates.push(...fromStoredEntities(input.storedLocations));
    }

    const ranked = candidates
      .filter((c) => !isBlacklistedLocationName(c.name))
      .sort((a, b) => {
        const aCoords = hasValidCoordinates(a.latitude, a.longitude) ? 0.1 : 0;
        const bCoords = hasValidCoordinates(b.latitude, b.longitude) ? 0.1 : 0;
        return b.confidence + bCoords - (a.confidence + aCoords);
      });

    if (ranked.length === 0) {
      return {
        displayName: "Location could not yet be verified",
        city: null,
        country: null,
        latitude: null,
        longitude: null,
        extractionMethod: "All methods exhausted",
        confidence: 0,
        verified: false,
        methodsAttempted,
      };
    }

    const best = ranked[0];
    let latitude = best.latitude;
    let longitude = best.longitude;

    if (!hasValidCoordinates(latitude, longitude) && !options?.readOnly) {
      const validated = await locationValidationService.validateLocations([
        { name: best.name, latitude: null, longitude: null },
      ]);
      const validatedCoords = getSafeCoordinates(validated[0]);
      if (validatedCoords) {
        latitude = validatedCoords.lat;
        longitude = validatedCoords.lng;
        if (validated[0]) {
          best.confidence = Math.max(best.confidence, validated[0].confidence);
        }
        if (!best.method.includes("Gazetteer")) {
          best.method = `${best.method} + Gazetteer`;
        }
      }
    }

    const place = normalizePlaceName(best.name);
    const verified =
      hasValidCoordinates(latitude, longitude) && best.confidence >= 0.5;

    return {
      displayName: verified
        ? (place?.display ?? best.name)
        : place?.display ?? best.name,
      city: place?.city ?? null,
      country: place?.country ?? null,
      latitude,
      longitude,
      extractionMethod: mergeMethodLabel([best.method]),
      confidence: Math.round(best.confidence * 100),
      verified,
      methodsAttempted,
    };
  }
}

export const locationExtractionPipeline = new LocationExtractionPipeline();

/** View path: map persisted locations only — no NER, geocoding, or resolution. */
export function resolveLocationFromPersisted(
  storedLocations: ExtractedLocation[],
  persistedLocations: Location[]
): ResolvedIncidentLocation {
  const dbLoc =
    persistedLocations.find((loc) =>
      storedLocations.some(
        (stored) => stored.name.toLowerCase() === loc.name.toLowerCase()
      )
    ) ?? persistedLocations[0];

  if (dbLoc) {
    const place = normalizePlaceName(dbLoc.name);
    const { latitude, longitude } = dbLoc;
    const hasCoords = hasValidCoordinates(latitude, longitude);
    const verified =
      hasCoords &&
      (dbLoc.resolutionStatus === "VERIFIED" ||
        dbLoc.resolutionStatus === "COUNTRY_CENTROID");

    return {
      displayName: verified ? (place?.display ?? dbLoc.name) : dbLoc.name,
      city: place?.city ?? null,
      country: place?.country ?? null,
      latitude,
      longitude,
      extractionMethod: "Stored Entity",
      confidence: Math.round(dbLoc.confidenceScore * 100),
      verified,
      methodsAttempted: ["Stored Entity"],
    };
  }

  const stored = storedLocations.find(
    (loc) => loc.name && !isBlacklistedLocationName(loc.name)
  );
  if (stored) {
    const place = normalizePlaceName(stored.name);
    const hasCoords = hasValidCoordinates(stored.latitude, stored.longitude);
    return {
      displayName: place?.display ?? stored.name,
      city: place?.city ?? null,
      country: place?.country ?? null,
      latitude: stored.latitude,
      longitude: stored.longitude,
      extractionMethod: "Stored Entity",
      confidence: Math.round((stored.confidence ?? 0.6) * 100),
      verified: hasCoords && stored.validationStatus === "verified",
      methodsAttempted: ["Stored Entity"],
    };
  }

  return {
    displayName: "Location not available",
    city: null,
    country: null,
    latitude: null,
    longitude: null,
    extractionMethod: "Stored Entity",
    confidence: 0,
    verified: false,
    methodsAttempted: ["Stored Entity"],
  };
}
