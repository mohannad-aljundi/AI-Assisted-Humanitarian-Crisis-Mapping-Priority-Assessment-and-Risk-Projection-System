import {
  CRISIS_TAXONOMY,
  CRISIS_TYPE_ALIASES,
  type CrisisTaxonomy,
} from "@/lib/intelligenceConstants";

/** Canonical crisis-type palette — single source of truth for the entire app. */
export const CRISIS_TYPE_COLORS: Record<string, string> = {
  Earthquake: "#F59E0B",
  Conflict: "#EF4444",
  "Food Insecurity": "#FBBF24",
  Disease: "#8B5CF6",
  Displacement: "#10B981",
  Flood: "#3B82F6",
  Drought: "#A16207",
  "Humanitarian Crisis": "#374151",
  Unknown: "#9CA3AF",
  // Extended taxonomy types (distinct from the primary palette above)
  Wildfire: "#EA580C",
  "Medical Emergency": "#C026D3",
  Storm: "#0EA5E9",
  Shelter: "#14B8A6",
  "Infrastructure Damage": "#6B7280",
};

/** Maps map/icon keys to canonical crisis labels for color lookup. */
export const CRISIS_ICON_KEY_COLORS: Record<string, string> = {
  conflict: CRISIS_TYPE_COLORS.Conflict,
  flood: CRISIS_TYPE_COLORS.Flood,
  earthquake: CRISIS_TYPE_COLORS.Earthquake,
  disease: CRISIS_TYPE_COLORS.Disease,
  displacement: CRISIS_TYPE_COLORS.Displacement,
  food: CRISIS_TYPE_COLORS["Food Insecurity"],
  medical: CRISIS_TYPE_COLORS["Medical Emergency"],
  wildfire: CRISIS_TYPE_COLORS.Wildfire,
  storm: CRISIS_TYPE_COLORS.Storm,
  drought: CRISIS_TYPE_COLORS.Drought,
  infrastructure: CRISIS_TYPE_COLORS["Infrastructure Damage"],
  explosion: CRISIS_TYPE_COLORS.Conflict,
  shelter: CRISIS_TYPE_COLORS.Shelter,
  water: CRISIS_TYPE_COLORS.Flood,
  pin: CRISIS_TYPE_COLORS.Unknown,
};

export function normalizeCrisisTypeLabel(
  crisisType: string | null | undefined
): string {
  const raw = crisisType?.trim();
  if (!raw) return "Unknown";

  const aliasKey = raw.toLowerCase();
  if (aliasKey === "humanitarian crisis" || aliasKey === "humanitarian aid") {
    return "Humanitarian Crisis";
  }
  if (CRISIS_TYPE_ALIASES[aliasKey]) {
    return CRISIS_TYPE_ALIASES[aliasKey];
  }

  const exact = CRISIS_TAXONOMY.find(
    (entry) => entry.toLowerCase() === aliasKey
  );
  if (exact) return exact;

  return raw;
}

export function getCrisisTypeColor(crisisType: string | null | undefined): string {
  const label = normalizeCrisisTypeLabel(crisisType);
  return CRISIS_TYPE_COLORS[label] ?? CRISIS_TYPE_COLORS.Unknown;
}

export function getCrisisIconKeyColor(iconKey: string): string {
  return CRISIS_ICON_KEY_COLORS[iconKey] ?? CRISIS_TYPE_COLORS.Unknown;
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getCrisisTypeBadgeStyles(crisisType: string | null | undefined): {
  color: string;
  backgroundColor: string;
  borderColor: string;
} {
  const color = getCrisisTypeColor(crisisType);
  return {
    color,
    backgroundColor: hexWithAlpha(color, 0.14),
    borderColor: hexWithAlpha(color, 0.38),
  };
}

export function getCrisisTypeHubBackground(iconKey: string): string {
  return getCrisisIconKeyColor(iconKey);
}

export const CANONICAL_CRISIS_TYPES = [
  ...CRISIS_TAXONOMY,
  "Humanitarian Crisis",
] as const satisfies readonly (CrisisTaxonomy | "Humanitarian Crisis")[];
