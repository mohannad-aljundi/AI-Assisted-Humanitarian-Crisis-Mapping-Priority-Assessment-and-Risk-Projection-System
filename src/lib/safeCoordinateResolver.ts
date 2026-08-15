import type { LocationResolutionStatus } from "@prisma/client";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";
import {
  isLocationPendingStatus,
  resolveLocation,
  type LocationResolverInput,
  type LocationResolverResult,
} from "@/services/locationResolver";

export type CoordinateResolutionSource =
  | "ai"
  | "database"
  | "geonames"
  | "nominatim"
  | "centroid"
  | "none";

export interface SafeCoordinateInput {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  countryHint?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  crisisType?: string | null;
  sourceTitle?: string | null;
  sourceContent?: string | null;
  tx?: PrismaTransactionClient;
}

export interface SafeCoordinateResult {
  displayName: string;
  latitude: number | null;
  longitude: number | null;
  locationPending: boolean;
  locationApproximate: boolean;
  resolutionSource: CoordinateResolutionSource;
  resolutionStatus: LocationResolutionStatus;
  confidenceScore: number;
  rawLocationText: string;
  /** Coordinates safe to persist on Location (may be null when pending). */
  dbLatitude: number | null;
  dbLongitude: number | null;
  dbName: string;
}

const PENDING_PREFIX = "Pending: ";

function mapResolutionSource(
  result: LocationResolverResult
): CoordinateResolutionSource {
  switch (result.resolutionMethod) {
    case "AI":
      return "ai";
    case "DATABASE":
      return "database";
    case "GEONAMES":
      return "geonames";
    case "NOMINATIM":
      return "nominatim";
    case "COUNTRY_CENTROID":
      return "centroid";
    default:
      return "none";
  }
}

function toResolverInput(input: SafeCoordinateInput): LocationResolverInput {
  const name = input.name.trim();
  const countryHint = input.countryHint?.trim() || null;
  const hasComma = name.includes(",");

  return {
    fullLocationText: name || null,
    city: input.city ?? (hasComma ? name.split(",")[0]?.trim() : name || null),
    region: input.region ?? null,
    country: input.country ?? countryHint,
    crisisType: input.crisisType ?? null,
    sourceTitle: input.sourceTitle ?? null,
    sourceContent: input.sourceContent ?? null,
    aiLatitude: input.latitude ?? null,
    aiLongitude: input.longitude ?? null,
    tx: input.tx,
  };
}

export async function resolveSafeCoordinates(
  input: SafeCoordinateInput
): Promise<SafeCoordinateResult> {
  const resolved = await resolveLocation(toResolverInput(input));
  const locationPending = isLocationPendingStatus(resolved.resolutionStatus);
  const locationApproximate = resolved.resolutionStatus === "COUNTRY_CENTROID";
  const resolutionSource = mapResolutionSource(resolved);

  const dbName = locationPending
    ? `${PENDING_PREFIX}${resolved.resolvedDisplayName}`
    : resolved.resolvedDisplayName;

  return {
    displayName: resolved.resolvedDisplayName,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    locationPending,
    locationApproximate,
    resolutionSource,
    resolutionStatus: resolved.resolutionStatus,
    confidenceScore: resolved.confidenceScore,
    rawLocationText: resolved.rawLocationText,
    dbLatitude: resolved.latitude,
    dbLongitude: resolved.longitude,
    dbName,
  };
}

export function isPendingLocationName(name: string): boolean {
  return name.trim().toLowerCase().startsWith(PENDING_PREFIX.toLowerCase());
}

export function isPendingLocationRecord(input: {
  name: string;
  resolutionStatus?: LocationResolutionStatus | null;
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  if (input.resolutionStatus) {
    return isLocationPendingStatus(input.resolutionStatus);
  }
  return isPendingLocationName(input.name);
}
