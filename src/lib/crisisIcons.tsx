import type { SVGProps } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Biohazard,
  Bomb,
  Building2,
  CloudLightning,
  Cross,
  Droplets,
  Flame,
  HelpCircle,
  Home,
  Sun,
  Swords,
  Users,
  Waves,
  Wheat,
} from "lucide-react";
import type { RiskLevel } from "@prisma/client";
import type { MapVerificationStatus } from "@/lib/mapMarkers";
import { normalizeLegacyVerificationStatus } from "@/lib/evidenceVerificationStatus";
import { getCrisisIconKeyColor, getCrisisTypeHubBackground } from "@/lib/crisisTypeColors";

export type CrisisIconKey =
  | "conflict"
  | "flood"
  | "earthquake"
  | "disease"
  | "displacement"
  | "food"
  | "medical"
  | "wildfire"
  | "storm"
  | "drought"
  | "infrastructure"
  | "explosion"
  | "shelter"
  | "water"
  | "pin";

/** Lucide-compatible inner paths for map marker HTML rendering. */
export const EARTHQUAKE_DAMAGE_ICON_INNER = `<path d="M2 20.5h1.8l1.4-1.4 1.8 1.8 1.8-2 1.8 2 1.8-1.8 1.4 1.4H22"/><path d="M3.5 20V12.5L6 10l2.5 2.5V20"/><path d="M5 14.5v3"/><path d="M10 20V8.5l2-2.5 2 2.5V20"/><path d="M11 7.5 13 9.5"/><path d="M16.5 20v-6l1.5-1.5 1.5 1.5v6"/>`;

export interface CrisisIconRegistryEntry {
  label: string;
  color: string;
  Icon: LucideIcon | typeof EarthquakeDamageIcon;
  svgInner: string;
}

const SVG_INNER: Record<CrisisIconKey, string> = {
  conflict: `<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="M3 3l7.07 7.07"/><path d="M10.5 13.5 21 3v3l-11.5 11.5"/>`,
  flood: `<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>`,
  earthquake: EARTHQUAKE_DAMAGE_ICON_INNER,
  disease: `<path d="M10 10H14"/><path d="M12 12v-2"/><path d="M12 18v-2"/><path d="M8 12H6"/><path d="M18 12h-2"/><path d="M12 6V4"/><path d="M12 20v-2"/><circle cx="12" cy="12" r="6"/>`,
  displacement: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  food: `<path d="M2 22 16 8"/><path d="M3 10c0 3 2 5 5 5s5-2 5-5-2-5-5-5-5 2-5 5Z"/><path d="M18 14c0 3 2 5 5 5"/><path d="m22 22-4-4"/>`,
  medical: `<path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h5v5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2z"/>`,
  wildfire: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.5-.5-2.5-1-4-1-2-.2-3.5 2-5 .5 2 1.8 3.5 3.5 4.8 1.5 1.2 2.5 2.7 2.5 4.7a5.5 5.5 0 1 1-11 0c0-1 .3-1.8.5-2Z"/><path d="M12 3c1 3 3 4.5 3 7a3 3 0 1 1-6 0c0-2.5 2-4 3-7Z"/>`,
  storm: `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="m13 15-2 3h3l-2 3"/>`,
  drought: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
  infrastructure: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>`,
  explosion: `<circle cx="12" cy="12" r="2"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>`,
  shelter: `<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>`,
  water: `<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>`,
  pin: `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`,
};

function registryEntry(
  key: CrisisIconKey,
  label: string,
  Icon: CrisisIconRegistryEntry["Icon"],
  svgInner: string
): CrisisIconRegistryEntry {
  return {
    label,
    color: getCrisisIconKeyColor(key),
    Icon,
    svgInner,
  };
}

/** Crisis type key → icon component → label → accent color (from crisisTypeColors). */
export const CRISIS_ICON_REGISTRY: Record<CrisisIconKey, CrisisIconRegistryEntry> = {
  conflict: registryEntry("conflict", "Conflict", Swords, SVG_INNER.conflict),
  flood: registryEntry("flood", "Flood", Waves, SVG_INNER.flood),
  earthquake: registryEntry(
    "earthquake",
    "Earthquake",
    EarthquakeDamageIcon,
    SVG_INNER.earthquake
  ),
  disease: registryEntry("disease", "Disease", Biohazard, SVG_INNER.disease),
  displacement: registryEntry("displacement", "Displacement", Users, SVG_INNER.displacement),
  food: registryEntry("food", "Food Insecurity", Wheat, SVG_INNER.food),
  medical: registryEntry("medical", "Medical Emergency", Cross, SVG_INNER.medical),
  wildfire: registryEntry("wildfire", "Wildfire", Flame, SVG_INNER.wildfire),
  storm: registryEntry("storm", "Storm", CloudLightning, SVG_INNER.storm),
  drought: registryEntry("drought", "Drought", Sun, SVG_INNER.drought),
  infrastructure: registryEntry(
    "infrastructure",
    "Infrastructure Damage",
    Building2,
    SVG_INNER.infrastructure
  ),
  explosion: registryEntry("explosion", "Explosion", Bomb, SVG_INNER.explosion),
  shelter: registryEntry("shelter", "Shelter", Home, SVG_INNER.shelter),
  water: registryEntry("water", "Water", Droplets, SVG_INNER.water),
  pin: registryEntry("pin", "Unknown", HelpCircle, SVG_INNER.pin),
};

export const CRISIS_ICON_LABELS: Record<CrisisIconKey, string> = Object.fromEntries(
  (Object.keys(CRISIS_ICON_REGISTRY) as CrisisIconKey[]).map((key) => [
    key,
    CRISIS_ICON_REGISTRY[key].label,
  ])
) as Record<CrisisIconKey, string>;

export function getLegendIconKeysFromZones(
  zones: Array<{ crisisIconKey: CrisisIconKey }>
): CrisisIconKey[] {
  const keys = new Set<CrisisIconKey>();
  for (const zone of zones) {
    keys.add(zone.crisisIconKey);
  }
  return Array.from(keys).sort((a, b) =>
    CRISIS_ICON_LABELS[a].localeCompare(CRISIS_ICON_LABELS[b])
  );
}

export const MIN_MAP_ICON_HUB_PX = 28;
export const MIN_MAP_ICON_SVG_PX = 16;

/** Fixed legend preview size — matches country-zoom map proportions. */
export const LEGEND_HUB_PX = 40;
export const LEGEND_SVG_PX = 22;

export interface EarthquakeDamageIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
}

export function EarthquakeDamageIcon({
  size = 24,
  strokeWidth = 2,
  className,
  ...props
}: EarthquakeDamageIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M2 20.5h1.8l1.4-1.4 1.8 1.8 1.8-2 1.8 2 1.8-1.8 1.4 1.4H22" />
      <path d="M3.5 20V12.5L6 10l2.5 2.5V20" />
      <path d="M5 14.5v3" />
      <path d="M10 20V8.5l2-2.5 2 2.5V20" />
      <path d="M11 7.5 13 9.5" />
      <path d="M16.5 20v-6l1.5-1.5 1.5 1.5v6" />
    </svg>
  );
}

export function getCrisisIconKey(crisisType: string | null): CrisisIconKey {
  const type = (crisisType ?? "").toLowerCase();

  if (type.includes("conflict") || type.includes("armed") || type.includes("war"))
    return "conflict";
  if (type.includes("flood")) return "flood";
  if (type.includes("earthquake") || type.includes("seismic")) return "earthquake";
  if (
    type.includes("disease") ||
    type.includes("outbreak") ||
    type.includes("cholera") ||
    type.includes("epidemic")
  )
    return "disease";
  if (type.includes("medical") || type.includes("health") || type.includes("hospital"))
    return "medical";
  if (type.includes("food") || type.includes("famine") || type.includes("hunger"))
    return "food";
  if (type.includes("displacement") || type.includes("displaced") || type.includes("refugee"))
    return "displacement";
  if (type.includes("fire") || type.includes("wildfire")) return "wildfire";
  if (type.includes("storm") || type.includes("hurricane") || type.includes("cyclone"))
    return "storm";
  if (type.includes("drought")) return "drought";
  if (type.includes("infrastructure") || type.includes("damage") || type.includes("destroyed"))
    return "infrastructure";
  if (type.includes("explosion") || type.includes("bomb") || type.includes("blast"))
    return "explosion";
  if (type.includes("shelter") || type.includes("housing")) return "shelter";
  if (type.includes("water") || type.includes("sanitation")) return "water";

  return "pin";
}

export function getCrisisIcon(crisisType: string | null): CrisisIconKey {
  return getCrisisIconKey(crisisType);
}

export function getCrisisMarkerRiskClass(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case "Critical":
      return "crisis-marker-icon--critical";
    case "High":
      return "crisis-marker-icon--high";
    case "Medium":
      return "crisis-marker-icon--medium";
    default:
      return "crisis-marker-icon--low";
  }
}

export function getCrisisBadgeRiskClass(riskLevel?: RiskLevel | null): string {
  if (!riskLevel) return "crisis-icon-badge--neutral";
  return getCrisisMarkerRiskClass(riskLevel).replace(
    "crisis-marker-icon",
    "crisis-icon-badge"
  );
}

export function getVerificationBorderClass(
  status?: MapVerificationStatus | string
): string {
  const normalized = normalizeLegacyVerificationStatus(status);
  if (normalized === "Verified" || normalized === "Partially Corroborated") {
    return "crisis-marker-icon--verified-border";
  }
  if (normalized === "Conflicting Sources") {
    return "crisis-marker-icon--conflict-border";
  }
  return "crisis-marker-icon--pending-border";
}

export function buildCrisisIconSvgMarkup(
  iconKey: CrisisIconKey,
  options?: { size?: number; className?: string }
): string {
  const size = options?.size ?? 20;
  const className = options?.className ?? "crisis-icon-svg";
  const inner = CRISIS_ICON_REGISTRY[iconKey]?.svgInner ?? CRISIS_ICON_REGISTRY.pin.svgInner;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true">${inner}</svg>`;
}

export function buildCrisisMarkerIconMarkup(
  iconKey: CrisisIconKey,
  riskLevel: RiskLevel,
  options?: {
    verificationStatus?: MapVerificationStatus | string;
    precisionClass?: string;
    unverified?: boolean;
  }
): string {
  const riskClass = getCrisisMarkerRiskClass(riskLevel);
  const verifyBorder = getVerificationBorderClass(options?.verificationStatus);
  const precision = options?.precisionClass ?? "";
  const unverified = options?.unverified ? "crisis-marker-pin--unverified" : "";
  const svg = buildCrisisIconSvgMarkup(iconKey, { size: 20, className: "crisis-marker-svg" });

  return `
    <div class="crisis-marker-pin ${precision} ${unverified}">
      <div class="crisis-marker-halo ${riskClass}"></div>
      <div class="crisis-marker-icon ${riskClass} ${verifyBorder}">
        ${svg}
      </div>
    </div>
  `;
}

interface CrisisRegistryIconProps {
  iconKey: CrisisIconKey;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** Renders the registry SVG — identical markup to map markers everywhere. */
export function CrisisRegistryIcon({
  iconKey,
  size = 20,
  className = "",
}: CrisisRegistryIconProps) {
  return (
    <span
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{
        __html: buildCrisisIconSvgMarkup(iconKey, {
          size,
          className: "crisis-icon-svg",
        }),
      }}
    />
  );
}

interface CrisisHubIconProps {
  iconKey: CrisisIconKey;
  riskLevel?: RiskLevel | null;
  verificationStatus?: MapVerificationStatus | string;
  hubSize?: number;
  svgSize?: number;
  pulse?: boolean;
  count?: number;
  className?: string;
}

/** Map-style hub icon — identical SVG markup to map markers (legend, popups). */
export function CrisisHubIcon({
  iconKey,
  riskLevel = "Medium",
  verificationStatus,
  hubSize = MIN_MAP_ICON_HUB_PX,
  svgSize = MIN_MAP_ICON_SVG_PX,
  pulse = false,
  count,
  className = "",
}: CrisisHubIconProps) {
  const level = riskLevel ?? "Medium";
  const riskClass = getCrisisMarkerRiskClass(level);
  const verifyBorder = getVerificationBorderClass(verificationStatus);
  const pulseClass = pulse || level === "Critical" ? "gis-icon-hub--pulse" : "";
  const innerSvgSize = Math.max(MIN_MAP_ICON_SVG_PX, svgSize);
  const hubColor = getCrisisTypeHubBackground(iconKey);

  return (
    <div
      className={`gis-icon-hub gis-icon-hub--crisis-type ${riskClass} ${verifyBorder} ${pulseClass} ${className}`}
      style={{
        width: hubSize,
        height: hubSize,
        color: "#ffffff",
        background: hubColor,
      }}
      aria-hidden
    >
      <span
        className="gis-icon-hub__svg"
        dangerouslySetInnerHTML={{
          __html: buildCrisisIconSvgMarkup(iconKey, {
            size: innerSvgSize,
            className: "gis-icon-hub__svg",
          }),
        }}
      />
      {count && count > 1 ? (
        <span className="gis-count-badge">{count}</span>
      ) : null}
    </div>
  );
}

/** @deprecated Use CrisisRegistryIcon */
export function getCrisisEmoji(_iconKey: CrisisIconKey): string {
  return "";
}

/** @deprecated Use CrisisRegistryIcon */
export const CRISIS_EMOJI: Record<CrisisIconKey, string> = Object.fromEntries(
  (Object.keys(CRISIS_ICON_LABELS) as CrisisIconKey[]).map((k) => [k, ""])
) as Record<CrisisIconKey, string>;
