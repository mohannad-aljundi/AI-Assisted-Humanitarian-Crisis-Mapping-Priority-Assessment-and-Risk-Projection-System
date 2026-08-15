import type { ValidatedLocation } from "@/lib/locationConfidence";
import {
  hasValidCoordinates,
  isBlacklistedLocationName,
} from "@/lib/locationBlacklist";
import {
  geocodeWithGeoNames,
  geocodeWithNominatim,
} from "@/services/locationResolver";

const KNOWN_COUNTRIES = new Set([
  "afghanistan",
  "haiti",
  "iraq",
  "palestine",
  "somalia",
  "sudan",
  "syria",
  "ukraine",
  "yemen",
  "venezuela",
]);

const KNOWN_CITIES = new Map<
  string,
  { latitude: number; longitude: number; display: string }
>([
  ["aleppo", { latitude: 36.2021, longitude: 37.1343, display: "Aleppo" }],
  ["baghdad", { latitude: 33.3152, longitude: 44.3661, display: "Baghdad" }],
  ["el fasher", { latitude: 13.628, longitude: 25.349, display: "El Fasher" }],
  ["gaza", { latitude: 31.5017, longitude: 34.4668, display: "Gaza" }],
  ["hama", { latitude: 35.1318, longitude: 36.7578, display: "Hama" }],
  ["idlib", { latitude: 35.9306, longitude: 36.6339, display: "Idlib" }],
  ["khartoum", { latitude: 15.5007, longitude: 32.5599, display: "Khartoum" }],
  ["kyiv", { latitude: 50.4501, longitude: 30.5234, display: "Kyiv" }],
  ["mariupol", { latitude: 47.0971, longitude: 37.5434, display: "Mariupol" }],
  ["omdurman", { latitude: 15.645, longitude: 32.4777, display: "Omdurman" }],
  [
    "port-au-prince",
    { latitude: 18.5944, longitude: -72.3074, display: "Port-au-Prince" },
  ],
  ["wad madani", { latitude: 14.401, longitude: 33.52, display: "Wad Madani" }],
]);

function normalizeLocationName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function looksLikeValidCandidate(value: string): boolean {
  const normalized = normalizeLocationName(value);
  if (normalized.length < 3) return false;
  if (/^coordinates\b/i.test(normalized)) return false;
  if (!/[A-Za-z]/.test(normalized)) return false;
  if (isBlacklistedLocationName(normalized)) return false;
  return true;
}

export class LocationValidationService {
  async validateLocations(
    candidates: Array<{ name: string; latitude: number | null; longitude: number | null }>
  ): Promise<ValidatedLocation[]> {
    const validated: ValidatedLocation[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
      const normalized = normalizeLocationName(candidate.name);
      const key = normalized.toLowerCase();

      if (!looksLikeValidCandidate(normalized) || seen.has(key)) {
        continue;
      }

      let validLocation: ValidatedLocation | null = null;

      const knownCity = KNOWN_CITIES.get(key);
      if (knownCity) {
        validLocation = {
          name: knownCity.display,
          latitude: knownCity.latitude,
          longitude: knownCity.longitude,
          confidence: 0.95,
          validationStatus: "verified",
        };
      } else if (
        KNOWN_COUNTRIES.has(key) &&
        hasValidCoordinates(candidate.latitude, candidate.longitude)
      ) {
        validLocation = {
          name: normalized,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          confidence: 0.75,
          validationStatus: "verified",
        };
      } else if (hasValidCoordinates(candidate.latitude, candidate.longitude)) {
        validLocation = {
          name: normalized,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          confidence: 0.9,
          validationStatus: "verified",
        };
      } else {
        const geoNames = await geocodeWithGeoNames(normalized);
        const geocoded =
          geoNames ??
          (await geocodeWithNominatim(normalized));
        if (geocoded) {
          validLocation = {
            name: geocoded.name,
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            confidence: geocoded.confidence,
            validationStatus: "geocoded",
          };
        }
      }

      if (!validLocation) continue;
      if (!hasValidCoordinates(validLocation.latitude, validLocation.longitude)) {
        continue;
      }

      seen.add(key);
      validated.push(validLocation);
    }

    return validated.slice(0, 10);
  }
}

export const locationValidationService = new LocationValidationService();
