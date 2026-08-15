import type {
  LocationResolutionMethod,
  LocationResolutionStatus,
} from "@prisma/client";
import { resolveCountryCentroidFromTexts } from "@/lib/countryCentroids";
import {
  hasValidCoordinates,
  isBlacklistedLocationName,
  shouldRejectLocationCandidate,
} from "@/lib/locationBlacklist";
import { getCached, setCached } from "@/lib/simpleCache";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";
import { locationRepository } from "@/repositories/locationRepository";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NOMINATIM_MIN_INTERVAL_MS = 1_100;

export interface LocationResolverInput {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  fullLocationText?: string | null;
  crisisType?: string | null;
  sourceTitle?: string | null;
  sourceContent?: string | null;
  aiLatitude?: number | null;
  aiLongitude?: number | null;
  tx?: PrismaTransactionClient;
}

export interface LocationResolverResult {
  latitude: number | null;
  longitude: number | null;
  confidenceScore: number;
  resolutionMethod: LocationResolutionMethod | null;
  resolvedDisplayName: string;
  resolutionStatus: LocationResolutionStatus;
  rawLocationText: string;
}

let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimRequestAt = 0;

function log(message: string): void {
  console.info(`[LocationResolver] ${message}`);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

const UNKNOWN_LOCATION_LABEL = "Unknown location";
const UNKNOWN_REGION_LABEL = "Unknown Region";

function isUnknownLocationLabel(value: string): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return (
    normalized === UNKNOWN_LOCATION_LABEL.toLowerCase() ||
    normalized === UNKNOWN_REGION_LABEL.toLowerCase()
  );
}

function sanitizeLocationPart(
  value: string | null | undefined,
  crisisType?: string | null
): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const validParts = parts.filter(
    (part) => !shouldRejectLocationCandidate(part, crisisType)
  );
  if (validParts.length > 0) {
    return validParts.join(", ");
  }

  return shouldRejectLocationCandidate(normalized, crisisType) ? "" : normalized;
}

function buildRawLocationText(input: LocationResolverInput): string {
  const crisisType = input.crisisType ?? null;

  const explicit = sanitizeLocationPart(input.fullLocationText, crisisType);
  if (explicit) return explicit;

  const city = sanitizeLocationPart(input.city, crisisType);
  const region = sanitizeLocationPart(input.region, crisisType);
  const country = sanitizeLocationPart(input.country, crisisType);

  if (city && country) return `${city}, ${country}`;
  if (region && country) return `${region}, ${country}`;
  if (city) return city;
  if (region) return region;
  if (country) return country;

  const title = sanitizeLocationPart(input.sourceTitle, crisisType);
  if (title) return title;

  return UNKNOWN_LOCATION_LABEL;
}

function buildGeocodeQueries(
  input: LocationResolverInput,
  rawLocationText: string
): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  const crisisType = input.crisisType ?? null;

  function add(query: string): void {
    const normalized = sanitizeLocationPart(query, crisisType);
    if (!normalized || normalized.length < 2) return;
    if (isUnknownLocationLabel(normalized)) return;
    if (isBlacklistedLocationName(normalized)) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(normalized);
  }

  add(rawLocationText);

  const city = sanitizeLocationPart(input.city, crisisType);
  const region = sanitizeLocationPart(input.region, crisisType);
  const country = sanitizeLocationPart(input.country, crisisType);

  if (city && country) add(`${city}, ${country}`);
  if (region && country) add(`${region}, ${country}`);
  if (country) add(country);
  if (city) add(city);
  if (region) add(region);

  return queries;
}

function onlyCountryKnown(input: LocationResolverInput): boolean {
  const crisisType = input.crisisType ?? null;
  const city = sanitizeLocationPart(input.city, crisisType);
  const region = sanitizeLocationPart(input.region, crisisType);
  const country = sanitizeLocationPart(input.country, crisisType);

  if (!country) return false;
  if (!city && !region) return true;
  if (city && city.toLowerCase() === country.toLowerCase()) return true;
  return false;
}

function buildVerifiedResult(
  displayName: string,
  latitude: number,
  longitude: number,
  method: LocationResolutionMethod,
  confidence: number,
  rawLocationText: string
): LocationResolverResult {
  return {
    latitude,
    longitude,
    confidenceScore: confidence,
    resolutionMethod: method,
    resolvedDisplayName: displayName,
    resolutionStatus: "VERIFIED",
    rawLocationText,
  };
}

function buildCountryCentroidResult(
  displayName: string,
  latitude: number,
  longitude: number,
  rawLocationText: string
): LocationResolverResult {
  return {
    latitude,
    longitude,
    confidenceScore: 0.45,
    resolutionMethod: "COUNTRY_CENTROID",
    resolvedDisplayName: displayName,
    resolutionStatus: "COUNTRY_CENTROID",
    rawLocationText,
  };
}

function buildPendingResult(
  displayName: string,
  rawLocationText: string
): LocationResolverResult {
  return {
    latitude: null,
    longitude: null,
    confidenceScore: 0.2,
    resolutionMethod: null,
    resolvedDisplayName: displayName,
    resolutionStatus: "LOCATION_PENDING",
    rawLocationText,
  };
}

async function scheduleNominatimRequest<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const elapsed = Date.now() - lastNominatimRequestAt;
    if (elapsed < NOMINATIM_MIN_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, NOMINATIM_MIN_INTERVAL_MS - elapsed)
      );
    }
    lastNominatimRequestAt = Date.now();
    return fn();
  };

  const task = nominatimQueue.then(run, run);
  nominatimQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

export async function geocodeWithNominatim(
  query: string
): Promise<{ name: string; latitude: number; longitude: number; confidence: number } | null> {
  const cacheKey = `nominatim:${query.toLowerCase()}`;
  const cached = getCached<{
    name: string;
    latitude: number;
    longitude: number;
    confidence: number;
  }>(cacheKey);
  if (cached) return cached;

  return scheduleNominatimRequest(async () => {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "en");

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "AI-Assisted-Humanitarian-Crisis-Mapping/1.0 (humanitarian crisis mapping; contact=admin@localhost)",
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) return null;

    const results = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      name?: string;
      display_name?: string;
      addresstype?: string;
      type?: string;
      importance?: number;
    }>;

    const first = results[0];
    if (!first?.lat || !first?.lon) return null;

    const lat = Number.parseFloat(first.lat);
    const lon = Number.parseFloat(first.lon);
    if (!hasValidCoordinates(lat, lon)) return null;

    const primaryName =
      first.name?.trim() ||
      first.display_name?.split(",")[0]?.trim() ||
      query;

    const importance = first.importance ?? 0.5;
    const result = {
      name: primaryName,
      latitude: lat,
      longitude: lon,
      confidence: Math.min(0.9, 0.6 + importance * 0.3),
    };

    setCached(cacheKey, result, GEOCODE_CACHE_TTL_MS);
    return result;
  });
}

export async function geocodeWithGeoNames(
  query: string
): Promise<{ name: string; latitude: number; longitude: number; confidence: number } | null> {
  const username = process.env.GEONAMES_USERNAME?.trim();
  if (!username) return null;

  const cacheKey = `geonames:${query.toLowerCase()}`;
  const cached = getCached<{
    name: string;
    latitude: number;
    longitude: number;
    confidence: number;
  }>(cacheKey);
  if (cached) return cached;

  const url = new URL("https://secure.geonames.org/searchJSON");
  url.searchParams.set("q", query);
  url.searchParams.set("maxRows", "1");
  url.searchParams.set("featureClass", "A");
  url.searchParams.append("featureClass", "P");
  url.searchParams.set("username", username);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    geonames?: Array<{ name?: string; lat?: string; lng?: string }>;
  };
  const first = payload.geonames?.[0];
  if (!first?.name || !first.lat || !first.lng) return null;

  const lat = Number.parseFloat(first.lat);
  const lon = Number.parseFloat(first.lng);
  if (!hasValidCoordinates(lat, lon)) return null;

  const result = {
    name: first.name.trim(),
    latitude: lat,
    longitude: lon,
    confidence: 0.82,
  };

  setCached(cacheKey, result, GEOCODE_CACHE_TTL_MS);
  return result;
}

export async function resolveLocation(
  input: LocationResolverInput
): Promise<LocationResolverResult> {
  const crisisType = input.crisisType ?? null;
  const rawLocationText = buildRawLocationText(input);
  const city = sanitizeLocationPart(input.city, crisisType);
  const country = sanitizeLocationPart(input.country, crisisType);
  const fullLocationText = sanitizeLocationPart(input.fullLocationText, crisisType);
  const displayName =
    fullLocationText ||
    (city && country ? `${city}, ${country}` : rawLocationText);

  if (
    shouldRejectLocationCandidate(displayName, crisisType) ||
    (rawLocationText !== UNKNOWN_LOCATION_LABEL &&
      shouldRejectLocationCandidate(rawLocationText, crisisType)) ||
    isUnknownLocationLabel(displayName)
  ) {
    log(`Rejected non-place location: ${displayName || rawLocationText}`);
    return buildPendingResult(
      displayName || rawLocationText || UNKNOWN_LOCATION_LABEL,
      rawLocationText
    );
  }

  log(`Resolving: ${displayName}`);

  const queries = buildGeocodeQueries(input, rawLocationText);
  if (queries.length === 0) {
    log(`Pending: no geocodable place candidates for ${displayName}`);
    return buildPendingResult(displayName, rawLocationText);
  }

  const aiLat = input.aiLatitude ?? null;
  const aiLng = input.aiLongitude ?? null;
  if (hasValidCoordinates(aiLat, aiLng)) {
    log(`Found via AI coordinates: ${aiLat}, ${aiLng}`);
    return buildVerifiedResult(
      displayName,
      aiLat!,
      aiLng!,
      "AI",
      0.92,
      rawLocationText
    );
  }

  const existing = await locationRepository.findByName(displayName, input.tx);
  if (
    existing &&
    existing.resolutionStatus !== "LOCATION_PENDING" &&
    hasValidCoordinates(existing.latitude, existing.longitude)
  ) {
    log(
      `Found via database: ${existing.latitude}, ${existing.longitude}`
    );
    return {
      latitude: existing.latitude,
      longitude: existing.longitude,
      confidenceScore: existing.confidenceScore,
      resolutionMethod: existing.resolutionMethod ?? "DATABASE",
      resolvedDisplayName: existing.name,
      resolutionStatus:
        existing.resolutionStatus === "COUNTRY_CENTROID"
          ? "COUNTRY_CENTROID"
          : "VERIFIED",
      rawLocationText: existing.rawLocationText ?? rawLocationText,
    };
  }

  for (const query of queries) {
    const geoNames = await geocodeWithGeoNames(query);
    if (geoNames) {
      log(`Found via GeoNames: ${geoNames.latitude}, ${geoNames.longitude}`);
      return buildVerifiedResult(
        geoNames.name,
        geoNames.latitude,
        geoNames.longitude,
        "GEONAMES",
        geoNames.confidence,
        rawLocationText
      );
    }
  }

  for (const query of queries) {
    const nominatim = await geocodeWithNominatim(query);
    if (nominatim) {
      log(`Found via Nominatim: ${nominatim.latitude}, ${nominatim.longitude}`);
      return buildVerifiedResult(
        nominatim.name,
        nominatim.latitude,
        nominatim.longitude,
        "NOMINATIM",
        nominatim.confidence,
        rawLocationText
      );
    }
  }

  const centroidTexts = [
    sanitizeLocationPart(input.country, crisisType),
    sanitizeLocationPart(input.region, crisisType),
    sanitizeLocationPart(input.city, crisisType),
    rawLocationText,
  ].filter(Boolean);

  if (onlyCountryKnown(input) || centroidTexts.length > 0) {
    const centroid = resolveCountryCentroidFromTexts(centroidTexts);
    if (centroid) {
      log(`Fallback to country centroid: ${centroid.name}`);
      return buildCountryCentroidResult(
        centroid.name,
        centroid.lat,
        centroid.lng,
        rawLocationText
      );
    }
  }

  log(`Pending: ${displayName || "unknown location"}`);
  return buildPendingResult(displayName || "Unknown location", rawLocationText);
}

export function isLocationPendingStatus(
  status: LocationResolutionStatus
): boolean {
  return status === "LOCATION_PENDING" || status === "FAILED";
}

export function getLocationStatusLabel(
  status: LocationResolutionStatus
): string {
  switch (status) {
    case "VERIFIED":
      return "Location verified";
    case "COUNTRY_CENTROID":
      return "Approximate country-level location";
    case "LOCATION_PENDING":
    case "FAILED":
      return "Location pending verification";
    default:
      return "Location pending verification";
  }
}

export interface ResolvePendingLocationsResult {
  attempted: number;
  resolved: number;
  stillPending: number;
  verified: number;
  approximate: number;
}

export async function resolvePendingLocations(): Promise<ResolvePendingLocationsResult> {
  const pending = await locationRepository.findPending(50);

  const result: ResolvePendingLocationsResult = {
    attempted: pending.length,
    resolved: 0,
    stillPending: 0,
    verified: 0,
    approximate: 0,
  };

  for (const location of pending) {
    const parts = (location.rawLocationText ?? location.name).split(",");
    const country = parts.length > 1 ? parts[parts.length - 1]?.trim() : null;
    const city = parts.length > 1 ? parts[0]?.trim() : parts[0]?.trim();

    const resolved = await resolveLocation({
      fullLocationText: location.rawLocationText ?? location.name,
      city,
      country,
    });

    if (resolved.resolutionStatus === "LOCATION_PENDING") {
      result.stillPending += 1;
      continue;
    }

    await locationRepository.updateResolution(location.id, {
      name: resolved.resolvedDisplayName,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      resolutionStatus: resolved.resolutionStatus,
      resolutionMethod: resolved.resolutionMethod,
      confidenceScore: resolved.confidenceScore,
      rawLocationText: resolved.rawLocationText,
    });

    result.resolved += 1;
    if (resolved.resolutionStatus === "VERIFIED") result.verified += 1;
    if (resolved.resolutionStatus === "COUNTRY_CENTROID") result.approximate += 1;
  }

  log(
    `Retry complete: ${result.resolved} resolved, ${result.stillPending} still pending`
  );

  return result;
}
