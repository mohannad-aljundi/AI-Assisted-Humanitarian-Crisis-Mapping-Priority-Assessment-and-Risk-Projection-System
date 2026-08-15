import type { RiskLevel } from "@prisma/client";
import {
  computeRiskZoneRadius,
  generateOrganicRiskPolygon,
} from "@/lib/mapConstants";

export interface GeoPoint {
  name: string;
  latitude: number;
  longitude: number;
}

export interface CrisisRegionGeometry {
  centroidLatitude: number;
  centroidLongitude: number;
  affectedRadiusMeters: number;
  boundaryPolygon: [number, number][];
  regionLabel: string;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

function offsetMeters(
  lat: number,
  lng: number,
  eastMeters: number,
  northMeters: number
): [number, number] {
  const deltaLat = northMeters / 111320;
  const deltaLng = eastMeters / (111320 * Math.cos(toRadians(lat)));
  return [lat + deltaLat, lng + deltaLng];
}

function cross(
  origin: GeoPoint,
  a: GeoPoint,
  b: GeoPoint
): number {
  return (
    (a.longitude - origin.longitude) * (b.latitude - origin.latitude) -
    (a.latitude - origin.latitude) * (b.longitude - origin.longitude)
  );
}

function convexHull(points: GeoPoint[]): GeoPoint[] {
  if (points.length <= 2) return points;

  const sorted = [...points].sort(
    (a, b) =>
      a.longitude - b.longitude ||
      a.latitude - b.latitude
  );

  const lower: GeoPoint[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: GeoPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function expandHull(
  hull: GeoPoint[],
  centroid: { latitude: number; longitude: number },
  bufferMeters: number
): [number, number][] {
  return hull.map((point) => {
    const eastMeters =
      (point.longitude - centroid.longitude) *
      111320 *
      Math.cos(toRadians(centroid.latitude));
    const northMeters = (point.latitude - centroid.latitude) * 111320;
    const length = Math.hypot(eastMeters, northMeters) || 1;
    const factor = (length + bufferMeters) / length;
    return offsetMeters(
      centroid.latitude,
      centroid.longitude,
      eastMeters * factor,
      northMeters * factor
    );
  });
}

function buildSingleLocationBoundary(
  point: GeoPoint,
  radiusMeters: number,
  crisisType: string | null
): [number, number][] {
  return generateOrganicRiskPolygon(
    point.latitude,
    point.longitude,
    radiusMeters,
    crisisType,
    point.name,
    1
  );
}

export function computeCrisisRegionGeometry(
  points: GeoPoint[],
  countryName: string,
  crisisType: string | null,
  riskLevel: RiskLevel,
  affectedPopulation: number | null
): CrisisRegionGeometry | null {
  const validPoints = points.filter(
    (point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      !(point.latitude === 0 && point.longitude === 0)
  );

  if (validPoints.length === 0) return null;

  const centroidLatitude =
    validPoints.reduce((sum, point) => sum + point.latitude, 0) /
    validPoints.length;
  const centroidLongitude =
    validPoints.reduce((sum, point) => sum + point.longitude, 0) /
    validPoints.length;

  const maxSpreadMeters = validPoints.reduce((max, point) => {
    return Math.max(
      max,
      haversineMeters(
        centroidLatitude,
        centroidLongitude,
        point.latitude,
        point.longitude
      )
    );
  }, 0);

  const baseRadius = computeRiskZoneRadius({
    riskLevel,
    crisisType,
    affectedPopulation,
  });

  const spreadBuffer = Math.min(maxSpreadMeters * 0.35 + 3_000, 25_000);
  const affectedRadiusMeters = Math.round(
    Math.min(
      Math.max(baseRadius, validPoints.length === 1 ? baseRadius : baseRadius + spreadBuffer),
      250_000
    )
  );

  let boundaryPolygon: [number, number][];

  if (validPoints.length === 1) {
    boundaryPolygon = buildSingleLocationBoundary(
      validPoints[0],
      affectedRadiusMeters,
      crisisType
    );
  } else {
    const hull = convexHull(validPoints);
    const bufferMeters = Math.min(Math.max(8_000, affectedRadiusMeters * 0.15), 20_000);
    boundaryPolygon = expandHull(hull, { latitude: centroidLatitude, longitude: centroidLongitude }, bufferMeters);

    if (boundaryPolygon.length < 3) {
      boundaryPolygon = buildSingleLocationBoundary(
        {
          name: validPoints[0].name,
          latitude: centroidLatitude,
          longitude: centroidLongitude,
        },
        affectedRadiusMeters,
        crisisType
      );
    }
  }

  const regionLabel =
    validPoints.length > 1
      ? `${countryName} Crisis Region`
      : `${validPoints[0].name}, ${countryName}`;

  return {
    centroidLatitude,
    centroidLongitude,
    affectedRadiusMeters,
    boundaryPolygon,
    regionLabel,
  };
}
