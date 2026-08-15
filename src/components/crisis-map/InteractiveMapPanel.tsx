"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Maximize2, Minimize2, Target } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MapRiskZone } from "@/types";
import { RISK_ZONE_COLORS } from "@/lib/mapConstants";
import { iconProps } from "@/components/ui/AppIcon";
import type { MapHandle } from "@/components/crisis-map/CrisisMapCanvas";
import { MapLegend } from "@/components/crisis-map/MapLegend";
import { DEFAULT_MAP_LAYERS } from "@/components/crisis-map/MapLayerControls";
import { SectionCard } from "@/components/ui/SectionCard";

const CrisisMapCanvas = dynamic(
  () => import("./CrisisMapCanvas").then((m) => m.CrisisMapCanvas),
  { ssr: false, loading: () => <div className="absolute inset-0 animate-pulse bg-slate-900" /> }
);

interface InteractiveMapPanelProps {
  zones: MapRiskZone[];
  className?: string;
  heightClass?: string;
  showHeader?: boolean;
  variant?: "default" | "embedded";
}

export function InteractiveMapPanel({
  zones,
  className = "",
  heightClass = "min-h-[580px]",
  showHeader = true,
  variant = "default",
}: InteractiveMapPanelProps) {
  const mapRef = useRef<MapHandle>(null);
  const mapShellRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<MapRiskZone | null>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const isEmbedded = variant === "embedded";
  const resolvedHeight = isEmbedded ? "min-h-[460px]" : heightClass;

  const containerClass = fullscreen
    ? "fixed inset-0 z-[2000] flex flex-col bg-[#070b14] p-4"
    : `flex flex-col ${isEmbedded ? "" : `h-full min-h-[580px] ${className}`}`;

  const mapBody = (
    <div
      ref={mapShellRef}
      data-map-shell
      className={`relative flex-1 overflow-hidden ${
        isEmbedded
          ? "min-h-[460px] rounded-xl border border-white/10 bg-[#0b1220]"
          : `rounded-xl border border-white/10 bg-[#0b1220] ${resolvedHeight}`
      } ${fullscreen ? "min-h-0" : ""}`}
      style={{ minHeight: fullscreen ? undefined : isEmbedded ? 460 : 580 }}
    >
      {zones.length === 0 ? (
        <div className="flex h-full min-h-[460px] items-center justify-center text-sm text-slate-500">
          No risk zones — analyse a report first
        </div>
      ) : (
        <>
          <CrisisMapCanvas
            ref={mapRef}
            zones={zones}
            onZoneSelect={setSelectedZone}
            className="absolute inset-0 h-full w-full"
            wrapperClassName="absolute inset-0 h-full w-full"
            useFloatingPanel={false}
            layers={{
              ...DEFAULT_MAP_LAYERS,
              showClusters: zones.length > 1,
            }}
            overlay={<MapLegend floating zones={zones} />}
          />
          {selectedZone && (
            <div className="absolute bottom-3 left-3 right-3 z-[1000] rounded-xl border border-white/10 bg-[#0a1020]/95 p-3 backdrop-blur animate-fade-in-up">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {selectedZone.reportTitle ?? selectedZone.displayLocation}
                  </p>
                  <p className="text-xs text-slate-400">
                    {selectedZone.crisisType} · {selectedZone.priorityLevel ?? "N/A"} priority ·{" "}
                    {selectedZone.riskLevel} risk
                  </p>
                </div>
                {selectedZone.reportId && (
                  <Link
                    href={`/incidents/${selectedZone.reportId}`}
                    className="shrink-0 text-xs font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    View Details →
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className={containerClass}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Crisis Risk Map</h3>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="map-control-btn flex items-center gap-1.5"
          >
            <Minimize2 {...iconProps} size={14} />
            Exit
          </button>
        </div>
        {mapBody}
      </div>
    );
  }

  if (isEmbedded && !fullscreen) {
    return (
      <div className={`enterprise-panel p-4 ${className}`}>
        <div className="enterprise-panel__header">
          <div>
            <h2 className="enterprise-panel__title">Crisis Risk Map</h2>
            <p className="enterprise-panel__meta">
              {zones.length} active zone{zones.length !== 1 ? "s" : ""} — interactive
              situational awareness
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <MapActionBtn label="Fit All" onClick={() => mapRef.current?.fitAll()} />
            {selectedZone && (
              <MapActionBtn
                label="Zoom"
                icon={<Target {...iconProps} size={14} />}
                onClick={() => mapRef.current?.zoomToZone(selectedZone)}
              />
            )}
            <MapActionBtn
              label="Fullscreen"
              icon={<Maximize2 {...iconProps} size={14} />}
              onClick={() => setFullscreen(true)}
            />
            <Link
              href="/crisis-map"
              className="map-control-btn map-control-btn--primary inline-flex items-center"
            >
              Open Map
            </Link>
          </div>
        </div>
        {mapBody}
      </div>
    );
  }

  return (
    <SectionCard
      title="Crisis Risk Map"
      description={`${zones.length} active zone${zones.length !== 1 ? "s" : ""} — interactive situational awareness`}
      className="flex h-full min-h-[580px] flex-col p-4 sm:p-5"
      fill
      action={
        <div className="flex flex-wrap gap-1.5">
          <MapActionBtn label="Fit All" onClick={() => mapRef.current?.fitAll()} />
          {selectedZone && (
            <MapActionBtn
              label="Zoom"
              icon={<Target {...iconProps} size={14} />}
              onClick={() => mapRef.current?.zoomToZone(selectedZone)}
            />
          )}
          <MapActionBtn
            label="Fullscreen"
            icon={<Maximize2 {...iconProps} size={14} />}
            onClick={() => setFullscreen(true)}
          />
          <Link
            href="/crisis-map"
            className="map-control-btn map-control-btn--primary inline-flex items-center"
          >
            Open Map
          </Link>
        </div>
      }
    >
      {mapBody}
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
        {(["Critical", "High", "Medium", "Low"] as const).map((level) => (
          <span key={level} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: RISK_ZONE_COLORS[level] }}
            />
            {level}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

function MapActionBtn({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="map-control-btn inline-flex items-center gap-1.5"
    >
      {icon}
      {label}
    </button>
  );
}
