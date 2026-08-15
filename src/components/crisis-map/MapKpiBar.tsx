"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { MapRiskZone } from "@/types";

interface MapKpiBarProps {
  zones: MapRiskZone[];
  visibleCount: number;
}

function AnimatedValue({ value }: { value: string | number }) {
  const [pulse, setPulse] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      setPulse(true);
      prev.current = value;
      const t = setTimeout(() => setPulse(false), 600);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span className={`kpi-value ${pulse ? "kpi-value--pulse" : ""}`}>{value}</span>
  );
}

function deriveKpis(zones: MapRiskZone[], visibleCount: number) {
  const critical = zones.filter((z) => z.riskLevel === "Critical").length;
  const countries = new Set(
    zones.map((z) => z.countryName).filter((c) => c && c !== "—")
  ).size;
  const verified = zones.filter((z) => z.verificationStatus === "Verified").length;
  const reliabilities = zones
    .map((z) => z.reliabilityScore)
    .filter((r): r is number => r !== null);
  const avgReliability =
    reliabilities.length > 0
      ? Math.round(
          (reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length) * 100
        )
      : 0;
  const dates = zones
    .map((z) => z.reportDate)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  const lastUpdated =
    dates.length > 0
      ? new Date(Math.max(...dates)).toLocaleString()
      : "—";

  return {
    activeIncidents: visibleCount,
    criticalIncidents: critical,
    countriesAffected: countries,
    verifiedReports: verified,
    averageReliability: `${avgReliability}%`,
    lastUpdated,
  };
}

export const MapKpiBar = memo(function MapKpiBar({
  zones,
  visibleCount,
}: MapKpiBarProps) {
  const kpis = deriveKpis(zones, visibleCount);

  const cards = [
    { label: "Active Incidents", value: kpis.activeIncidents, accent: "blue" },
    { label: "Critical", value: kpis.criticalIncidents, accent: "red" },
    { label: "Countries Affected", value: kpis.countriesAffected, accent: "cyan" },
    { label: "Verified Reports", value: kpis.verifiedReports, accent: "emerald" },
    { label: "Avg. Reliability", value: kpis.averageReliability, accent: "violet" },
  ] as const;

  return (
    <div className="glass-panel mb-4 grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-5" data-map-kpi-bar>
      {cards.map((card) => (
        <div key={card.label} className={`kpi-card kpi-card--${card.accent}`}>
          <p className="kpi-card__label">{card.label}</p>
          <p className="kpi-card__value">
            <AnimatedValue value={card.value} />
          </p>
        </div>
      ))}
    </div>
  );
});
