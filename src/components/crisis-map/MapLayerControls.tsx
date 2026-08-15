"use client";

export interface MapLayerState {
  showHeatmap: boolean;
  showClusters: boolean;
  showBoundaries: boolean;
  showRiskZones: boolean;
  showImpactRadius: boolean;
  showLabels: boolean;
}

export const DEFAULT_MAP_LAYERS: MapLayerState = {
  showHeatmap: true,
  showClusters: true,
  showBoundaries: false,
  showRiskZones: true,
  showImpactRadius: true,
  showLabels: true,
};

interface MapLayerControlsProps {
  layers: MapLayerState;
  onChange: (layers: MapLayerState) => void;
}

const LAYER_OPTIONS: { key: keyof MapLayerState; label: string }[] = [
  { key: "showRiskZones", label: "Risk Heat Zones" },
  { key: "showClusters", label: "Incident Clusters" },
  { key: "showBoundaries", label: "Country Boundaries" },
];

export function MapLayerControls({ layers, onChange }: MapLayerControlsProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4 backdrop-blur">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Map Layers
      </p>
      <div className="space-y-2">
        {LAYER_OPTIONS.map(({ key, label }) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2 text-sm text-slate-300"
          >
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={(e) =>
                onChange({ ...layers, [key]: e.target.checked })
              }
              className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
