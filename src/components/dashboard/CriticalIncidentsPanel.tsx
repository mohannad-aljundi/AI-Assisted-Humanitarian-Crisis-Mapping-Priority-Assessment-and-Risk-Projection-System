import type { DashboardIncident } from "@/types";
import { IncidentCard } from "@/components/dashboard/IncidentCard";
import { SectionCard } from "@/components/ui/SectionCard";

interface CriticalIncidentsPanelProps {
  incidents: DashboardIncident[];
}

export function CriticalIncidentsPanel({ incidents }: CriticalIncidentsPanelProps) {
  const critical = incidents.filter(
    (i) => i.riskLevel === "Critical" || i.priorityLevel === "Critical"
  );

  return (
    <SectionCard
      title="Latest Critical Incidents"
      description="Highest-priority humanitarian events requiring immediate attention"
      className="h-full"
      fill
    >
      {critical.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-500">
          No critical incidents in the latest analysis batch.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {critical.slice(0, 4).map((incident) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
