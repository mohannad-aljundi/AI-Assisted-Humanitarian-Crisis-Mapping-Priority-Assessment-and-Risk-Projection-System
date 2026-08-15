"use client";

import { memo } from "react";
import { TIMELINE_SPEEDS } from "@/hooks/useTimelinePlayback";

interface MapTimelineControlsProps {
  hasTimeline: boolean;
  playing: boolean;
  onTogglePlaying: () => void;
  speedIndex: number;
  onSpeedChange: (index: number) => void;
  visibleCount: number;
  totalCount: number;
  onReset: () => void;
}

export const MapTimelineControls = memo(function MapTimelineControls({
  hasTimeline,
  playing,
  onTogglePlaying,
  speedIndex,
  onSpeedChange,
  visibleCount,
  totalCount,
  onReset,
}: MapTimelineControlsProps) {
  if (!hasTimeline) {
    return (
      <div className="map-side-panel__section">
        <p className="map-side-panel__section-title">Timeline</p>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Add more dated incidents to enable temporal playback.
        </p>
      </div>
    );
  }

  return (
    <div className="map-side-panel__section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="map-side-panel__section-title">Timeline Controls</p>
        <span className="text-[10px] font-medium text-cyan-400">
          {visibleCount}/{totalCount}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onTogglePlaying}
          className={`map-control-btn flex-1 ${playing ? "map-control-btn--active" : ""}`}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onReset} className="map-control-btn">
          Reset
        </button>
      </div>

      <div className="mt-2 flex gap-1">
        {TIMELINE_SPEEDS.map((speed, index) => (
          <button
            key={speed.label}
            type="button"
            onClick={() => onSpeedChange(index)}
            className={`map-control-btn flex-1 ${
              speedIndex === index ? "map-control-btn--active" : ""
            }`}
          >
            {speed.label}
          </button>
        ))}
      </div>
    </div>
  );
});
