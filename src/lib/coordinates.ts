import { hasValidCoordinates } from "@/lib/locationBlacklist";

export type CoordinateLike =
  | { latitude?: number | null; longitude?: number | null }
  | null
  | undefined;

export function getSafeCoordinates(
  loc: CoordinateLike
): { lat: number; lng: number } | null {
  if (!loc) return null;
  const latitude = loc.latitude ?? null;
  const longitude = loc.longitude ?? null;
  if (!hasValidCoordinates(latitude, longitude)) return null;
  return { lat: latitude as number, lng: longitude as number };
}

export function hasSafeCoordinates(loc: CoordinateLike): boolean {
  return getSafeCoordinates(loc) !== null;
}

export { hasValidCoordinates };
