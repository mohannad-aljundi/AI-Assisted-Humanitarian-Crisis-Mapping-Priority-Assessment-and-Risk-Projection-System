import Link from "next/link";
import { HumanitarianNeedLabel } from "@/components/humanitarian/HumanitarianNeedIcon";
import type { MapRiskZone } from "@/types";
import { CrisisIcon } from "@/components/crisis/CrisisIcon";
import { CrisisTypeBadge } from "@/components/ui/CrisisTypeBadge";
import { RiskBadge, StatusBadge } from "@/components/ui/badges";
import { CountryName } from "@/components/ui/CountryFlag";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScoreBar } from "@/components/analysis/shared";

interface IncidentDetailsPanelProps {
  zone: MapRiskZone | null;
}

export function IncidentDetailsPanel({ zone }: IncidentDetailsPanelProps) {
  return (
    <SectionCard title="Incident Details" description="Selected risk zone intelligence.">
      {!zone ? (
        <p className="text-sm text-slate-500">
          Select a risk zone on the map to view details.
        </p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3">
            <CrisisIcon
              iconKey={zone.crisisIconKey}
              crisisType={zone.crisisType}
              riskLevel={zone.riskLevel}
              size={24}
              className="h-12 w-12 rounded-2xl"
            />
            <div>
              <div className="font-semibold text-white">{zone.displayLocation}</div>
              <div className="text-xs text-slate-500">
                <CrisisTypeBadge crisisType={zone.crisisType ?? "Unknown"} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-slate-500">Region</div>
              <div className="font-medium text-slate-200">
                {zone.regionLabel ?? zone.displayLocation}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Country</div>
              <div className="font-medium text-slate-200">
                <CountryName country={zone.countryName} />
              </div>
            </div>
            <div>
              <div className="text-slate-500">Crisis Type</div>
              <div className="mt-1 font-medium text-slate-200">
                <CrisisTypeBadge crisisType={zone.crisisType ?? "Unknown"} />
              </div>
            </div>
            <div>
              <div className="text-slate-500">Affected Radius</div>
              <div className="font-medium text-slate-200">
                {Math.round(zone.radiusMeters / 1000)} km
              </div>
            </div>
          </div>

          {zone.relatedLocations.length > 1 && (
            <div>
              <div className="mb-2 text-slate-500">Related Locations</div>
              <ul className="space-y-1 text-slate-300">
                {zone.relatedLocations.map((location) => (
                  <li key={location.name}>{location.name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <RiskBadge level={zone.riskLevel} />
            {zone.priorityLevel && <StatusBadge level={zone.priorityLevel} />}
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
              {zone.verificationStatus}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500">Coordinates </span>
              <span className="text-slate-300">
                {zone.latitude.toFixed(3)}, {zone.longitude.toFixed(3)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Precision </span>
              <span className="text-slate-300 capitalize">
                {zone.coordinatePrecision.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {zone.reliabilityScore !== null && (
            <ScoreBar label="Reliability Score" value={zone.reliabilityScore} />
          )}

          <div>
            <div className="text-slate-500">Affected Population</div>
            <div className="font-medium text-slate-200">
              {zone.affectedPopulation?.toLocaleString() ?? "Unknown"}
            </div>
          </div>

          <div>
            <div className="mb-2 text-slate-500">Humanitarian Needs</div>
            {zone.humanitarianNeeds.length === 0 ? (
              <p className="text-slate-500">None recorded</p>
            ) : (
              <ul className="space-y-2 text-slate-300">
                {zone.humanitarianNeeds.map((need) => (
                  <li
                    key={`${need.needType}-${need.severity}`}
                    className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <HumanitarianNeedLabel needType={need.needType} />
                      {need.source && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            need.source === "Inferred"
                              ? "text-violet-300"
                              : "text-emerald-300"
                          }`}
                        >
                          {need.source}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">({need.severity})</span>
                      {need.confidence !== undefined && (
                        <span className="text-xs text-slate-500">
                          {Math.round(need.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    {need.evidence && (
                      <p className="mt-1 text-xs text-slate-500">{need.evidence}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {zone.reportId && (
            <Link
              href={`/incidents/${zone.reportId}`}
              className="inline-flex text-sm font-medium text-blue-400 hover:text-blue-300"
            >
              View Incident Intelligence →
            </Link>
          )}
        </div>
      )}
    </SectionCard>
  );
}
