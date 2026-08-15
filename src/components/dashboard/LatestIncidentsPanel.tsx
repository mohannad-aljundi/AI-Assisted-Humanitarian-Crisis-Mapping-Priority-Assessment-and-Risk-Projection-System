import Link from "next/link";
import type { DashboardIncident } from "@/types";
import { IncidentCard } from "@/components/dashboard/IncidentCard";
import { SectionCard } from "@/components/ui/SectionCard";
import { alertError } from "@/lib/uiClasses";

interface LatestIncidentsPanelProps {
  incidents: DashboardIncident[];
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

export function LatestIncidentsPanel({
  incidents,
  isLoading = false,
  error = null,
  className = "",
}: LatestIncidentsPanelProps) {
  return (
    <SectionCard
      title="Recent Incidents"
      description="Latest analysed humanitarian events"
      className={`flex h-full min-h-[320px] flex-col ${className}`}
      fill
      action={
        <Link
          href="/crisis-map"
          className="text-sm font-medium text-blue-400 transition hover:text-blue-300"
        >
          View Map
        </Link>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-[88px] animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
            />
          ))}
        </div>
      ) : error ? (
        <div className={alertError}>{error}</div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
          No incidents available from persisted analysis records yet.
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
          {incidents.slice(0, 5).map((incident) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
