"use client";

import { memo } from "react";
import {
  Clock,
  Filter,
  Layers3,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { iconProps } from "@/components/ui/AppIcon";
import { MapLegend } from "@/components/crisis-map/MapLegend";
import type { MapRiskZone } from "@/types";

interface MapCommandLeftRailProps {
  expanded: boolean;
  onToggle: () => void;
  zones: MapRiskZone[];
  onOpenTimeline: () => void;
  hasTimeline: boolean;
}

export const MapCommandLeftRail = memo(function MapCommandLeftRail({
  expanded,
  onToggle,
  zones,
  onOpenTimeline,
  hasTimeline,
}: MapCommandLeftRailProps) {
  return (
    <aside
      className={`map-command-rail map-command-rail--left ${
        expanded ? "map-command-rail--expanded" : ""
      }`}
    >
      <div className="map-command-rail__icons">
        <RailIconButton
          label={expanded ? "Collapse panel" : "Expand legend"}
          onClick={onToggle}
          active={expanded}
        >
          {expanded ? (
            <PanelLeftClose {...iconProps} size={18} />
          ) : (
            <PanelLeftOpen {...iconProps} size={18} />
          )}
        </RailIconButton>
        <RailIconButton label="Legend & crisis types" onClick={onToggle} active={expanded}>
          <Layers3 {...iconProps} size={18} />
        </RailIconButton>
        <RailIconButton label="Risk levels" onClick={onToggle} active={expanded}>
          <Map {...iconProps} size={18} />
        </RailIconButton>
        {hasTimeline ? (
          <RailIconButton label="Open timeline" onClick={onOpenTimeline}>
            <Clock {...iconProps} size={18} />
          </RailIconButton>
        ) : null}
      </div>

      {expanded ? (
        <div className="map-command-rail__body">
          <p className="map-command-rail__heading">Situation Overview</p>
          <MapLegend variant="sidebar" zones={zones} />
        </div>
      ) : null}
    </aside>
  );
});

interface MapCommandRightRailProps {
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const MapCommandRightRail = memo(function MapCommandRightRail({
  expanded,
  onToggle,
  children,
}: MapCommandRightRailProps) {
  return (
    <aside
      className={`map-command-rail map-command-rail--right ${
        expanded ? "map-command-rail--expanded" : ""
      }`}
    >
      <div className="map-command-rail__icons">
        <RailIconButton
          label={expanded ? "Collapse filters" : "Expand filters"}
          onClick={onToggle}
          active={expanded}
        >
          {expanded ? (
            <PanelRightClose {...iconProps} size={18} />
          ) : (
            <PanelRightOpen {...iconProps} size={18} />
          )}
        </RailIconButton>
        <RailIconButton label="Intelligence filters" onClick={onToggle} active={expanded}>
          <Filter {...iconProps} size={18} />
        </RailIconButton>
      </div>

      {expanded ? (
        <div className="map-command-rail__body map-command-rail__body--filters">{children}</div>
      ) : null}
    </aside>
  );
});

function RailIconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`map-command-rail__icon-btn ${active ? "map-command-rail__icon-btn--active" : ""}`}
    >
      {children}
    </button>
  );
}
