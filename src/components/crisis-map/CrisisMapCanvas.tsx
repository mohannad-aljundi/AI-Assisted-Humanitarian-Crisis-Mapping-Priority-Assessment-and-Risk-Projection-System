"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import L from "leaflet";
import type { LayerGroup, TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MAP_STYLE_PRESETS,
  MAP_TILE_ATTRIBUTION,
  type MapStyleId,
} from "@/lib/mapConstants";
import type { MapRiskZone } from "@/types";
import {
  attachRiskZoneLayer,
  CLUSTER_ZOOM_THRESHOLD,
  detachRiskZoneLayer,
  pulseZoneOnLayer,
  updateRiskZoneLayerZoom,
} from "@/components/crisis-map/RiskZoneLayer";
import {
  attachCountryBoundariesLayer,
  detachSupplementalLayer,
} from "@/components/crisis-map/MapSupplementalLayers";
import type { MapLayerState } from "@/components/crisis-map/MapLayerControls";

export interface MapHandle {
  fitAll: () => void;
  zoomToZone: (zone: MapRiskZone) => void;
  locateMe: () => void;
  resetView: () => void;
  exportView: () => void;
  latLngToContainerPoint: (lat: number, lng: number) => { x: number; y: number };
  pulseZone: (zoneId: string) => void;
}

interface CrisisMapCanvasProps {
  zones: MapRiskZone[];
  onZoneSelect: (zone: MapRiskZone) => void;
  className?: string;
  layers?: MapLayerState;
  mapStyle?: MapStyleId;
  autoFit?: boolean;
  overlay?: React.ReactNode;
  wrapperClassName?: string;
  useFloatingPanel?: boolean;
}

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

const DEFAULT_LAYER_STATE: MapLayerState = {
  showHeatmap: true,
  showClusters: true,
  showBoundaries: false,
  showRiskZones: true,
  showImpactRadius: true,
  showLabels: true,
};

function shouldRebuildClusters(prevZoom: number, nextZoom: number): boolean {
  const crossedThreshold =
    (prevZoom < CLUSTER_ZOOM_THRESHOLD) !== (nextZoom < CLUSTER_ZOOM_THRESHOLD);
  if (crossedThreshold) return true;
  if (nextZoom >= CLUSTER_ZOOM_THRESHOLD) return false;
  return Math.floor(prevZoom) !== Math.floor(nextZoom);
}

function safeInvalidateMapSize(
  map: L.Map | null,
  container: HTMLElement | null
): void {
  if (!map || !container) return;

  const el = map.getContainer();
  if (!el?.isConnected) return;

  const { width, height } = container.getBoundingClientRect();
  if (width < 1 || height < 1) return;

  map.whenReady(() => {
    if (!map.getContainer()?.isConnected) return;
    try {
      map.invalidateSize({ animate: false, pan: false });
    } catch {
      // Map pane not ready yet or map is mid-teardown.
    }
  });
}

export const CrisisMapCanvas = forwardRef<MapHandle, CrisisMapCanvasProps>(
  function CrisisMapCanvas(
    {
      zones,
      onZoneSelect,
      className = "h-full w-full",
      layers,
      mapStyle = "dark",
      autoFit = true,
      overlay,
      wrapperClassName = "",
      useFloatingPanel = true,
    },
    ref
  ) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const baseLayerRef = useRef<TileLayer | null>(null);
    const labelLayerRef = useRef<TileLayer | null>(null);
    const layerRef = useRef<LayerGroup | null>(null);
    const boundaryRef = useRef<LayerGroup | null>(null);
    const hasFitBoundsRef = useRef(false);
    const onZoneSelectRef = useRef(onZoneSelect);
    const zonesRef = useRef(zones);
    const layerStateRef = useRef<MapLayerState>(DEFAULT_LAYER_STATE);
    const lastClusterZoomRef = useRef(DEFAULT_ZOOM);
    const [clusterZoomKey, setClusterZoomKey] = useState(DEFAULT_ZOOM);

    const layerState = useMemo(
      () => layers ?? DEFAULT_LAYER_STATE,
      [layers]
    );

    const zonesFingerprint = useMemo(
      () => zones.map((z) => `${z.id}:${z.riskLevel}`).join("|"),
      [zones]
    );

    useEffect(() => {
      layerStateRef.current = layerState;
    }, [layerState]);

    useEffect(() => {
      onZoneSelectRef.current = onZoneSelect;
      zonesRef.current = zones;
    }, [onZoneSelect, zones]);

    const fitAll = useCallback(() => {
      const map = mapRef.current;
      if (!map || zonesRef.current.length === 0) return;
      const bounds = L.latLngBounds(
        zonesRef.current.map((z) => [z.latitude, z.longitude] as [number, number])
      );
      map.fitBounds(bounds.pad(0.15), { animate: true, duration: 1.4 });
    }, []);

    const exportView = useCallback(() => {
      const geojson = {
        type: "FeatureCollection",
        features: zonesRef.current.map((z) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [z.longitude, z.latitude],
          },
          properties: {
            title: z.reportTitle,
            crisisType: z.crisisType,
            riskLevel: z.riskLevel,
            priority: z.priorityLevel,
            country: z.countryName,
          },
        })),
      };
      const blob = new Blob([JSON.stringify(geojson, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crisis-map-export-${Date.now()}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
    }, []);

    useImperativeHandle(ref, () => ({
      fitAll,
      zoomToZone(zone: MapRiskZone) {
        mapRef.current?.flyTo([zone.latitude, zone.longitude], 9, {
          animate: true,
          duration: 1.3,
        });
      },
      locateMe() {
        if (!navigator.geolocation || !mapRef.current) return;
        navigator.geolocation.getCurrentPosition((pos) => {
          mapRef.current?.flyTo(
            [pos.coords.latitude, pos.coords.longitude],
            8,
            { animate: true, duration: 1.2 }
          );
        });
      },
      resetView() {
        mapRef.current?.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, {
          animate: true,
          duration: 1.4,
        });
      },
      exportView,
      latLngToContainerPoint(lat: number, lng: number) {
        const map = mapRef.current;
        if (!map) return { x: 0, y: 0 };
        const point = map.latLngToContainerPoint([lat, lng]);
        return { x: point.x, y: point.y };
      },
      pulseZone(zoneId: string) {
        pulseZoneOnLayer(layerRef.current, zoneId);
      },
    }));

    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      mapRef.current = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: 2,
        maxZoom: 14,
        zoomControl: false,
        attributionControl: true,
        doubleClickZoom: true,
        fadeAnimation: true,
        zoomAnimation: true,
      });

      L.control.zoom({ position: "bottomleft" }).addTo(mapRef.current);

      mapRef.current.createPane("basePane");
      mapRef.current.getPane("basePane")!.style.zIndex = "200";
      mapRef.current.createPane("impactZonePane");
      mapRef.current.getPane("impactZonePane")!.style.zIndex = "400";
      mapRef.current.createPane("glowPane");
      mapRef.current.getPane("glowPane")!.style.zIndex = "410";
      mapRef.current.createPane("labelPane");
      mapRef.current.getPane("labelPane")!.style.zIndex = "450";
      mapRef.current.getPane("labelPane")!.style.pointerEvents = "none";
      mapRef.current.createPane("iconPane");
      mapRef.current.getPane("iconPane")!.style.zIndex = "600";
      const popupPane = mapRef.current.getPane("popupPane");
      if (popupPane) popupPane.style.zIndex = "700";

      let zoomRaf: number | null = null;
      const handleZoom = () => {
        const map = mapRef.current;
        if (!map) return;
        if (zoomRaf !== null) cancelAnimationFrame(zoomRaf);
        zoomRaf = requestAnimationFrame(() => {
          zoomRaf = null;
          updateRiskZoneLayerZoom(layerRef.current, map.getZoom());
        });
      };

      const handleZoomEnd = () => {
        const map = mapRef.current;
        if (!map) return;
        const nextZoom = map.getZoom();
        const prevZoom = lastClusterZoomRef.current;
        if (layerStateRef.current.showClusters && shouldRebuildClusters(prevZoom, nextZoom)) {
          setClusterZoomKey(nextZoom);
        }
        lastClusterZoomRef.current = nextZoom;
      };

      mapRef.current.on("zoom", handleZoom);
      mapRef.current.on("zoomend", handleZoomEnd);
      lastClusterZoomRef.current = DEFAULT_ZOOM;

      let resizeRaf: number | null = null;
      const scheduleInvalidate = () => {
        if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = null;
          safeInvalidateMapSize(mapRef.current, containerRef.current);
        });
      };

      mapRef.current.whenReady(() => {
        scheduleInvalidate();
        window.setTimeout(scheduleInvalidate, 100);
        window.setTimeout(scheduleInvalidate, 400);
      });

      const wrapper = wrapperRef.current;
      const resizeObserver =
        wrapper &&
        new ResizeObserver(() => {
          scheduleInvalidate();
        });
      if (wrapper && resizeObserver) {
        resizeObserver.observe(wrapper);
      }

      return () => {
        if (zoomRaf !== null) cancelAnimationFrame(zoomRaf);
        if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
        resizeObserver?.disconnect();
        mapRef.current?.off("zoom", handleZoom);
        mapRef.current?.off("zoomend", handleZoomEnd);
        detachRiskZoneLayer(layerRef.current);
        detachSupplementalLayer(boundaryRef.current);
        layerRef.current = null;
        hasFitBoundsRef.current = false;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      const preset = MAP_STYLE_PRESETS[mapStyle];

      if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
      if (labelLayerRef.current) map.removeLayer(labelLayerRef.current);

      baseLayerRef.current = L.tileLayer(preset.baseUrl, {
        attribution: MAP_TILE_ATTRIBUTION,
        subdomains: "abcd",
        maxZoom: 20,
        pane: "basePane",
      }).addTo(map);

      map.getPane("basePane")!.style.filter = preset.baseFilter ?? "";

      if (preset.labelUrl && layerState.showLabels) {
        labelLayerRef.current = L.tileLayer(preset.labelUrl, {
          subdomains: "abcd",
          maxZoom: 20,
          pane: "labelPane",
          opacity: 0.92,
        }).addTo(map);
      }
    }, [mapStyle, layerState.showLabels]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      detachRiskZoneLayer(layerRef.current);
      detachSupplementalLayer(boundaryRef.current);

      if (layerState.showRiskZones) {
        layerRef.current = attachRiskZoneLayer(
          map,
          zones,
          (zone) => onZoneSelectRef.current(zone),
          {
            fitBounds: autoFit && !hasFitBoundsRef.current,
            fitBoundsAnimate: false,
            enableClusters: layerState.showClusters,
            showHeatmap: layerState.showHeatmap,
            showImpactRadius: layerState.showImpactRadius,
            zoom: map.getZoom(),
            useFloatingPanel,
          }
        );

        map.whenReady(() => {
          updateRiskZoneLayerZoom(layerRef.current, map.getZoom());
        });
        window.setTimeout(() => {
          updateRiskZoneLayerZoom(layerRef.current, map.getZoom());
        }, 50);
      }

      if (layerState.showBoundaries) {
        attachCountryBoundariesLayer(map).then((layer) => {
          boundaryRef.current = layer;
        });
      }

      if (zones.length > 0 && autoFit) {
        hasFitBoundsRef.current = true;
      }
    }, [zonesFingerprint, layerState, autoFit, clusterZoomKey, useFloatingPanel]);

    return (
      <div
        ref={wrapperRef}
        className={`map-command-viewport relative h-full w-full min-h-[inherit] ${wrapperClassName}`}
      >
        <div ref={containerRef} className={`${className} relative z-10 min-h-[inherit]`} />
        {overlay}
      </div>
    );
  }
);
