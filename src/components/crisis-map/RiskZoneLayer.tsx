import type { Map as LeafletMap, LayerGroup } from "leaflet";
import L from "leaflet";
import { buildCrisisIconSvgMarkup } from "@/lib/crisisIcons";
import {
  getDisplayRadiusMeters,
  getIconSizeForZoom,
  getIconSvgSizeForZoom,
} from "@/lib/mapConstants";
import {
  buildCenterIconHtml,
  buildClusterTooltip,
  computeClusterRadiusMeters,
  crisisZoneColor,
  getDominantZone,
  IMPACT_FILL_OPACITY,
  IMPACT_GLOW_OPACITY,
} from "@/lib/incidentZoneVisuals";
import {
  buildHoverSummary,
  buildPopupContent,
  buildUnverifiedHover,
  clusterZones,
  getMarkerZIndex,
  sortZonesByPriority,
  type MapCluster,
} from "@/lib/mapMarkers";
import type { MapRiskZone } from "@/types";

export const CLUSTER_ZOOM_THRESHOLD = 10;

function zoomOpacityScale(zoom: number): number {
  if (zoom < 4) return 0.82;
  if (zoom < 6) return 0.9;
  return 1;
}

interface ImpactZoneStyle {
  fillOpacity: number;
  glowOpacity: number;
  strokeOpacity: number;
}

function baseStyle(zone: MapRiskZone, zoom: number): ImpactZoneStyle {
  const scale = zoomOpacityScale(zoom);
  return {
    fillOpacity: IMPACT_FILL_OPACITY[zone.riskLevel] * scale,
    glowOpacity: IMPACT_GLOW_OPACITY[zone.riskLevel] * scale,
    strokeOpacity: 0.22 * scale,
  };
}

function applyHoverStyle(
  circle: L.Circle,
  zone: MapRiskZone,
  zoom: number,
  hovered: boolean
) {
  const base = baseStyle(zone, zoom);
  const color = crisisZoneColor(zone.crisisType);
  const mult = hovered ? 1.55 : 1;
  circle.setStyle({
    fillColor: color,
    fillOpacity: Math.min(base.fillOpacity * mult, 0.32),
    color,
    opacity: hovered ? 0.55 : base.strokeOpacity,
    weight: hovered ? 2 : 1.25,
  });
}

interface ImpactCircles {
  main: L.Circle;
  glow: L.Circle;
}

export interface GisRenderEntry {
  zone: MapRiskZone;
  groundRadiusMeters: number;
  lat: number;
  lng: number;
  mainCircle?: L.Circle;
  glowCircle?: L.Circle;
  iconMarker: L.Marker;
  count?: number;
  isCluster: boolean;
  cluster?: MapCluster;
}

export interface GisLayerHandles {
  entries: GisRenderEntry[];
  zoom: number;
}

type LayerGroupWithGis = LayerGroup & { _gis?: GisLayerHandles };

function createGlowRing(
  group: LayerGroup,
  lat: number,
  lng: number,
  radius: number,
  color: string,
  opacity: number
): L.Circle {
  const ring = L.circle([lat, lng], {
    radius: radius * 1.18,
    pane: "glowPane",
    stroke: false,
    fillColor: color,
    fillOpacity: opacity,
    interactive: false,
    className: "gis-impact-glow",
  });
  ring.addTo(group);
  return ring;
}

function createImpactZoneCircles(
  group: LayerGroup,
  lat: number,
  lng: number,
  radiusMeters: number,
  zone: MapRiskZone,
  zoom: number,
  className = "gis-impact-zone"
): ImpactCircles {
  const color = crisisZoneColor(zone.crisisType);
  const style = baseStyle(zone, zoom);
  const radius = getDisplayRadiusMeters(radiusMeters, zoom, zone.riskLevel);

  const glow = createGlowRing(group, lat, lng, radius, color, style.glowOpacity);

  const main = L.circle([lat, lng], {
    radius,
    pane: "impactZonePane",
    stroke: true,
    color,
    weight: 1,
    opacity: style.strokeOpacity,
    fillColor: color,
    fillOpacity: style.fillOpacity,
    className: `${className} gis-impact-zone--${zone.riskLevel.toLowerCase()}`,
  });
  main.addTo(group);

  return { main, glow };
}

function createCenterIconMarker(
  lat: number,
  lng: number,
  zone: MapRiskZone,
  zoom: number,
  options?: { count?: number; detected?: boolean }
): L.Marker {
  const iconSize = getIconSizeForZoom(zoom);
  const svgSize = getIconSvgSizeForZoom(zoom);
  const stackSize = Math.round(iconSize * 1.35);
  const icon = L.divIcon({
    className: "gis-icon-hub-marker gis-icon-hub-marker--interactive",
    html: buildCenterIconHtml(zone, {
      count: options?.count,
      pulse: zone.riskLevel === "Critical" || zone.riskLevel === "High",
      iconSize,
      svgSize,
      detected: options?.detected,
    }),
    iconSize: [stackSize, stackSize],
    iconAnchor: [stackSize / 2, stackSize / 2],
  });

  return L.marker([lat, lng], {
    icon,
    pane: "iconPane",
    zIndexOffset: getMarkerZIndex(zone) + 200,
    interactive: true,
  });
}

function updateEntryVisuals(entry: GisRenderEntry, zoom: number, detected?: boolean) {
  const radius = getDisplayRadiusMeters(
    entry.groundRadiusMeters,
    zoom,
    entry.zone.riskLevel
  );

  if (entry.glowCircle) {
    entry.glowCircle.setRadius(radius * 1.18);
  }
  if (entry.mainCircle) {
    entry.mainCircle.setRadius(radius);
  }

  const iconSize = getIconSizeForZoom(zoom);
  const svgSize = getIconSvgSizeForZoom(zoom);
  const stackSize = Math.round(iconSize * 1.35);
  entry.iconMarker.setIcon(
    L.divIcon({
      className: "gis-icon-hub-marker gis-icon-hub-marker--interactive",
      html: buildCenterIconHtml(entry.zone, {
        count: entry.count,
        pulse: entry.zone.riskLevel === "Critical" || entry.zone.riskLevel === "High",
        iconSize,
        svgSize,
        detected,
      }),
      iconSize: [stackSize, stackSize],
      iconAnchor: [stackSize / 2, stackSize / 2],
    })
  );
}

export function pulseZoneOnLayer(layerGroup: LayerGroup | null, zoneId: string): void {
  const handles = (layerGroup as LayerGroupWithGis)?._gis;
  if (!handles) return;
  const entry = handles.entries.find((e) => e.zone.id === zoneId);
  if (!entry) return;
  updateEntryVisuals(entry, handles.zoom, true);
  const el = entry.iconMarker.getElement();
  el?.classList.add("gis-marker-stack--detected");
  window.setTimeout(() => {
    el?.classList.remove("gis-marker-stack--detected");
    updateEntryVisuals(entry, handles.zoom, false);
  }, 3000);
}

export function updateRiskZoneLayerZoom(
  layerGroup: LayerGroup | null,
  zoom: number
): void {
  const handles = (layerGroup as LayerGroupWithGis)?._gis;
  if (!handles) return;

  handles.zoom = zoom;
  for (const entry of handles.entries) {
    updateEntryVisuals(entry, zoom);
  }
}

function wireInteractions(
  layers: L.Layer[],
  zone: MapRiskZone,
  map: LeafletMap,
  onZoneSelect: (zone: MapRiskZone) => void,
  useFloatingPanel: boolean,
  zoom: number,
  mainCircle?: L.Circle
) {
  if (mainCircle) {
    mainCircle.on("mouseover", () => applyHoverStyle(mainCircle, zone, zoom, true));
    mainCircle.on("mouseout", () => applyHoverStyle(mainCircle, zone, zoom, false));
  }

  for (const layer of layers) {
    if (!useFloatingPanel) {
      layer.bindPopup(
        buildPopupContent(zone, (key) => buildCrisisIconSvgMarkup(key, { size: 24 })),
        { className: "crisis-leaflet-popup gis-incident-popup", maxWidth: 360 }
      );
    }

    const hoverText = zone.locationVerified
      ? buildHoverSummary(zone)
      : buildUnverifiedHover(zone);

    layer.bindTooltip(hoverText, {
      direction: "top",
      className: "crisis-tooltip",
      sticky: true,
    });

    layer.on("click", () => {
      if (layer instanceof L.Marker) {
        const el = layer.getElement();
        el?.classList.add("gis-marker-stack--clicked");
        window.setTimeout(() => el?.classList.remove("gis-marker-stack--clicked"), 400);
      }
      onZoneSelect(zone);
    });
    layer.on("dblclick", (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      map.flyTo([zone.latitude, zone.longitude], Math.min(map.getZoom() + 2, 12), {
        animate: true,
        duration: 1.2,
      });
    });
  }
}

function renderCluster(
  group: LayerGroup,
  cluster: MapCluster,
  map: LeafletMap,
  onZoneSelect: (zone: MapRiskZone) => void,
  zoom: number,
  showImpact: boolean,
  entries: GisRenderEntry[]
) {
  const dominant = getDominantZone(cluster.zones);
  const count = cluster.zones.length;
  const radiusMeters = computeClusterRadiusMeters(cluster, zoom);

  let circles: ImpactCircles | undefined;
  if (showImpact) {
    circles = createImpactZoneCircles(
      group,
      cluster.lat,
      cluster.lng,
      radiusMeters,
      dominant,
      zoom,
      "gis-impact-zone gis-impact-zone--cluster"
    );
  }

  const iconMarker = createCenterIconMarker(cluster.lat, cluster.lng, dominant, zoom, {
    count,
  });
  iconMarker.addTo(group);

  entries.push({
    zone: dominant,
    groundRadiusMeters: radiusMeters,
    lat: cluster.lat,
    lng: cluster.lng,
    mainCircle: circles?.main,
    glowCircle: circles?.glow,
    iconMarker,
    count,
    isCluster: true,
    cluster,
  });

  const interactive: L.Layer[] = [];
  if (circles?.main) interactive.push(circles.main);
  interactive.push(iconMarker);

  for (const layer of interactive) {
    layer.bindTooltip(buildClusterTooltip(cluster), {
      direction: "top",
      className: "crisis-tooltip",
      sticky: true,
    });
    layer.on("click", () => {
      const bounds = L.latLngBounds(
        cluster.zones.map((z) => [z.latitude, z.longitude] as [number, number])
      );
      map.fitBounds(bounds.pad(0.35), {
        animate: true,
        maxZoom: CLUSTER_ZOOM_THRESHOLD + 1,
      });
      onZoneSelect(dominant);
    });
  }

  if (circles?.main) {
    circles.main.on("mouseover", () =>
      applyHoverStyle(circles!.main, dominant, zoom, true)
    );
    circles.main.on("mouseout", () =>
      applyHoverStyle(circles!.main, dominant, zoom, false)
    );
  }
}

function renderIncident(
  group: LayerGroup,
  zone: MapRiskZone,
  map: LeafletMap,
  onZoneSelect: (zone: MapRiskZone) => void,
  options: {
    useFloatingPanel: boolean;
    showImpact: boolean;
    zoom: number;
  },
  entries: GisRenderEntry[]
) {
  let circles: ImpactCircles | undefined;

  if (options.showImpact) {
    circles = createImpactZoneCircles(
      group,
      zone.latitude,
      zone.longitude,
      zone.radiusMeters,
      zone,
      options.zoom
    );
  }

  const iconMarker = createCenterIconMarker(
    zone.latitude,
    zone.longitude,
    zone,
    options.zoom
  );
  iconMarker.addTo(group);

  entries.push({
    zone,
    groundRadiusMeters: zone.radiusMeters,
    lat: zone.latitude,
    lng: zone.longitude,
    mainCircle: circles?.main,
    glowCircle: circles?.glow,
    iconMarker,
    isCluster: false,
  });

  const interactive: L.Layer[] = [];
  if (circles?.main) interactive.push(circles.main);
  interactive.push(iconMarker);

  wireInteractions(
    interactive,
    zone,
    map,
    onZoneSelect,
    options.useFloatingPanel,
    options.zoom,
    circles?.main
  );
}

export function attachRiskZoneLayer(
  map: LeafletMap,
  zones: MapRiskZone[],
  onZoneSelect: (zone: MapRiskZone) => void,
  options?: {
    fitBounds?: boolean;
    fitBoundsAnimate?: boolean;
    enableClusters?: boolean;
    showHeatmap?: boolean;
    showImpactRadius?: boolean;
    zoom?: number;
    useFloatingPanel?: boolean;
  }
): LayerGroup {
  const layerGroup = L.layerGroup() as LayerGroupWithGis;
  const sorted = sortZonesByPriority(zones);
  const zoom = options?.zoom ?? map.getZoom();
  const useClusters = (options?.enableClusters ?? true) && zoom < CLUSTER_ZOOM_THRESHOLD;
  const showImpact = (options?.showImpactRadius ?? true) && (options?.showHeatmap ?? true);
  const useFloatingPanel = options?.useFloatingPanel ?? false;
  const entries: GisRenderEntry[] = [];

  const clusters = useClusters
    ? clusterZones(sorted, zoom)
    : sorted.map((z) => ({ lat: z.latitude, lng: z.longitude, zones: [z] }));

  const allBounds: [number, number][] = [];

  for (const cluster of clusters) {
    if (useClusters && cluster.zones.length > 1) {
      renderCluster(
        layerGroup,
        cluster,
        map,
        onZoneSelect,
        zoom,
        showImpact,
        entries
      );
      allBounds.push([cluster.lat, cluster.lng]);
      continue;
    }

    for (const zone of cluster.zones) {
      renderIncident(layerGroup, zone, map, onZoneSelect, {
        useFloatingPanel,
        showImpact,
        zoom,
      }, entries);
      allBounds.push([zone.latitude, zone.longitude]);
    }
  }

  layerGroup._gis = { entries, zoom };
  layerGroup.addTo(map);

  if (zones.length > 0 && options?.fitBounds !== false && allBounds.length > 0) {
    const animate = options?.fitBoundsAnimate ?? false;
    map.fitBounds(L.latLngBounds(allBounds).pad(0.2), { animate });

    const refreshIcons = () => {
      updateRiskZoneLayerZoom(layerGroup, map.getZoom());
    };

    if (animate) {
      map.once("moveend", refreshIcons);
    } else {
      refreshIcons();
      map.whenReady(refreshIcons);
      window.setTimeout(refreshIcons, 0);
    }
  }

  return layerGroup;
}

export function detachRiskZoneLayer(layerGroup: LayerGroup | null): void {
  if (!layerGroup) return;
  const gisLayer = layerGroup as LayerGroupWithGis;
  gisLayer._gis = undefined;
  layerGroup.clearLayers();
  layerGroup.remove();
}
