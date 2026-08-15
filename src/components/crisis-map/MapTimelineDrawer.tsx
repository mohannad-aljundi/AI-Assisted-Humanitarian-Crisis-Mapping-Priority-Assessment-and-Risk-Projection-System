"use client";

import { memo } from "react";
import type { MapRiskZone } from "@/types";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { formatIncidentLocation } from "@/lib/locationDisplay";
import { getCrisisTypeColor } from "@/lib/crisisTypeColors";
import { ChevronUp } from "lucide-react";
import { iconProps } from "@/components/ui/AppIcon";
import { MapTimelineControls } from "@/components/crisis-map/MapTimelineControls";

interface MapTimelineDrawerProps {
  hasTimeline: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sortedZones: MapRiskZone[];
  position: number;
  onPositionChange: (position: number) => void;
  visibleCount: number;
  earliest?: string | null;
  latest?: string | null;
  playing: boolean;
  onTogglePlaying: () => void;
  speedIndex: number;
  onSpeedChange: (index: number) => void;
  onReset: () => void;
}

export const MapTimelineDrawer = memo(function MapTimelineDrawer({
  hasTimeline,
  open,
  onOpenChange,
  sortedZones,
  position,
  onPositionChange,
  visibleCount,
  earliest,
  latest,
  playing,
  onTogglePlaying,
  speedIndex,
  onSpeedChange,
  onReset,
}: MapTimelineDrawerProps) {
  if (!hasTimeline) return null;

  return (
    <div
      className={`map-timeline-drawer ${open ? "map-timeline-drawer--open" : ""}`}
      data-map-timeline-drawer
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="map-timeline-drawer__toggle"
        aria-expanded={open}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400/90">
          Incident Timeline
        </span>
        <span className="flex items-center gap-2 text-[11px] text-slate-400">
          {visibleCount} of {sortedZones.length} visible
          <ChevronUp
            {...iconProps}
            size={16}
            className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      <div className="map-timeline-drawer__body">
        <MapTimelineControls
          hasTimeline={hasTimeline}
          playing={playing}
          onTogglePlaying={onTogglePlaying}
          speedIndex={speedIndex}
          onSpeedChange={onSpeedChange}
          visibleCount={visibleCount}
          totalCount={sortedZones.length}
          onReset={onReset}
        />
        <input
          type="range"
          min={5}
          max={100}
          value={position}
          onChange={(e) => onPositionChange(Number(e.target.value))}
          className="premium-slider w-full accent-cyan-500"
          aria-label="Timeline position"
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>{earliest ? new Date(earliest).toLocaleDateString() : "Earliest"}</span>
          <span>{latest ? new Date(latest).toLocaleDateString() : "Latest"}</span>
        </div>

        <div className="map-timeline-drawer__events">
          {sortedZones.map((zone, index) => {
            const isVisible = index < visibleCount;
            const location =
              formatIncidentLocation(zone.cityName, zone.countryName) ??
              zone.displayLocation;
            const title = zone.reportTitle ?? zone.crisisType ?? "Incident";
            const typeColor = getCrisisTypeColor(zone.crisisType);

            return (
              <div
                key={zone.id}
                className={`map-timeline-drawer__event ${
                  isVisible ? "map-timeline-drawer__event--active" : ""
                }`}
                style={
                  isVisible
                    ? {
                        borderLeftColor: typeColor,
                        backgroundColor: `${typeColor}14`,
                      }
                    : undefined
                }
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: typeColor }}
                  aria-hidden
                />
                <CountryFlag country={zone.countryName} location={location} className="text-sm" />
                <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
                <span className="shrink-0 text-slate-500">
                  {zone.reportDate
                    ? new Date(zone.reportDate).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
