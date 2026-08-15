import type { Map as LeafletMap, LayerGroup } from "leaflet";
import L from "leaflet";
import type { MapRiskZone } from "@/types";
import { RISK_ZONE_COLORS, getDisplayRadiusMeters } from "@/lib/mapConstants";

const RISK_WEIGHT: Record<string, number> = {
  Critical: 1,
  High: 0.75,
  Medium: 0.5,
  Low: 0.25,
};

export function attachHeatmapLayer(
  map: LeafletMap,
  zones: MapRiskZone[]
): LayerGroup {
  const group = L.layerGroup();

  for (const zone of zones) {
    const intensity = RISK_WEIGHT[zone.riskLevel] ?? 0.3;
    const radius = Math.min(
      getDisplayRadiusMeters(zone.radiusMeters, map.getZoom(), zone.riskLevel) * 0.35,
      12_000
    );

    L.circle([zone.latitude, zone.longitude], {
      radius,
      pane: "riskPane",
      stroke: false,
      fillColor: RISK_ZONE_COLORS[zone.riskLevel],
      fillOpacity: 0.15 * intensity,
      interactive: false,
      className: "heatmap-pulse",
    }).addTo(group);
  }

  group.addTo(map);
  return group;
}

interface Cluster {
  lat: number;
  lng: number;
  zones: MapRiskZone[];
}

function clusterZones(zones: MapRiskZone[], distanceKm = 200): Cluster[] {
  const clusters: Cluster[] = [];

  for (const zone of zones) {
    let matched = false;
    for (const cluster of clusters) {
      const dLat = (zone.latitude - cluster.lat) * 111;
      const dLng =
        (zone.longitude - cluster.lng) *
        111 *
        Math.cos((cluster.lat * Math.PI) / 180);
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < distanceKm) {
        cluster.zones.push(zone);
        cluster.lat =
          cluster.zones.reduce((s, z) => s + z.latitude, 0) / cluster.zones.length;
        cluster.lng =
          cluster.zones.reduce((s, z) => s + z.longitude, 0) / cluster.zones.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ lat: zone.latitude, lng: zone.longitude, zones: [zone] });
    }
  }

  return clusters;
}

export function attachClusterLayer(
  map: LeafletMap,
  zones: MapRiskZone[],
  onSelect: (zone: MapRiskZone) => void
): LayerGroup {
  const group = L.layerGroup();
  const clusters = clusterZones(zones);

  for (const cluster of clusters) {
    if (cluster.zones.length === 1) continue;

    const highestRisk = cluster.zones.reduce((best, z) =>
      (RISK_WEIGHT[z.riskLevel] ?? 0) > (RISK_WEIGHT[best.riskLevel] ?? 0)
        ? z
        : best
    );

    const marker = L.circleMarker([cluster.lat, cluster.lng], {
      radius: 14 + cluster.zones.length * 2,
      pane: "riskPane",
      fillColor: RISK_ZONE_COLORS[highestRisk.riskLevel],
      fillOpacity: 0.85,
      color: "#fff",
      weight: 2,
    });

    marker.bindTooltip(
      `<strong>${cluster.zones.length} incidents</strong><br/>${highestRisk.displayLocation}`,
      { direction: "top", className: "crisis-tooltip" }
    );

    marker.on("click", () => onSelect(highestRisk));
    marker.addTo(group);
  }

  group.addTo(map);
  return group;
}

export async function attachCountryBoundariesLayer(
  map: LeafletMap
): Promise<LayerGroup> {
  const group = L.layerGroup();

  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
    );
    if (!response.ok) return group;

    const geojson = await response.json();
    L.geoJSON(geojson, {
      pane: "riskPane",
      style: {
        color: "#38bdf8",
        weight: 0.5,
        fillOpacity: 0,
        opacity: 0.25,
      },
      interactive: false,
    }).addTo(group);
  } catch {
    // Boundaries are optional enhancement
  }

  group.addTo(map);
  return group;
}

export function detachSupplementalLayer(layer: LayerGroup | null): void {
  if (layer) {
    layer.clearLayers();
    layer.remove();
  }
}
