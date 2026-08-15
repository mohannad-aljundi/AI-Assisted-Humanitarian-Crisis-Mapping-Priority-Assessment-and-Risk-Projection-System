"use client";

import { memo, useState } from "react";
import type { RiskLevel } from "@prisma/client";
import type { MapLayerState } from "@/components/crisis-map/MapLayerControls";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { selectDark } from "@/lib/uiClasses";
import { getCrisisTypeColor } from "@/lib/crisisTypeColors";
import type { MapRiskZone } from "@/types";
import { normalizeLegacyVerificationStatus } from "@/lib/evidenceVerificationStatus";

const RISK_LEVELS: RiskLevel[] = ["Critical", "High", "Medium", "Low"];

const VERIFICATION_OPTIONS = [
  "all",
  "Verified",
  "Partially Corroborated",
  "Single Source",
  "Insufficient Evidence",
  "Conflicting Sources",
] as const;

export interface MapFilterState {
  searchQuery: string;
  riskLevels: RiskLevel[];
  crisisType: string;
  reliabilityMin: number;
  source: string;
  country: string;
  selectedCountries: string[];
  countrySearch: string;
  verificationStatus: string;
  dateFrom: string;
  dateTo: string;
}

interface MapFiltersProps {
  draft: MapFilterState;
  crisisTypes: string[];
  sources: string[];
  countries: string[];
  layers?: MapLayerState;
  onLayersChange?: (layers: MapLayerState) => void;
  onDraftChange: (filters: MapFilterState) => void;
  onApply: () => void;
  onReset: () => void;
  variant?: "floating" | "sidebar";
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/5 pb-3 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 transition hover:text-slate-200"
      >
        {title}
        <span className="text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

function LayerToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-blue-500" : "bg-slate-600"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
            checked ? "left-4" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export const MapFilters = memo(function MapFilters({
  draft,
  crisisTypes,
  sources,
  countries,
  layers,
  onLayersChange,
  onDraftChange,
  onApply,
  onReset,
  variant = "floating",
  collapsed,
  onToggleCollapse,
}: MapFiltersProps) {
  function update<K extends keyof MapFilterState>(key: K, value: MapFilterState[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  const filteredCountries = countries.filter((c) =>
    c.toLowerCase().includes(draft.countrySearch.toLowerCase())
  );

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="glass-panel map-control-btn fixed right-4 top-24 z-[1000] px-4 py-2 lg:hidden"
      >
        Filters
      </button>
    );
  }

  return (
    <div
      className={
        variant === "sidebar"
          ? "flex min-h-0 flex-1 flex-col overflow-hidden"
          : "glass-panel pointer-events-auto flex max-h-[calc(100vh-12rem)] w-full flex-col overflow-hidden lg:max-h-none lg:w-72"
      }
    >
      {variant === "floating" && (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Intelligence Filters</p>
            <p className="text-[10px] text-slate-500">Refine situational picture</p>
          </div>
          {onToggleCollapse && (
            <button type="button" onClick={onToggleCollapse} className="map-control-btn lg:hidden">
              ×
            </button>
          )}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <CollapsibleSection title="Search">
          <input
            type="search"
            placeholder="Search incidents, locations, types…"
            value={draft.searchQuery}
            onChange={(e) => update("searchQuery", e.target.value)}
            className={selectDark}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Risk Level">
          {RISK_LEVELS.map((level) => (
            <label
              key={level}
              className="filter-chip flex cursor-pointer items-center gap-2"
            >
              <input
                type="checkbox"
                checked={draft.riskLevels.includes(level)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...draft.riskLevels, level]
                    : draft.riskLevels.filter((l) => l !== level);
                  update("riskLevels", next);
                }}
                className="rounded border-white/20 bg-slate-900 text-blue-500"
              />
              {level}
            </label>
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Incident Type">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => update("crisisType", "all")}
              className={`source-badge ${draft.crisisType === "all" ? "source-badge--active" : ""}`}
            >
              All types
            </button>
            {crisisTypes.map((type) => {
              const color = getCrisisTypeColor(type);
              const active = draft.crisisType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => update("crisisType", type)}
                  className={`source-badge inline-flex items-center gap-1.5 ${
                    active ? "source-badge--active" : ""
                  }`}
                  style={
                    active
                      ? {
                          borderColor: `${color}66`,
                          backgroundColor: `${color}22`,
                          color,
                        }
                      : undefined
                  }
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  {type}
                </button>
              );
            })}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Reliability">
          <input
            type="range"
            min={0}
            max={100}
            value={draft.reliabilityMin}
            onChange={(e) => update("reliabilityMin", Number(e.target.value))}
            className="premium-slider w-full"
          />
          <p className="text-center text-xs text-slate-400">Min {draft.reliabilityMin}%</p>
        </CollapsibleSection>

        <CollapsibleSection title="Sources">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => update("source", "all")}
              className={`source-badge ${draft.source === "all" ? "source-badge--active" : ""}`}
            >
              All
            </button>
            {sources.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => update("source", s)}
                className={`source-badge ${draft.source === s ? "source-badge--active" : ""}`}
              >
                {s}
              </button>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Countries">
          <input
            type="search"
            placeholder="Search country…"
            value={draft.countrySearch}
            onChange={(e) => update("countrySearch", e.target.value)}
            className={`${selectDark} mb-2`}
          />
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {filteredCountries.map((c) => (
              <label key={c} className="filter-chip flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.selectedCountries.includes(c)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...draft.selectedCountries, c]
                      : draft.selectedCountries.filter((x) => x !== c);
                    update("selectedCountries", next);
                  }}
                  className="rounded border-white/20 bg-slate-900 text-blue-500"
                />
                <span className="truncate">
                  <CountryFlag country={c} className="mr-1.5 text-sm" />
                  {c}
                </span>
              </label>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Verification" defaultOpen={false}>
          <select
            value={draft.verificationStatus}
            onChange={(e) => update("verificationStatus", e.target.value)}
            className={selectDark}
          >
            {VERIFICATION_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v === "all" ? "All statuses" : v}
              </option>
            ))}
          </select>
        </CollapsibleSection>

        <CollapsibleSection title="Date Range" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(e) => update("dateFrom", e.target.value)}
              className={selectDark}
            />
            <input
              type="date"
              value={draft.dateTo}
              onChange={(e) => update("dateTo", e.target.value)}
              className={selectDark}
            />
          </div>
        </CollapsibleSection>

        {layers && onLayersChange && (
          <CollapsibleSection title="Map Layers">
            <div className="space-y-2">
              <LayerToggle
                label="Heatmap"
                checked={layers.showHeatmap}
                onChange={(v) => onLayersChange({ ...layers, showHeatmap: v })}
              />
              <LayerToggle
                label="Clusters"
                checked={layers.showClusters}
                onChange={(v) => onLayersChange({ ...layers, showClusters: v })}
              />
              <LayerToggle
                label="Impact Radius"
                checked={layers.showImpactRadius}
                onChange={(v) => onLayersChange({ ...layers, showImpactRadius: v })}
              />
              <LayerToggle
                label="Labels"
                checked={layers.showLabels}
                onChange={(v) => onLayersChange({ ...layers, showLabels: v })}
              />
            </div>
          </CollapsibleSection>
        )}
      </div>

      <div className="flex gap-2 border-t border-white/10 p-4">
        <button type="button" onClick={onReset} className="map-control-btn flex-1">
          Reset
        </button>
        <button
          type="button"
          onClick={onApply}
          className="map-control-btn map-control-btn--primary flex-1"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
});

export function applyMapFilters(zones: MapRiskZone[], filters: MapFilterState): MapRiskZone[] {
  const query = filters.searchQuery.trim().toLowerCase();

  return zones.filter((zone) => {
    if (query) {
      const haystack = [
        zone.reportTitle,
        zone.crisisType,
        zone.countryName,
        zone.cityName,
        zone.displayLocation,
        ...zone.sourceNames,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (!filters.riskLevels.includes(zone.riskLevel)) return false;
    if (filters.crisisType !== "all" && zone.crisisType !== filters.crisisType) return false;
    if (
      zone.reliabilityScore !== null &&
      zone.reliabilityScore * 100 < filters.reliabilityMin
    )
      return false;
    if (filters.reliabilityMin > 0 && zone.reliabilityScore === null) return false;
    if (filters.source !== "all" && !zone.sourceNames.includes(filters.source)) return false;
    if (filters.selectedCountries.length > 0) {
      if (!filters.selectedCountries.includes(zone.countryName)) return false;
    } else if (filters.country !== "all" && zone.countryName !== filters.country) {
      return false;
    }
    if (
      filters.verificationStatus !== "all" &&
      normalizeLegacyVerificationStatus(zone.verificationStatus) !==
        filters.verificationStatus
    )
      return false;
    if (filters.dateFrom && zone.reportDate) {
      if (new Date(zone.reportDate) < new Date(filters.dateFrom)) return false;
    }
    if (filters.dateTo && zone.reportDate) {
      if (new Date(zone.reportDate) > new Date(filters.dateTo)) return false;
    }
    return true;
  });
}

export function deriveFilterOptions(zones: MapRiskZone[]) {
  const sources = [...new Set(zones.flatMap((z) => z.sourceNames))].sort();
  const countries = [
    ...new Set(zones.map((z) => z.countryName).filter((c) => c && c !== "—")),
  ].sort();
  return { sources, countries };
}

export const DEFAULT_MAP_FILTERS: MapFilterState = {
  searchQuery: "",
  riskLevels: ["Critical", "High", "Medium", "Low"],
  crisisType: "all",
  reliabilityMin: 0,
  source: "all",
  country: "all",
  selectedCountries: [],
  countrySearch: "",
  verificationStatus: "all",
  dateFrom: "",
  dateTo: "",
};
