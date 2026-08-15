"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardAlert, MapPageData, MapRiskZone } from "@/types";
import type { MapStyleId } from "@/lib/mapConstants";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { AlertsTicker } from "@/components/ui/AlertsTicker";
import { btnPrimary } from "@/lib/uiClasses";
import {
  applyMapFilters,
  DEFAULT_MAP_FILTERS,
  deriveFilterOptions,
  type MapFilterState,
} from "@/components/crisis-map/MapFilters";
import { MapTimelineDrawer } from "@/components/crisis-map/MapTimelineDrawer";
import {
  MapCommandLeftRail,
  MapCommandRightRail,
} from "@/components/crisis-map/MapCommandRails";
import { MapFiltersPanel } from "@/components/crisis-map/MapFiltersPanel";
import { MapViewport } from "@/components/crisis-map/MapViewport";
import { SectionCard } from "@/components/ui/SectionCard";
import { useTimelinePlayback } from "@/hooks/useTimelinePlayback";
import { useSyncMonitoringOptional } from "@/contexts/SyncMonitoringContext";
import { ANALYSIS_COMPLETED_EVENT } from "@/contexts/AnalysisLiveContext";
import type { MapHandle } from "@/components/crisis-map/CrisisMapCanvas";
import {
  DEFAULT_MAP_LAYERS,
  type MapLayerState,
} from "@/components/crisis-map/MapLayerControls";

interface CrisisMapViewProps {
  data: MapPageData;
  alerts?: DashboardAlert[];
}

export function CrisisMapView({ data, alerts = [] }: CrisisMapViewProps) {
  const router = useRouter();
  const mapRef = useRef<MapHandle>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const sync = useSyncMonitoringOptional();

  useEffect(() => {
    function onCompleted() {
      router.refresh();
    }
    window.addEventListener(ANALYSIS_COMPLETED_EVENT, onCompleted);
    return () => window.removeEventListener(ANALYSIS_COMPLETED_EVENT, onCompleted);
  }, [router]);

  const [activeFilters, setActiveFilters] = useState<MapFilterState>(DEFAULT_MAP_FILTERS);
  const [draftFilters, setDraftFilters] = useState<MapFilterState>(DEFAULT_MAP_FILTERS);
  const [mapLayers, setMapLayers] = useState<MapLayerState>(DEFAULT_MAP_LAYERS);
  const [mapStyle, setMapStyle] = useState<MapStyleId>("dark");
  const [timelineZones, setTimelineZones] = useState<MapRiskZone[] | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timelineDrawerOpen, setTimelineDrawerOpen] = useState(false);
  const [leftExpanded, setLeftExpanded] = useState(false);
  const [rightExpanded, setRightExpanded] = useState(false);

  const isSyncing = Boolean(sync?.isRefreshing || sync?.status.isRunning);

  const filterOptions = useMemo(
    () => deriveFilterOptions(data.zones),
    [data.zones]
  );

  const filteredZones = useMemo(
    () => applyMapFilters(data.zones, activeFilters),
    [data.zones, activeFilters]
  );

  const displayZones = timelineZones ?? filteredZones;

  const timeline = useTimelinePlayback(filteredZones, setTimelineZones);

  const handleApplyFilters = useCallback(() => {
    setActiveFilters({ ...draftFilters });
  }, [draftFilters]);

  const handleResetFilters = useCallback(() => {
    setDraftFilters(DEFAULT_MAP_FILTERS);
    setActiveFilters(DEFAULT_MAP_FILTERS);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false));
    }
  }, []);

  const openTimeline = useCallback(() => {
    setTimelineDrawerOpen(true);
  }, []);

  if (data.zones.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppTopBar title="Global Crisis Command" showSyncNow />
        <div className="app-page-content p-6">
          <SectionCard
            title="No Incidents Mapped"
            description="Analyse humanitarian reports to populate the GIS crisis map."
          >
            <Link href="/reports" className={btnPrimary}>
              Analyse a Report
            </Link>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="map-command-center flex h-screen flex-col overflow-hidden bg-[#04070e] pb-14">
      <AppTopBar
        title="Global Crisis Command"
        subtitle={`${displayZones.length} active · ${data.zones.length} total incidents`}
        showAddReport={false}
        showSyncNow
        alertCount={alerts.length}
      />

      <div
        ref={mapContainerRef}
        data-map-shell
        className={`map-command-grid relative min-h-0 flex-1 ${
          leftExpanded ? "map-command-grid--left-open" : ""
        } ${rightExpanded ? "map-command-grid--right-open" : ""} ${
          isFullscreen ? "bg-[#04070e]" : ""
        }`}
      >
        <MapCommandLeftRail
          expanded={leftExpanded}
          onToggle={() => setLeftExpanded((v) => !v)}
          zones={displayZones}
          onOpenTimeline={openTimeline}
          hasTimeline={timeline.hasTimeline}
        />

        <main className="map-command-main relative min-h-0 min-w-0 flex-1">
          {displayZones.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-slate-500">No incidents match the current filters.</p>
            </div>
          ) : (
            <MapViewport
              mapRef={mapRef}
              zones={displayZones}
              mapStyle={mapStyle}
              layers={mapLayers}
              radarActive={isSyncing}
              autoFit={!timelineZones}
            />
          )}
        </main>

        <MapCommandRightRail
          expanded={rightExpanded}
          onToggle={() => setRightExpanded((v) => !v)}
        >
          <MapFiltersPanel
            draft={draftFilters}
            crisisTypes={data.statistics.crisisTypes}
            sources={filterOptions.sources}
            countries={filterOptions.countries}
            layers={mapLayers}
            mapStyle={mapStyle}
            isFullscreen={isFullscreen}
            onDraftChange={setDraftFilters}
            onApply={handleApplyFilters}
            onReset={handleResetFilters}
            onLayersChange={setMapLayers}
            onMapStyleChange={setMapStyle}
            onLocateMe={() => mapRef.current?.locateMe()}
            onFitIncidents={() => mapRef.current?.fitAll()}
            onResetView={() => mapRef.current?.resetView()}
            onExport={() => mapRef.current?.exportView()}
            onToggleFullscreen={toggleFullscreen}
          />
        </MapCommandRightRail>
      </div>

      <MapTimelineDrawer
        hasTimeline={timeline.hasTimeline}
        open={timelineDrawerOpen}
        onOpenChange={setTimelineDrawerOpen}
        sortedZones={timeline.sortedZones}
        position={timeline.position}
        onPositionChange={timeline.setPosition}
        visibleCount={timeline.visibleCount}
        earliest={timeline.earliest}
        latest={timeline.latest}
        playing={timeline.playing}
        onTogglePlaying={timeline.togglePlaying}
        speedIndex={timeline.speedIndex}
        onSpeedChange={timeline.setSpeedIndex}
        onReset={timeline.resetTimeline}
      />

      <AlertsTicker alerts={alerts} />
    </div>
  );
}
