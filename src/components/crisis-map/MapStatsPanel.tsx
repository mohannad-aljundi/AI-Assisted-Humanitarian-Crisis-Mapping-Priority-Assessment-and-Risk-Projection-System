import type { MapStatistics } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";

interface MapStatsPanelProps {
  statistics: MapStatistics;
  visibleZones: number;
}

export function MapStatsPanel({ statistics, visibleZones }: MapStatsPanelProps) {
  return (
    <SectionCard title="Map Statistics" description="Live geospatial metrics.">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <dt className="text-slate-500">Visible</dt>
          <dd className="text-xl font-semibold text-white">{visibleZones}</dd>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <dt className="text-slate-500">Total Zones</dt>
          <dd className="text-xl font-semibold text-white">{statistics.totalZones}</dd>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
          <dt className="text-red-300">Critical</dt>
          <dd className="text-xl font-semibold text-red-200">{statistics.criticalZones}</dd>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3">
          <dt className="text-orange-300">High</dt>
          <dd className="text-xl font-semibold text-orange-200">{statistics.highZones}</dd>
        </div>
        <div className="col-span-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3">
          <dt className="text-yellow-300">Affected Population</dt>
          <dd className="text-xl font-semibold text-yellow-100">
            {statistics.totalAffectedPopulation.toLocaleString()}
          </dd>
        </div>
      </dl>
    </SectionCard>
  );
}
