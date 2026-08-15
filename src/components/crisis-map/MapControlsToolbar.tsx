"use client";

import { memo } from "react";
import type { MapLayerState } from "@/components/crisis-map/MapLayerControls";
import type { MapStyleId } from "@/lib/mapConstants";

interface MapControlsToolbarProps {
  mapStyle: MapStyleId;
  onMapStyleChange: (style: MapStyleId) => void;
  layers: MapLayerState;
  onLayersChange: (layers: MapLayerState) => void;
  onLocateMe: () => void;
  onFitIncidents: () => void;
  onReset: () => void;
  onExport: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  variant?: "floating" | "sidebar";
}

const STYLES: { id: MapStyleId; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "satellite", label: "Satellite" },
  { id: "light", label: "Light" },
];

export const MapControlsToolbar = memo(function MapControlsToolbar({
  mapStyle,
  onMapStyleChange,
  layers,
  onLayersChange,
  onLocateMe,
  onFitIncidents,
  onReset,
  onExport,
  onToggleFullscreen,
  isFullscreen,
  variant = "floating",
}: MapControlsToolbarProps) {
  function toggleLayer(key: keyof MapLayerState) {
    onLayersChange({ ...layers, [key]: !layers[key] });
  }

  const body = (
    <>
      <div className="map-side-panel__section">
        <p className="map-side-panel__section-title">Map Basemap</p>
        <div className="flex flex-wrap gap-1">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onMapStyleChange(s.id)}
              className={`map-control-btn ${mapStyle === s.id ? "map-control-btn--active" : ""}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="map-side-panel__section">
        <p className="map-side-panel__section-title">Navigation</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolbarBtn label="Locate Me" onClick={onLocateMe} />
          <ToolbarBtn label="Fit Incidents" onClick={onFitIncidents} />
          <ToolbarBtn label="Reset View" onClick={onReset} />
          <ToolbarBtn label="Export" onClick={onExport} />
          <ToolbarBtn
            label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            onClick={onToggleFullscreen}
            className="col-span-2"
          />
        </div>
      </div>

      <div className="map-side-panel__section">
        <p className="map-side-panel__section-title">Display Layers</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolbarBtn
            label="Impact Radius"
            active={layers.showImpactRadius}
            onClick={() => toggleLayer("showImpactRadius")}
          />
          <ToolbarBtn
            label="Clusters"
            active={layers.showClusters}
            onClick={() => toggleLayer("showClusters")}
          />
          <ToolbarBtn
            label="Heatmap"
            active={layers.showHeatmap}
            onClick={() => toggleLayer("showHeatmap")}
          />
          <ToolbarBtn
            label="Labels"
            active={layers.showLabels}
            onClick={() => toggleLayer("showLabels")}
          />
        </div>
      </div>
    </>
  );

  if (variant === "sidebar") {
    return <div className="border-t border-white/[0.06] pt-2">{body}</div>;
  }

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-[1000] flex flex-col gap-2">
      {body}
    </div>
  );
});

function ToolbarBtn({
  label,
  onClick,
  active,
  className = "",
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`map-control-btn w-full text-left ${active ? "map-control-btn--active" : ""} ${className}`}
    >
      {label}
    </button>
  );
}
