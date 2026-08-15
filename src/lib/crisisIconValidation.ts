import {
  CRISIS_ICON_REGISTRY,
  buildCrisisIconSvgMarkup,
  getCrisisIconKey,
  type CrisisIconKey,
} from "@/lib/crisisIcons";

export const TOP_BAR_SLOT_ORDER = [
  "syncStatus",
  "newIncidents",
  "utcTime",
  "systemStatus",
  "aiEngine",
  "dateRange",
  "syncNow",
  "addImport",
  "notifications",
] as const;

export interface ValidationIssue {
  code: string;
  message: string;
}

export function validateRegistryCompleteness(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const keys = Object.keys(CRISIS_ICON_REGISTRY) as CrisisIconKey[];

  for (const key of keys) {
    const entry = CRISIS_ICON_REGISTRY[key];
    if (!entry.label?.trim()) {
      issues.push({ code: "missing-label", message: `Registry key "${key}" has no label.` });
    }
    if (!entry.svgInner?.trim()) {
      issues.push({ code: "missing-svg", message: `Registry key "${key}" has no svgInner.` });
    }
    if (!entry.Icon) {
      issues.push({ code: "missing-icon", message: `Registry key "${key}" has no Icon component.` });
    }
  }

  return issues;
}

export function validateLegendMatchesMap(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const keys = Object.keys(CRISIS_ICON_REGISTRY) as CrisisIconKey[];

  for (const key of keys) {
    if (!CRISIS_ICON_REGISTRY[key]) {
      issues.push({
        code: "legend-unknown",
        message: `Legend key "${key}" is missing from CRISIS_ICON_REGISTRY.`,
      });
      continue;
    }

    const mapMarkup = buildCrisisIconSvgMarkup(key, { size: 24, className: "gis-icon-hub__svg" });
    const legendMarkup = buildCrisisIconSvgMarkup(key, { size: 24, className: "gis-icon-hub__svg" });

    if (mapMarkup !== legendMarkup) {
      issues.push({
        code: "legend-map-mismatch",
        message: `Legend SVG for "${key}" does not match map SVG markup.`,
      });
    }
  }

  return issues;
}

export function validateIncidentIconKeys(
  crisisTypes: Array<string | null | undefined>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const crisisType of crisisTypes) {
    const key = getCrisisIconKey(crisisType ?? null);
    if (!CRISIS_ICON_REGISTRY[key]) {
      issues.push({
        code: "incident-no-icon",
        message: `Crisis type "${crisisType ?? "unknown"}" resolved to missing icon key "${key}".`,
      });
    } else if (!CRISIS_ICON_REGISTRY[key].svgInner) {
      issues.push({
        code: "incident-empty-icon",
        message: `Crisis type "${crisisType ?? "unknown"}" has empty SVG for key "${key}".`,
      });
    }
  }

  return issues;
}

export function runCrisisIconValidations(
  crisisTypes: Array<string | null | undefined> = []
): ValidationIssue[] {
  return [
    ...validateRegistryCompleteness(),
    ...validateLegendMatchesMap(),
    ...validateIncidentIconKeys(crisisTypes),
  ];
}

export function assertCrisisIconValidations(
  crisisTypes: Array<string | null | undefined> = []
): void {
  const issues = runCrisisIconValidations(crisisTypes);
  if (issues.length > 0) {
    const detail = issues.map((issue) => `- [${issue.code}] ${issue.message}`).join("\n");
    throw new Error(`Crisis icon validation failed:\n${detail}`);
  }
}
