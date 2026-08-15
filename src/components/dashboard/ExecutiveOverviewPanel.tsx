import type { ExecutiveOverview } from "@/types";
import { LocationWithFlag } from "@/components/ui/CountryFlag";
import { SectionCard } from "@/components/ui/SectionCard";

interface ExecutiveOverviewPanelProps {
  overview: ExecutiveOverview;
}

export function ExecutiveOverviewPanel({ overview }: ExecutiveOverviewPanelProps) {
  const items = [
    { label: "Active Crises", value: overview.activeCrises, accent: "text-red-400" },
    { label: "Critical Incidents", value: overview.criticalIncidents, accent: "text-orange-400" },
    { label: "High Risk Zones", value: overview.highRiskZones, accent: "text-yellow-400" },
    {
      label: "Most Affected Region",
      value: overview.mostAffectedRegion ?? "—",
      accent: "text-cyan-400",
      isText: true,
      isLocation: true,
    },
    {
      label: "Most Reliable Incident",
      value: overview.mostReliableIncident
        ? `${overview.mostReliableIncident.title.slice(0, 40)}… (${Math.round(overview.mostReliableIncident.score * 100)}%)`
        : "—",
      accent: "text-emerald-400",
      isText: true,
    },
    {
      label: "Highest Risk Location",
      value: overview.highestRiskLocation ?? "—",
      accent: "text-red-300",
      isText: true,
      isLocation: true,
    },
  ];

  return (
    <SectionCard
      title="Global Crisis Overview"
      description="Operational intelligence summary for humanitarian coordination."
    >
      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex h-full flex-col rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-4 transition hover:border-white/20"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {item.label}
            </p>
            <p className={`mt-2 text-lg font-semibold ${item.accent} ${item.isText ? "line-clamp-2 text-sm" : ""}`}>
              {item.isLocation && typeof item.value === "string" && item.value !== "—" ? (
                <LocationWithFlag location={item.value} />
              ) : (
                item.value
              )}
            </p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
