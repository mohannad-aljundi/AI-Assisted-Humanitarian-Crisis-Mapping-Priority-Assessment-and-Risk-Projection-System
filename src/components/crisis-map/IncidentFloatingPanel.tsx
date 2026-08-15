"use client";

import { memo } from "react";
import Link from "next/link";
import type { MapRiskZone } from "@/types";
import { HumanitarianNeedLabel } from "@/components/humanitarian/HumanitarianNeedIcon";
import { formatHumanitarianNeedsList } from "@/lib/humanitarianNeedIcons";
import { formatIncidentLocation } from "@/lib/locationDisplay";
import { CrisisIcon } from "@/components/crisis/CrisisIcon";
import { CountryName } from "@/components/ui/CountryFlag";
import { CrisisTypeBadge } from "@/components/ui/CrisisTypeBadge";
import { RiskBadge, StatusBadge } from "@/components/ui/badges";

interface IncidentFloatingPanelProps {
  zone: MapRiskZone | null;
  onClose: () => void;
}

function buildClientSummary(zone: MapRiskZone): string {
  const needs =
    zone.humanitarianNeeds.length > 0
      ? formatHumanitarianNeedsList(zone.humanitarianNeeds.map((n) => n.needType))
      : "no specific needs identified";
  const where =
    formatIncidentLocation(zone.cityName, zone.countryName) ?? "an unknown location";
  return `${zone.crisisType ?? "Humanitarian"} incident in ${where}. Priority: ${zone.priorityLevel ?? "N/A"}. Primary needs: ${needs}. Risk trend: ${zone.trend}.`;
}

export const IncidentFloatingPanel = memo(function IncidentFloatingPanel({
  zone,
  onClose,
}: IncidentFloatingPanelProps) {
  if (!zone) return null;

  const locationLabel =
    formatIncidentLocation(zone.cityName, zone.countryName) ?? "Unknown Location";

  return (
    <aside className="incident-panel animate-slide-in-right pointer-events-auto absolute bottom-4 right-4 top-20 z-[1001] flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden md:top-24">
      <div className="glass-panel flex h-full flex-col overflow-hidden border-white/15 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <CrisisIcon
              iconKey={zone.crisisIconKey}
              crisisType={zone.crisisType}
              riskLevel={zone.riskLevel}
              size={22}
              className="h-11 w-11 shrink-0 rounded-xl"
            />
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white">
                {zone.reportTitle ?? zone.displayLocation}
              </h2>
              <div className="mt-1">
                <CrisisTypeBadge crisisType={zone.crisisType ?? "Unknown"} />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="map-control-btn shrink-0 px-2 py-1 text-lg leading-none"
            aria-label="Close panel"
          >
            ×
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          <Section title="Location">
            <InfoRow label="Location" value={locationLabel} />
            {zone.locationVerified && zone.countryName ? (
              <InfoRow label="Country" value={zone.countryName} country />
            ) : null}
            <InfoRow
              label="Coordinates"
              value={`${zone.latitude.toFixed(4)}, ${zone.longitude.toFixed(4)}`}
            />
          </Section>

          <Section title="Assessment">
            <div className="flex flex-wrap gap-2">
              {zone.priorityLevel && <StatusBadge level={zone.priorityLevel} />}
              <RiskBadge level={zone.riskLevel} />
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-slate-300">
                {zone.verificationStatus}
              </span>
            </div>
            <InfoRow
              label="Reliability"
              value={
                zone.reliabilityScore !== null
                  ? `${Math.round(zone.reliabilityScore * 100)}%`
                  : "N/A"
              }
            />
          </Section>

          <Section title="AI Summary">
            <p className="leading-relaxed text-slate-300">{buildClientSummary(zone)}</p>
          </Section>

          <Section title="Humanitarian Needs">
            {zone.humanitarianNeeds.length === 0 ? (
              <p className="text-slate-500">No needs identified from available evidence.</p>
            ) : (
              <ul className="space-y-2">
                {zone.humanitarianNeeds.map((need) => (
                  <li
                    key={`${need.needType}-${need.severity}`}
                    className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <HumanitarianNeedLabel
                          needType={need.needType}
                          labelClassName="text-slate-200"
                        />
                        {need.source && (
                          <span className="text-[10px] uppercase text-violet-300">
                            {need.source}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {need.severity}
                        {need.confidence !== undefined
                          ? ` · ${Math.round(need.confidence * 100)}%`
                          : ""}
                      </span>
                    </div>
                    {need.evidence && (
                      <p className="mt-1 text-xs text-slate-500">{need.evidence}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Risk Prediction">
            <InfoRow label="Current Risk" value={zone.riskLevel} />
            <InfoRow label="Trend" value={zone.trend} />
            <InfoRow
              label="Confidence"
              value={`${Math.round(zone.confidenceScore * 100)}%`}
            />
          </Section>

          <Section title="Timeline">
            <div className="border-l border-white/10 pl-4">
              <p className="text-xs text-blue-400">
                {zone.reportDate
                  ? new Date(zone.reportDate).toLocaleString()
                  : "Date unavailable"}
              </p>
              <p className="mt-1 text-slate-300">Incident reported and analysed</p>
              {zone.trend !== "Stable" && (
                <p className="mt-2 text-xs text-orange-300">Risk trend: {zone.trend}</p>
              )}
            </div>
          </Section>

          <Section title="Sources">
            <div className="flex flex-wrap gap-2">
              {zone.sourceNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-200"
                >
                  {name}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Published">
            <InfoRow
              label="Report Date"
              value={
                zone.reportDate
                  ? new Date(zone.reportDate).toLocaleDateString()
                  : "N/A"
              }
            />
          </Section>
        </div>

        {zone.reportId && (
          <footer className="border-t border-white/10 px-5 py-4">
            <Link
              href={`/incidents/${zone.reportId}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600/90 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              Open Full Analysis
            </Link>
          </footer>
        )}
      </div>
    </aside>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  country,
}: {
  label: string;
  value: string;
  country?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-200">
        {country ? <CountryName country={value} /> : value}
      </span>
    </div>
  );
}
