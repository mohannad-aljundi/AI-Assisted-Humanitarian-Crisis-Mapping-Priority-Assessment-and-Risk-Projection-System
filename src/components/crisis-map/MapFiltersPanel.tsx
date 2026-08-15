"use client";

import { memo } from "react";
import { MapFilters, type MapFilterState } from "@/components/crisis-map/MapFilters";
import { MapControlsToolbar } from "@/components/crisis-map/MapControlsToolbar";
import type { MapLayerState } from "@/components/crisis-map/MapLayerControls";
import type { MapStyleId } from "@/lib/mapConstants";

interface MapFiltersPanelProps {
  draft: MapFilterState;
  crisisTypes: string[];
  sources: string[];
  countries: string[];
  layers: MapLayerState;
  mapStyle: MapStyleId;
  isFullscreen: boolean;
  onDraftChange: (filters: MapFilterState) => void;
  onApply: () => void;
  onReset: () => void;
  onLayersChange: (layers: MapLayerState) => void;
  onMapStyleChange: (style: MapStyleId) => void;
  onLocateMe: () => void;
  onFitIncidents: () => void;
  onResetView: () => void;
  onExport: () => void;
  onToggleFullscreen: () => void;
}

export const MapFiltersPanel = memo(function MapFiltersPanel({
  draft,
  crisisTypes,
  sources,
  countries,
  layers,
  mapStyle,
  isFullscreen,
  onDraftChange,
  onApply,
  onReset,
  onLayersChange,
  onMapStyleChange,
  onLocateMe,
  onFitIncidents,
  onResetView,
  onExport,
  onToggleFullscreen,
}: MapFiltersPanelProps) {
  return (
    <>
      <MapFilters
        variant="sidebar"
        draft={draft}
        crisisTypes={crisisTypes}
        sources={sources}
        countries={countries}
        layers={layers}
        onLayersChange={onLayersChange}
        onDraftChange={onDraftChange}
        onApply={onApply}
        onReset={onReset}
      />
      <div className="border-t border-white/[0.06] px-3 pb-3">
        <MapControlsToolbar
          variant="sidebar"
          mapStyle={mapStyle}
          onMapStyleChange={onMapStyleChange}
          layers={layers}
          onLayersChange={onLayersChange}
          onLocateMe={onLocateMe}
          onFitIncidents={onFitIncidents}
          onReset={onResetView}
          onExport={onExport}
          onToggleFullscreen={onToggleFullscreen}
          isFullscreen={isFullscreen}
        />
      </div>
    </>
  );
});
