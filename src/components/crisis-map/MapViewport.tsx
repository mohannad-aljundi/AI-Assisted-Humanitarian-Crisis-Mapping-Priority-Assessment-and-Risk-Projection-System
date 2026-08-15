"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MapRiskZone } from "@/types";
import type { MapStyleId } from "@/lib/mapConstants";
import type { MapLayerState } from "@/components/crisis-map/MapLayerControls";
import type { MapHandle } from "@/components/crisis-map/CrisisMapCanvas";
import { MapAmbienceOverlay } from "@/components/crisis-map/MapAmbienceOverlay";
import {
  AiRadarWidget,
  RADAR_INSET,
  RADAR_SIZE,
} from "@/components/crisis-map/AiRadarWidget";
import {
  MapDetectionOverlay,
  type DetectionBeam,
} from "@/components/crisis-map/MapDetectionOverlay";

const CrisisMapCanvas = dynamic(
  () => import("./CrisisMapCanvas").then((m) => m.CrisisMapCanvas),
  { ssr: false }
);

interface MapViewportProps {
  zones: MapRiskZone[];
  mapStyle: MapStyleId;
  layers: MapLayerState;
  radarActive: boolean;
  autoFit: boolean;
  mapRef: React.RefObject<MapHandle | null>;
}

const BEAM_DURATION_MS = 2800;

export const MapViewport = memo(function MapViewport({
  zones,
  mapStyle,
  layers,
  radarActive,
  autoFit,
  mapRef,
}: MapViewportProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const [beams, setBeams] = useState<DetectionBeam[]>([]);

  const radarOrigin = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return { x: 0, y: 0 };
    const w = el.clientWidth;
    return {
      x: w - RADAR_INSET - RADAR_SIZE / 2,
      y: RADAR_INSET + RADAR_SIZE / 2,
    };
  }, []);

  useEffect(() => {
    if (!zones.length) return;

    let cancelled = false;

    const detect = () => {
      const map = mapRef.current;
      if (!map) {
        if (!cancelled) requestAnimationFrame(detect);
        return;
      }

      const prev = knownIdsRef.current;
      const newcomers = zones.filter((z) => !prev.has(z.id));
      if (prev.size > 0 && newcomers.length > 0) {
        const origin = radarOrigin();
        const nextBeams: DetectionBeam[] = [];

        for (const zone of newcomers.slice(0, 3)) {
          const point = map.latLngToContainerPoint(zone.latitude, zone.longitude);
          const dx = point.x - origin.x;
          const dy = point.y - origin.y;
          nextBeams.push({
            id: `${zone.id}-${Date.now()}`,
            x1: origin.x,
            y1: origin.y,
            x2: point.x,
            y2: point.y,
            length: Math.hypot(dx, dy),
          });
          map.pulseZone(zone.id);
        }

        setBeams((b) => [...b, ...nextBeams]);
        window.setTimeout(() => {
          setBeams((b) => b.filter((beam) => !nextBeams.some((n) => n.id === beam.id)));
        }, BEAM_DURATION_MS);
      }

      knownIdsRef.current = new Set(zones.map((z) => z.id));
    };

    detect();
    return () => {
      cancelled = true;
    };
  }, [zones, mapRef, radarOrigin]);

  return (
    <div ref={wrapperRef} className="map-viewport relative h-full w-full min-h-0">
      <CrisisMapCanvas
        ref={mapRef}
        zones={zones}
        onZoneSelect={() => {}}
        layers={layers}
        mapStyle={mapStyle}
        useFloatingPanel={false}
        className="h-full w-full"
        autoFit={autoFit}
      />
      <MapAmbienceOverlay />
      <AiRadarWidget active={radarActive} position="top-right" />
      <MapDetectionOverlay beams={beams} />
    </div>
  );
});
