import type { RiskLevel } from "@prisma/client";
import {
  buildCrisisIconSvgMarkup,
  CRISIS_ICON_LABELS,
  getCrisisIconKey,
  type CrisisIconKey,
} from "@/lib/crisisIcons";
import { getCrisisTypeColor } from "@/lib/crisisTypeColors";
import { formatCountryWithFlag } from "@/lib/countryFlags";
import { formatIncidentLocation, LOCATION_LABELS } from "@/lib/locationDisplay";
import type { EvidenceVerificationStatus } from "@/lib/evidenceVerificationStatus";
import { normalizeLegacyVerificationStatus } from "@/lib/evidenceVerificationStatus";
import type { MapRiskZone } from "@/types";

export type CoordinatePrecision = "exact" | "approximate" | "country_centroid" | "unknown";
export type MapVerificationStatus = EvidenceVerificationStatus;

export const RISK_PRIORITY_WEIGHT: Record<RiskLevel, number> = {
  Critical: 400,
  High: 300,
  Medium: 200,
  Low: 100,
};

export const VERIFICATION_BADGE: Record<
  MapVerificationStatus,
  { symbol: string; label: string; className: string }
> = {
  Verified: { symbol: "✓", label: "Verified", className: "crisis-verify--verified" },
  "Partially Corroborated": {
    symbol: "◐",
    label: "Partially corroborated",
    className: "crisis-verify--partial",
  },
  "Single Source": {
    symbol: "○",
    label: "Single source",
    className: "crisis-verify--pending",
  },
  "Insufficient Evidence": {
    symbol: "…",
    label: "Insufficient evidence",
    className: "crisis-verify--pending",
  },
  "Conflicting Sources": {
    symbol: "!",
    label: "Conflicting sources",
    className: "crisis-verify--conflict",
  },
};

export function resolveVerificationBadge(status: string | undefined) {
  const normalized = normalizeLegacyVerificationStatus(status);
  return VERIFICATION_BADGE[normalized];
}

export const PRECISION_STYLES: Record<CoordinatePrecision, string> = {
  exact: "crisis-marker--exact",
  approximate: "crisis-marker--approximate",
  country_centroid: "crisis-marker--centroid",
  unknown: "crisis-marker--unknown",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayCountry(zone: MapRiskZone): string {
  const c = zone.countryName?.trim();
  if (!c || isUnverifiedLocationLabel(c)) return "—";
  return c;
}

function displayCity(zone: MapRiskZone): string {
  const c = zone.cityName?.trim();
  if (!c || isUnverifiedLocationLabel(c)) return "—";
  return c;
}

export function getMarkerZIndex(zone: MapRiskZone): number {
  const priority = RISK_PRIORITY_WEIGHT[zone.riskLevel];
  const verifiedBonus = zone.locationVerified ? 50 : 0;
  return priority + verifiedBonus;
}

export function buildHoverSummary(zone: MapRiskZone): string {
  const title = zone.reportTitle ?? zone.crisisType ?? "Humanitarian incident";
  const location =
    formatIncidentLocation(zone.cityName, zone.countryName) ??
    LOCATION_LABELS.AWAITING;
  const reliability =
    zone.reliabilityScore !== null
      ? `${Math.round(zone.reliabilityScore * 100)}%`
      : "N/A";
  const sources =
    zone.sourceNames.length > 0
      ? zone.sourceNames.slice(0, 3).join(", ")
      : zone.primarySource ?? "N/A";
  const verify = resolveVerificationBadge(zone.verificationStatus).label;

  return `<div class="crisis-tooltip-rich">
    <strong>${escapeHtml(title)}</strong>
    <div class="crisis-tooltip-row"><span>Type</span> ${escapeHtml(zone.crisisType ?? "Unclassified")}</div>
    <div class="crisis-tooltip-row"><span>Country</span> ${escapeHtml(displayCountry(zone))}</div>
    <div class="crisis-tooltip-row"><span>City</span> ${escapeHtml(displayCity(zone))}</div>
    <div class="crisis-tooltip-row"><span>Location</span> ${escapeHtml(location)}</div>
    <div class="crisis-tooltip-row"><span>Priority</span> ${zone.priorityLevel ?? "N/A"} · <span>Risk</span> ${zone.riskLevel}</div>
    <div class="crisis-tooltip-row"><span>Reliability</span> ${reliability}</div>
    <div class="crisis-tooltip-row"><span>Verification</span> ${verify}</div>
    <div class="crisis-tooltip-row"><span>Sources</span> ${escapeHtml(sources)}</div>
  </div>`;
}

export function buildPopupContent(
  zone: MapRiskZone,
  buildIconMarkup: (key: CrisisIconKey) => string
): string {
  const title = zone.reportTitle ?? zone.displayLocation;
  const country = displayCountry(zone);
  const city = displayCity(zone);
  const reliability =
    zone.reliabilityScore !== null
      ? `${Math.round(zone.reliabilityScore * 100)}%`
      : "N/A";
  const population =
    zone.affectedPopulation !== null
      ? zone.affectedPopulation.toLocaleString()
      : "Not reported";
  const needs =
    zone.humanitarianNeeds.length > 0
      ? zone.humanitarianNeeds
          .map((n) => `<li>${escapeHtml(n.needType)} (${escapeHtml(n.severity)})</li>`)
          .join("")
      : "<li>No humanitarian needs identified from available evidence</li>";
  const sources =
    zone.sourceNames.length > 0
      ? zone.sourceNames
          .map((s) => `<span class="crisis-popup-source">${escapeHtml(s)}</span>`)
          .join("")
      : escapeHtml(zone.primarySource ?? "Primary source");

  const reportLink = zone.reportId
    ? `<a href="/incidents/${zone.reportId}" class="crisis-popup-link">Open Full Analysis →</a>`
    : "";

  const verify = resolveVerificationBadge(zone.verificationStatus);
  const correlationStatus = zone.correlationVerificationStatus;
  const iconMarkup = buildIconMarkup(zone.crisisIconKey);
  const crisisColor = getCrisisTypeColor(zone.crisisType);

  const sourceCount =
    zone.independentSourceCount ??
    (zone.sourceNames.length > 0 ? zone.sourceNames.length : zone.primarySource ? 1 : 0);
  const lastUpdated = zone.reportDate
    ? new Date(zone.reportDate).toLocaleString()
    : "N/A";

  return `
    <div class="crisis-popup gis-incident-popup-inner">
      <div class="crisis-popup-header">
        <span class="crisis-popup-icon crisis-popup-icon--svg" style="background:${crisisColor}">${iconMarkup}</span>
        <div>
          <strong class="crisis-popup-title">${escapeHtml(title)}</strong>
          <div class="crisis-popup-subtitle">${escapeHtml(zone.crisisType ?? "Unclassified")}</div>
          <span class="crisis-verify-badge ${verify.className}">${verify.symbol} ${verify.label}</span>
          ${
            correlationStatus
              ? `<span class="crisis-verify-badge crisis-verify-badge--correlation">${escapeHtml(correlationStatus)}</span>`
              : ""
          }
        </div>
      </div>
      <div class="crisis-popup-grid">
        <div><span>Country</span><strong>${escapeHtml(formatCountryWithFlag(country))}</strong></div>
        <div><span>City</span><strong>${escapeHtml(city)}</strong></div>
        <div><span>Coordinates</span><strong>${zone.latitude.toFixed(4)}, ${zone.longitude.toFixed(4)}</strong></div>
        <div><span>Crisis Type</span><strong>${escapeHtml(zone.crisisType ?? "Unclassified")}</strong></div>
        <div><span>Risk Level</span><strong>${zone.riskLevel}</strong></div>
        <div><span>Dynamic Priority</span><strong>${zone.dynamicPriorityLevel ?? zone.priorityLevel ?? "N/A"}</strong></div>
        <div><span>Reliability Score</span><strong>${reliability}</strong></div>
        <div><span>Verification</span><strong>${verify.label}</strong></div>
        ${
          correlationStatus
            ? `<div><span>Correlation Status</span><strong>${escapeHtml(correlationStatus)}</strong></div>`
            : ""
        }
        ${
          zone.supportingReportCount && zone.supportingReportCount > 1
            ? `<div><span>Linked Reports</span><strong>${zone.supportingReportCount}</strong></div>`
            : ""
        }
        ${
          zone.sourceAgreementPercent !== undefined && zone.sourceAgreementPercent > 0
            ? `<div><span>Source Agreement</span><strong>${Math.round(zone.sourceAgreementPercent)}%</strong></div>`
            : ""
        }
        <div><span>Affected Population</span><strong>${population}</strong></div>
        <div><span>Report Date</span><strong>${zone.reportDate ? new Date(zone.reportDate).toLocaleDateString() : "N/A"}</strong></div>
        <div><span>Last Updated</span><strong>${escapeHtml(lastUpdated)}</strong></div>
        <div><span>Number of Sources</span><strong>${sourceCount}</strong></div>
        <div><span>Trend</span><strong>${zone.trend}</strong></div>
      </div>
      <div class="crisis-popup-section">
        <strong>Humanitarian Needs</strong>
        <ul>${needs}</ul>
      </div>
      <div class="crisis-popup-section">
        <strong>Sources</strong>
        <div class="crisis-popup-sources">${sources}</div>
      </div>
      ${reportLink ? `<div class="crisis-popup-action">${reportLink}</div>` : ""}
    </div>
  `;
}

function isUnverifiedLocationLabel(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return (
    !value.trim() ||
    lower === "unknown" ||
    lower === "unknown region" ||
    lower === "unknown country" ||
    lower === "location not verified" ||
    lower.includes("awaiting geolocation")
  );
}

export function buildUnverifiedHover(zone: MapRiskZone): string {
  const pct =
    zone.locationConfidence !== null ? `${zone.locationConfidence}%` : "N/A";
  const title = zone.reportTitle ?? zone.crisisType ?? "Humanitarian incident";
  const country = displayCountry(zone);
  const city = displayCity(zone);

  return `<div class="crisis-tooltip-rich">
    <strong>${escapeHtml(title)}</strong>
    <div class="crisis-tooltip-row"><span>Type</span> ${escapeHtml(zone.crisisType ?? "Unclassified")}</div>
    <div class="crisis-tooltip-row"><span>Country</span> ${escapeHtml(country)}</div>
    <div class="crisis-tooltip-row"><span>City</span> ${escapeHtml(city)}</div>
    <div class="crisis-tooltip-row"><span>Status</span> ${LOCATION_LABELS.AWAITING}</div>
    <div class="crisis-tooltip-row"><span>Confidence</span> ${pct}</div>
  </div>`;
}

export interface MapCluster {
  lat: number;
  lng: number;
  zones: MapRiskZone[];
}

export function clusterDistanceForZoom(zoom: number): number {
  if (zoom <= 2) return 700;
  if (zoom <= 3) return 480;
  if (zoom <= 4) return 320;
  if (zoom <= 5) return 200;
  if (zoom <= 6) return 130;
  if (zoom <= 8) return 75;
  return 40;
}

export function clusterZones(
  zones: MapRiskZone[],
  zoom?: number
): MapCluster[] {
  const distanceKm = zoom !== undefined ? clusterDistanceForZoom(zoom) : 120;
  const clusters: MapCluster[] = [];

  for (const zone of zones) {
    let matched = false;
    for (const cluster of clusters) {
      const dLat = (zone.latitude - cluster.lat) * 111;
      const dLng =
        (zone.longitude - cluster.lng) *
        111 *
        Math.cos((cluster.lat * Math.PI) / 180);
      if (Math.sqrt(dLat * dLat + dLng * dLng) < distanceKm) {
        cluster.zones.push(zone);
        cluster.lat =
          cluster.zones.reduce((s, z) => s + z.latitude, 0) / cluster.zones.length;
        cluster.lng =
          cluster.zones.reduce((s, z) => s + z.longitude, 0) / cluster.zones.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ lat: zone.latitude, lng: zone.longitude, zones: [zone] });
    }
  }

  return clusters;
}

export function sortZonesByPriority(zones: MapRiskZone[]): MapRiskZone[] {
  return [...zones].sort((a, b) => getMarkerZIndex(a) - getMarkerZIndex(b));
}

export { buildCrisisIconSvgMarkup, getCrisisIconKey, CRISIS_ICON_LABELS };
