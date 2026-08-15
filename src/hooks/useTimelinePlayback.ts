"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRiskZone } from "@/types";

export const TIMELINE_SPEEDS = [
  { label: "0.5×", ms: 1200 },
  { label: "1×", ms: 800 },
  { label: "2×", ms: 400 },
] as const;

export function useTimelinePlayback(
  zones: MapRiskZone[],
  onVisibleZonesChange: (zones: MapRiskZone[] | null) => void
) {
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

  const hasTimeline = zones.length >= 2;

  const visibleCount = Math.max(
    1,
    Math.ceil((position / 100) * sortedZones.length)
  );

  useEffect(() => {
    if (!hasTimeline) {
      onVisibleZonesChange(null);
      return;
    }
    if (position >= 100 && !playing) {
      onVisibleZonesChange(null);
      return;
    }
    const count = Math.max(1, Math.ceil((position / 100) * sortedZones.length));
    onVisibleZonesChange(sortedZones.slice(0, count));
  }, [position, playing, sortedZones, hasTimeline, onVisibleZonesChange]);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setPosition((prev) => Math.min(100, prev + 2));
    }, TIMELINE_SPEEDS[speedIndex].ms);

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

  const togglePlaying = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const resetTimeline = useCallback(() => {
    setPlaying(false);
    setPosition(100);
  }, []);

  const earliest = sortedZones[0]?.reportDate;
  const latest = sortedZones[sortedZones.length - 1]?.reportDate;

  return {
    hasTimeline,
    sortedZones,
    position,
    setPosition,
    playing,
    togglePlaying,
    resetTimeline,
    speedIndex,
    setSpeedIndex,
    visibleCount,
    earliest,
    latest,
  };
}
