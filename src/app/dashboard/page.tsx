import { dashboardService } from "@/services/dashboardService";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { createPerfTrace, endPerfTrace, perfStageTimed } from "@/lib/perfTrace";
import { logPerfRouteLoaded } from "@/lib/perfLogs";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const traceId = createPerfTrace("/dashboard");
  logPerfRouteLoaded("/dashboard");

  const core = await perfStageTimed(traceId, "server:getDashboardCoreData", () =>
    dashboardService.getDashboardCoreData({ bypassCache: true })
  );

  endPerfTrace(traceId, "/dashboard", {
    recentAlerts: core.recentAlerts.length,
    payloadBytes: JSON.stringify(core).length,
  });

  return <DashboardView core={core} />;
}
