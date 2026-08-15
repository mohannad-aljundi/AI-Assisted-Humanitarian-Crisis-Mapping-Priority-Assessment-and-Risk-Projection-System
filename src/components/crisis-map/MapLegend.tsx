"use client";

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readAppHeaderHeightPx } from "@/hooks/useAppHeaderHeight";
import { RISK_ZONE_COLORS } from "@/lib/mapConstants";
import {
  CRISIS_ICON_LABELS,
  CrisisHubIcon,
  getLegendIconKeysFromZones,
  LEGEND_HUB_PX,
  LEGEND_SVG_PX,
} from "@/lib/crisisIcons";
import { getCrisisIconKeyColor } from "@/lib/crisisTypeColors";
import type { MapRiskZone } from "@/types";
import type { RiskLevel } from "@prisma/client";

const RISK_LEVELS: RiskLevel[] = ["Critical", "High", "Medium", "Low"];

interface MapLegendProps {
  floating?: boolean;
  variant?: "floating" | "sidebar";
  zones?: MapRiskZone[];
  /** Distance from the top of the map shell (px). */
  topInset?: number;
  /** Distance from the bottom of the map shell (px). */
  bottomInset?: number;
}

function LegendSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="map-legend-section-title sticky top-0 z-[1] -mx-4 mb-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </p>
  );
}

function useLegendMaxHeight(
  enabled: boolean,
  topInset: number,
  bottomInset: number,
  anchorRef: React.RefObject<HTMLDivElement | null>
) {
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;

    const compute = () => {
      const shell =
        anchorRef.current?.closest("[data-map-shell]") ??
        anchorRef.current?.offsetParent;

      if (!shell || !(shell instanceof HTMLElement)) return;

      const shellHeight = shell.getBoundingClientRect().height;
      const shellBased = shellHeight - topInset - bottomInset;

      const headerHeight =
        readAppHeaderHeightPx() ||
        (document.querySelector("[data-app-top-bar]")?.getBoundingClientRect().height ?? 0);
      const ticker = document.querySelector("[data-alerts-ticker]");
      const kpi = document.querySelector("[data-map-kpi-bar]");
      const tickerHeight = ticker?.getBoundingClientRect().height ?? 0;
      const kpiHeight = kpi?.getBoundingClientRect().height ?? 0;
      const margins = topInset + bottomInset;
      const viewportBased =
        window.innerHeight - headerHeight - tickerHeight - kpiHeight - margins;

      setMaxHeight(Math.max(160, Math.min(shellBased, viewportBased)));
    };

    compute();

    const shell = anchorRef.current?.closest("[data-map-shell]");
    const observer = new ResizeObserver(compute);
    if (shell instanceof HTMLElement) observer.observe(shell);
    observer.observe(document.documentElement);

    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [enabled, topInset, bottomInset, anchorRef]);

  return maxHeight;
}

export const MapLegend = memo(function MapLegend({
  floating = false,
  variant = floating ? "floating" : "sidebar",
  zones = [],
  topInset = 16,
  bottomInset = 16,
}: MapLegendProps) {
  const [collapsed, setCollapsed] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const isFloating = variant === "floating";
  const maxHeight = useLegendMaxHeight(isFloating, topInset, bottomInset, anchorRef);

  const activeIconKeys = useMemo(
    () => getLegendIconKeysFromZones(zones),
    [zones]
  );

  const legendBody = (
    <div
      className={
        isFloating
          ? "map-legend-panel glass-panel pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden"
          : "flex min-h-0 flex-col overflow-hidden"
      }
      style={
        isFloating && maxHeight
          ? { maxHeight, height: collapsed ? undefined : maxHeight }
          : undefined
      }
    >
      {isFloating ? (
        <div className="map-legend-header shrink-0 border-b border-white/5 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-white">Legend</p>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="map-control-btn px-2 py-0.5 text-xs"
            >
              {collapsed ? "Show" : "Hide"}
            </button>
          </div>
        </div>
      ) : (
        <p className="map-side-panel__section-title mb-2 px-1">Legend & Crisis Types</p>
      )}

      {(!isFloating || !collapsed) && (
        <div
          className={
            isFloating
              ? "map-legend-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-3"
              : "map-legend-scroll min-h-0 overflow-y-auto overflow-x-hidden px-1 pb-2"
          }
        >
          <section>
            <LegendSectionTitle>Incident Types on Map</LegendSectionTitle>
            {activeIconKeys.length === 0 ? (
              <p className="mb-4 text-[11px] text-slate-500">No incidents visible</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {activeIconKeys.map((key) => (
                  <li key={key} className="flex items-center gap-2.5 text-[11px] text-slate-300">
                    <CrisisHubIcon
                      iconKey={key}
                      riskLevel="Medium"
                      hubSize={LEGEND_HUB_PX}
                      svgSize={LEGEND_SVG_PX}
                    />
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: getCrisisIconKeyColor(key) }}
                      aria-hidden
                    />
                    {CRISIS_ICON_LABELS[key]}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <LegendSectionTitle>Risk Levels</LegendSectionTitle>
            <ul className="mb-4 space-y-2">
              {RISK_LEVELS.map((level) => (
                <li key={level} className="flex items-center gap-2.5 text-[11px] text-slate-300">
                  <CrisisHubIcon
                    iconKey="pin"
                    riskLevel={level}
                    hubSize={LEGEND_HUB_PX}
                    svgSize={LEGEND_SVG_PX}
                  />
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: RISK_ZONE_COLORS[level] }}
                  />
                  {level}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <LegendSectionTitle>Verification</LegendSectionTitle>
            <ul className="space-y-2 text-[11px] text-slate-300">
              <li className="flex items-center gap-2">
                <CrisisHubIcon
                  iconKey="conflict"
                  riskLevel="High"
                  verificationStatus="Verified"
                  hubSize={LEGEND_HUB_PX}
                  svgSize={LEGEND_SVG_PX}
                />
                Verified (green border)
              </li>
              <li className="flex items-center gap-2">
                <CrisisHubIcon
                  iconKey="conflict"
                  riskLevel="High"
                  verificationStatus="Single Source"
                  hubSize={LEGEND_HUB_PX}
                  svgSize={LEGEND_SVG_PX}
                />
                Single source (grey border)
              </li>
              <li className="flex items-center gap-2">
                <CrisisHubIcon
                  iconKey="conflict"
                  riskLevel="High"
                  verificationStatus="Conflicting Sources"
                  hubSize={LEGEND_HUB_PX}
                  svgSize={LEGEND_SVG_PX}
                />
                Conflicting sources (red border)
              </li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );

  if (!isFloating) {
    return legendBody;
  }

  return (
    <div
      ref={anchorRef}
      className="pointer-events-none absolute left-4 z-[1000] w-60 max-w-[calc(100%-2rem)]"
      style={{ top: topInset, bottom: bottomInset }}
    >
      {legendBody}
    </div>
  );
});
