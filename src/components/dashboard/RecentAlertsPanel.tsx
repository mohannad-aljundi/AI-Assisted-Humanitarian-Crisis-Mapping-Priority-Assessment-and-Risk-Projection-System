import Link from "next/link";
import type { DashboardAlert } from "@/types";
import { AlertCard } from "@/components/alerts/AlertCard";
import { SectionCard } from "@/components/ui/SectionCard";

interface RecentAlertsPanelProps {
  alerts: DashboardAlert[];
}

export function RecentAlertsPanel({ alerts }: RecentAlertsPanelProps) {
  return (
    <SectionCard
      title="Recent Alerts"
      description="Smart alerts from crisis analysis and multi-source verification."
      action={
        <Link href="/alerts" className="text-sm text-blue-400 hover:text-blue-300">
          View All
        </Link>
      }
    >
      {alerts.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No alerts yet. Run ingestion or analyse reports to generate alerts.
        </p>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 5).map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
