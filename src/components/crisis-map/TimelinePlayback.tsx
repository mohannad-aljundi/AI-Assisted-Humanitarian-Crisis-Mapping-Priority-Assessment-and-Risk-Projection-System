"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapRiskZone } from "@/types";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { formatIncidentLocation } from "@/lib/locationDisplay";
import { getCrisisTypeColor } from "@/lib/crisisTypeColors";

interface TimelinePlaybackProps {
  zones: MapRiskZone[];
  onVisibleZonesChange: (zones: MapRiskZone[] | null) => void;
}

const SPEEDS = [
  { label: "0.5×", ms: 1200 },
  { label: "1×", ms: 800 },
  { label: "2×", ms: 400 },
];

export function TimelinePlayback({ zones, onVisibleZonesChange }: TimelinePlaybackProps) {
  const [position, setPosition] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => {
      const dateA = a.reportDate ? new Date(a.reportDate).getTime() : 0;
      const dateB = b.reportDate ? new Date(b.reportDate).getTime() : 0;
      return dateA - dateB || a.id.localeCompare(b.id);
    });
  }, [zones]);

  const visibleCount = Math.max(
    1,
    Math.ceil((position / 100) * sortedZones.length)
  );

  // Sync visible zones to parent after render — never call setState on parent
  // from inside another component's setState updater or during render.
  useEffect(() => {
    if (zones.length < 2) {
      onVisibleZonesChange(null);
      return;
    }
    if (position >= 100 && !playing) {
      onVisibleZonesChange(null);
      return;
    }
    const count = Math.max(1, Math.ceil((position / 100) * sortedZones.length));
    onVisibleZonesChange(sortedZones.slice(0, count));
  }, [position, playing, sortedZones, zones.length, onVisibleZonesChange]);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setPosition((prev) => Math.min(100, prev + 2));
    }, SPEEDS[speedIndex].ms);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, speedIndex]);

  useEffect(() => {
    if (playing && position >= 100) {
      setPlaying(false);
    }
  }, [playing, position]);

  useEffect(() => {
    return () => onVisibleZonesChange(null);
  }, [onVisibleZonesChange]);

  if (zones.length < 2) return null;

  const earliest = sortedZones[0]?.reportDate;
  const latest = sortedZones[sortedZones.length - 1]?.reportDate;

  return (
    <div className="glass-panel border-white/15 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Timeline Playback
        </p>
        <span className="text-xs text-cyan-400">
          {visibleCount} / {sortedZones.length}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700"
        >
          {playing ? "Pause" : "Play"}
        </button>
        {SPEEDS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setSpeedIndex(i)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs ${
              speedIndex === i
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                : "border-white/10 text-slate-400"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <input
        type="range"
        min={5}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="w-full accent-cyan-500"
      />
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{earliest ? new Date(earliest).toLocaleDateString() : "Earliest"}</span>
        <span>{latest ? new Date(latest).toLocaleDateString() : "Latest"}</span>
      </div>

      <div className="mt-3 max-h-28 space-y-1 overflow-y-auto border-t border-white/10 pt-3">
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
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-[11px] ${
                isVisible ? "text-slate-200" : "text-slate-500"
              }`}
              style={
                isVisible
                  ? {
                      backgroundColor: `${typeColor}18`,
                      borderLeft: `2px solid ${typeColor}`,
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
  );
}
