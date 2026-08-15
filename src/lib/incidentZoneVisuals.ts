import type { RiskLevel } from "@prisma/client";
import {
  buildCrisisIconSvgMarkup,
  getCrisisMarkerRiskClass,
  getVerificationBorderClass,
  type CrisisIconKey,
} from "@/lib/crisisIcons";
import { getCrisisTypeColor, getCrisisTypeHubBackground } from "@/lib/crisisTypeColors";
import { RISK_ZONE_COLORS } from "@/lib/mapConstants";
import { getMarkerZIndex, type MapCluster } from "@/lib/mapMarkers";
import type { MapRiskZone } from "@/types";

/** Fill opacity for impact zones (15–25% per spec). */
export const IMPACT_FILL_OPACITY: Record<RiskLevel, number> = {
  Critical: 0.24,
  High: 0.21,
  Medium: 0.18,
  Low: 0.15,
};

export const IMPACT_GLOW_OPACITY: Record<RiskLevel, number> = {
  Critical: 0.1,
  High: 0.09,
  Medium: 0.08,
  Low: 0.07,
};

export function getDominantZone(zones: MapRiskZone[]): MapRiskZone {
  return zones.reduce((best, zone) =>
    getMarkerZIndex(zone) > getMarkerZIndex(best) ? zone : best
  );
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export function computeClusterSpreadKm(cluster: MapCluster): number {
  let maxDist = 0;
  for (const zone of cluster.zones) {
    const d = haversineKm(cluster.lat, cluster.lng, zone.latitude, zone.longitude);
    if (d > maxDist) maxDist = d;
  }
  return maxDist;
}

export function computeClusterRadiusMeters(
  cluster: MapCluster,
  _zoom: number
): number {
  const dominant = getDominantZone(cluster.zones);
  const maxMember = Math.max(...cluster.zones.map((z) => z.radiusMeters));
  const spreadMeters = computeClusterSpreadKm(cluster) * 1000;
  const countBoost = 1 + (cluster.zones.length - 1) * 0.18;
  const merged = Math.max(
    maxMember * countBoost,
    spreadMeters * 1.45,
    dominant.radiusMeters * 1.25 * countBoost
  );
  return Math.round(merged);
}

export function buildCenterIconHtml(
  zone: MapRiskZone,
  options?: {
    count?: number;
    pulse?: boolean;
    iconSize?: number;
    svgSize?: number;
    detected?: boolean;
  }
): string {
  const iconSize = options?.iconSize ?? 48;
  const svgSize = options?.svgSize ?? Math.round(iconSize * 0.46);
  const badgeSize = Math.max(18, Math.round(iconSize * 0.38));
  const badgeFont = Math.max(9, Math.round(iconSize * 0.18));
  const riskClass = getCrisisMarkerRiskClass(zone.riskLevel);
  const verifyBorder = getVerificationBorderClass(zone.verificationStatus);
  const stackClass = getMarkerStackClass(zone.riskLevel);
  const pulseClass =
    options?.pulse ||
    zone.riskLevel === "Critical" ||
    zone.riskLevel === "High"
      ? zone.riskLevel === "Critical"
        ? "gis-icon-hub--pulse"
        : "gis-icon-hub--active"
      : "";
  const detectedClass = options?.detected ? "gis-marker-stack--detected" : "";
  const hubColor = getCrisisTypeHubBackground(zone.crisisIconKey);
  const svg = buildCrisisIconSvgMarkup(zone.crisisIconKey, {
    size: svgSize,
    className: "gis-icon-hub__svg",
  });
  const badge =
    options?.count && options.count > 1
      ? `<span class="gis-count-badge" style="min-width:${badgeSize}px;height:${badgeSize}px;font-size:${badgeFont}px;line-height:${badgeSize - 4}px">${options.count}</span>`
      : "";

  return `
    <div class="gis-marker-stack ${stackClass} ${detectedClass}">
      <span class="gis-marker-ripple"></span>
      <span class="gis-marker-ripple gis-marker-ripple--delayed"></span>
      <div class="gis-icon-hub gis-icon-hub--crisis-type ${riskClass} ${verifyBorder} ${pulseClass}" style="width:${iconSize}px;height:${iconSize}px;background:${hubColor}">
        ${svg}
        ${badge}
      </div>
    </div>
  `;
}

function getMarkerStackClass(level: MapRiskZone["riskLevel"]): string {
  switch (level) {
    case "Critical":
      return "gis-marker-stack--critical";
    case "High":
      return "gis-marker-stack--high";
    case "Medium":
      return "gis-marker-stack--medium";
    default:
      return "gis-marker-stack--low";
  }
}

export function buildClusterTooltip(cluster: MapCluster): string {
  const dominant = getDominantZone(cluster.zones);
  const types = [
    ...new Set(
      cluster.zones
        .map((z) => z.crisisType)
        .filter((t): t is string => Boolean(t))
    ),
  ];
  return `<div class="crisis-tooltip-rich">
    <strong>${cluster.zones.length} incidents in affected area</strong>
    <div class="crisis-tooltip-row"><span>Dominant</span> ${dominant.crisisType ?? "Mixed"}</div>
    <div class="crisis-tooltip-row"><span>Risk</span> ${dominant.riskLevel}</div>
    ${types.length > 0 ? `<div class="crisis-tooltip-row"><span>Types</span> ${types.slice(0, 4).join(", ")}</div>` : ""}
    <div class="crisis-tooltip-row">Click to expand · Scroll to zoom in</div>
  </div>`;
}

export function riskColor(level: RiskLevel): string {
  return RISK_ZONE_COLORS[level];
}

export function crisisZoneColor(crisisType: string | null | undefined): string {
  return getCrisisTypeColor(crisisType);
}

export function iconKeyForCluster(cluster: MapCluster): CrisisIconKey {
  return getDominantZone(cluster.zones).crisisIconKey;
}
