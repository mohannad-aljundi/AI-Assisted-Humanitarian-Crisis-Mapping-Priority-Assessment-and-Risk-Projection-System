import Link from "next/link";
import type { DashboardAlert } from "@/types";
import { CountryFlag } from "@/components/ui/CountryFlag";

interface AlertsTickerProps {
  alerts: DashboardAlert[];
}

export function AlertsTicker({ alerts }: AlertsTickerProps) {
  const items = alerts.slice(0, 4);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#060a13]/95 backdrop-blur-xl" data-alerts-ticker>
      <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:px-8">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Alerts &amp; Notifications
          </span>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2 overflow-x-auto text-sm">
          {items.length === 0 ? (
            <span className="text-slate-500">No active alerts</span>
          ) : (
            items.map((alert) => (
              <Link
                key={alert.id}
                href="/alerts"
                className="flex items-center gap-2 whitespace-nowrap text-slate-300 transition hover:text-white"
              >
                <span className={`h-2 w-2 rounded-full ${riskDotClass(alert.riskLevel)}`} />
                <CountryFlag country={alert.country} className="text-sm" />
                <span>{alert.title}</span>
                <span className="text-xs text-slate-500">
                  {new Date(alert.createdAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </Link>
            ))
          )}
        </div>
        <Link
          href="/alerts"
          className="shrink-0 text-sm font-medium text-blue-400 hover:text-blue-300"
        >
          View All
        </Link>
      </div>
    </div>
  );
}

function riskDotClass(riskLevel: DashboardAlert["riskLevel"]): string {
  switch (riskLevel) {
    case "Critical":
      return "bg-red-400";
    case "High":
      return "bg-orange-400";
    case "Medium":
      return "bg-yellow-400";
    default:
      return "bg-blue-400";
  }
}
