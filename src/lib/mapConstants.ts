import type { RiskLevel } from "@prisma/client";

export const RISK_ZONE_COLORS: Record<RiskLevel, string> = {
  Critical: "#dc2626",
  High: "#ea580c",
  Medium: "#ca8a04",
  Low: "#16a34a",
};

export const VERIFICATION_COLORS = {
  verified: "#3b82f6",
  pending: "#64748b",
};

const BASE_RADIUS_METERS: Record<RiskLevel, { min: number; max: number }> = {
  Low: { min: 15_000, max: 30_000 },
  Medium: { min: 30_000, max: 50_000 },
  High: { min: 50_000, max: 80_000 },
  Critical: { min: 80_000, max: 120_000 },
};

/** Absolute caps for a single incident projection (meters). */
export const RISK_RADIUS_ABSOLUTE_MIN = 15_000;
export const RISK_RADIUS_ABSOLUTE_MAX = 120_000;

export interface RiskRadiusInput {
  riskLevel: RiskLevel;
  crisisType?: string | null;
  confidenceScore?: number;
  locationConfidence?: number | null;
  priorityLevel?: string | null;
  affectedPopulation?: number | null;
  countryCentroid?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isNaturalDisaster(crisisType: string | null | undefined): boolean {
  const type = (crisisType ?? "").toLowerCase();
  return (
    type.includes("earthquake") ||
    type.includes("seismic") ||
    type.includes("flood") ||
    type.includes("wildfire") ||
    type.includes("fire") ||
    type.includes("storm") ||
    type.includes("hurricane") ||
    type.includes("cyclone") ||
    type.includes("tsunami") ||
    type.includes("volcano") ||
    type.includes("drought")
  );
}

function prioritySeverityBoost(priorityLevel: string | null | undefined): number {
  switch (priorityLevel) {
    case "Critical":
      return 0.22;
    case "High":
      return 0.12;
    case "Medium":
      return 0.04;
    case "Low":
      return -0.06;
    default:
      return 0;
  }
}

/**
 * Localized impact radius in meters — centered on incident coordinates.
 * Based on risk level, crisis type, severity, confidence, and projection score.
 */
export function computeRiskZoneRadius(input: RiskRadiusInput): number;
export function computeRiskZoneRadius(
  riskLevel: RiskLevel,
  affectedPopulation?: number | null
): number;
export function computeRiskZoneRadius(
  inputOrLevel: RiskRadiusInput | RiskLevel,
  affectedPopulation?: number | null
): number {
  const input: RiskRadiusInput =
    typeof inputOrLevel === "string"
      ? { riskLevel: inputOrLevel, affectedPopulation }
      : inputOrLevel;

  const range = BASE_RADIUS_METERS[input.riskLevel];
  let position = 0.5;

  position += prioritySeverityBoost(input.priorityLevel);

  if (input.confidenceScore !== undefined) {
    position += (clamp(input.confidenceScore, 0, 1) - 0.5) * 0.18;
  }

  if (input.locationConfidence !== undefined && input.locationConfidence !== null) {
    position += (clamp(input.locationConfidence / 100, 0, 1) - 0.5) * 0.12;
  }

  if (isNaturalDisaster(input.crisisType)) {
    position += 0.08;
  }

  if (input.countryCentroid) {
    position = Math.max(position, 0.85);
  }

  position = clamp(position, 0, 1);
  let radius = range.min + position * (range.max - range.min);

  if (input.countryCentroid) {
    radius = Math.round(radius * 2.2);
  }

  if (isNaturalDisaster(input.crisisType) && input.affectedPopulation) {
    const pop = Math.max(0, input.affectedPopulation);
    const popBonus = Math.min(Math.sqrt(pop) * 2.5, 50_000);
    radius += popBonus;
  }

  return Math.round(
    clamp(radius, RISK_RADIUS_ABSOLUTE_MIN, RISK_RADIUS_ABSOLUTE_MAX)
  );
}

/**
 * World-view impact radii (meters) — large regional areas visible at zoom 2.
 * Blends down to localized ground truth as the user zooms in.
 */
const WORLD_VIEW_RADIUS_METERS: Record<RiskLevel, { min: number; max: number }> = {
  Critical: { min: 1_000_000, max: 1_500_000 },
  High: { min: 600_000, max: 900_000 },
  Medium: { min: 350_000, max: 500_000 },
  Low: { min: 150_000, max: 250_000 },
};

/** Blend factor toward ground-truth radius: 0 = world overview, 1 = street precision. */
const ZOOM_RADIUS_BLEND_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [2, 0],
  [4, 0.35],
  [6, 0.55],
  [8, 0.75],
  [10, 0.88],
  [12, 1],
  [14, 1],
];

/** Icon hub diameter (px) — scales with zoom level. */
const ZOOM_ICON_SIZE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [2, 30],
  [3, 32],
  [4, 34],
  [5, 38],
  [6, 40],
  [7, 43],
  [8, 46],
  [10, 50],
  [12, 52],
  [14, 54],
];

/** SVG icon size inside the hub (px) — scales with zoom level. */
const ZOOM_ICON_SVG_SIZE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [2, 17],
  [3, 18],
  [4, 19],
  [5, 20],
  [6, 22],
  [7, 23],
  [8, 24],
  [10, 26],
  [12, 27],
  [14, 28],
];

function interpolateAnchors(
  zoom: number,
  anchors: ReadonlyArray<readonly [number, number]>
): number {
  if (anchors.length === 0) return 0;
  if (zoom <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (zoom >= last[0]) return last[1];

  for (let i = 0; i < anchors.length - 1; i++) {
    const [z0, v0] = anchors[i];
    const [z1, v1] = anchors[i + 1];
    if (zoom >= z0 && zoom <= z1) {
      const t = (zoom - z0) / (z1 - z0);
      const eased = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * eased;
    }
  }
  return last[1];
}

function getWorldViewRadiusMeters(
  riskLevel: RiskLevel,
  groundRadiusMeters: number
): number {
  const worldRange = WORLD_VIEW_RADIUS_METERS[riskLevel];
  const groundRange = BASE_RADIUS_METERS[riskLevel];
  const span = groundRange.max - groundRange.min;
  const t =
    span > 0
      ? clamp((groundRadiusMeters - groundRange.min) / span, 0, 1)
      : 0.5;
  return Math.round(worldRange.min + t * (worldRange.max - worldRange.min));
}

/**
 * Display radius for map circles — large regional areas at world zoom,
 * smoothly transitions to geographically accurate radius at street zoom.
 */
export function getDisplayRadiusMeters(
  groundRadiusMeters: number,
  zoom: number,
  riskLevel: RiskLevel
): number {
  const worldRadius = getWorldViewRadiusMeters(riskLevel, groundRadiusMeters);
  const precisionRadius = clamp(
    groundRadiusMeters,
    RISK_RADIUS_ABSOLUTE_MIN,
    RISK_RADIUS_ABSOLUTE_MAX
  );
  const blend = interpolateAnchors(zoom, ZOOM_RADIUS_BLEND_ANCHORS);
  return Math.round(worldRadius + (precisionRadius - worldRadius) * blend);
}

/** Hub icon diameter in pixels — world 28–32px up to city 46–54px. */
export function getIconSizeForZoom(zoom: number): number {
  return Math.round(interpolateAnchors(zoom, ZOOM_ICON_SIZE_ANCHORS));
}

/** SVG icon size inside the hub — world 16–18px up to city 24–28px. */
export function getIconSvgSizeForZoom(zoom: number): number {
  return Math.round(interpolateAnchors(zoom, ZOOM_ICON_SVG_SIZE_ANCHORS));
}

export const MAP_LABEL_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png";

export const MAP_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.esri.com/">Esri</a>';

export type MapStyleId = "dark" | "satellite" | "light";

export interface MapStylePreset {
  id: MapStyleId;
  label: string;
  baseUrl: string;
  labelUrl: string | null;
  baseFilter?: string;
}

export const MAP_STYLE_PRESETS: Record<MapStyleId, MapStylePreset> = {
  dark: {
    id: "dark",
    label: "Dark",
    baseUrl: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
    labelUrl: MAP_LABEL_TILE_URL,
    baseFilter: "brightness(1.35) saturate(0.9) contrast(1.05)",
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    baseUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    labelUrl: MAP_LABEL_TILE_URL,
    baseFilter: "brightness(1.05) saturate(1.1)",
  },
  light: {
    id: "light",
    label: "Light",
    baseUrl: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    labelUrl:
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
    baseFilter: "brightness(1.02)",
  },
};

/** Zoom-aware radius scaling for heat circles */
export function scaleRadiusForZoom(
  radiusMeters: number,
  zoom: number,
  riskLevel: RiskLevel
): number {
  return getDisplayRadiusMeters(radiusMeters, zoom, riskLevel);
}

export function getRiskZoneColor(riskLevel: RiskLevel): string {
  return RISK_ZONE_COLORS[riskLevel];
}

export { getCrisisIconKey, type CrisisIconKey } from "@/lib/crisisIcons";

interface ShapeProfile {
  stretchX: number;
  stretchY: number;
  rotationDeg: number;
  jitter: number;
}

function getShapeProfile(crisisType: string | null): ShapeProfile {
  const type = (crisisType ?? "").toLowerCase();

  if (type.includes("conflict") || type.includes("armed")) {
    return { stretchX: 1.35, stretchY: 0.85, rotationDeg: 25, jitter: 0.22 };
  }
  if (type.includes("flood")) {
    return { stretchX: 1.25, stretchY: 0.9, rotationDeg: 8, jitter: 0.18 };
  }
  if (type.includes("fire") || type.includes("wildfire")) {
    return { stretchX: 1.1, stretchY: 1.15, rotationDeg: -12, jitter: 0.2 };
  }
  if (type.includes("displacement") || type.includes("displaced")) {
    return { stretchX: 1.2, stretchY: 1.05, rotationDeg: 35, jitter: 0.18 };
  }
  if (type.includes("earthquake") || type.includes("seismic")) {
    return { stretchX: 1.08, stretchY: 1.08, rotationDeg: 12, jitter: 0.2 };
  }
  if (type.includes("storm") || type.includes("hurricane")) {
    return { stretchX: 1.15, stretchY: 1.2, rotationDeg: -8, jitter: 0.22 };
  }

  return { stretchX: 1.08, stretchY: 1.0, rotationDeg: 0, jitter: 0.15 };
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededUnit(seed: string, index: number): number {
  const value = Math.sin(hashSeed(seed) + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function offsetMeters(
  lat: number,
  lng: number,
  eastMeters: number,
  northMeters: number
): [number, number] {
  const deltaLat = northMeters / 111320;
  const deltaLng = eastMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat + deltaLat, lng + deltaLng];
}

function rotatePoint(
  east: number,
  north: number,
  rotationRad: number
): [number, number] {
  return [
    east * Math.cos(rotationRad) - north * Math.sin(rotationRad),
    east * Math.sin(rotationRad) + north * Math.cos(rotationRad),
  ];
}

export function generateOrganicRiskPolygon(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  crisisType: string | null,
  seed: string,
  scale = 1
): [number, number][] {
  const profile = getShapeProfile(crisisType);
  const rotationRad = (profile.rotationDeg * Math.PI) / 180;
  const pointCount = 14;
  const coordinates: [number, number][] = [];

  for (let i = 0; i < pointCount; i++) {
    const angle = (2 * Math.PI * i) / pointCount;
    const noise = 0.62 + seededUnit(seed, i) * (0.45 + profile.jitter);
    const radius = radiusMeters * scale * noise;

    let east = radius * Math.cos(angle) * profile.stretchX;
    let north = radius * Math.sin(angle) * profile.stretchY;
    [east, north] = rotatePoint(east, north, rotationRad);

    coordinates.push(offsetMeters(latitude, longitude, east, north));
  }

  return coordinates;
}

export function generateGlowPolygons(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  crisisType: string | null,
  seed: string
): [number, number][][] {
  return [
    generateOrganicRiskPolygon(latitude, longitude, radiusMeters, crisisType, seed, 1.12),
    generateOrganicRiskPolygon(latitude, longitude, radiusMeters, crisisType, seed, 1.06),
    generateOrganicRiskPolygon(latitude, longitude, radiusMeters, crisisType, seed, 1),
  ];
}
