import { AppTopBar } from "@/components/ui/AppTopBar";
import { AlertsListPanel } from "@/components/alerts/AlertsListPanel";
import { AlertsTicker } from "@/components/ui/AlertsTicker";
import { alertService } from "@/services/alertService";
import { pageContainer } from "@/lib/uiClasses";
import { logPerfRouteLoaded } from "@/lib/perfLogs";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  logPerfRouteLoaded("/alerts");
  const tickerAlerts = await alertService.getRecentAlerts(8);

  return (
    <div className="flex min-h-screen flex-col pb-16">
      <AppTopBar title="Crisis Alerts" showAddReport={false} alertCount={tickerAlerts.length} />
      <div className={`app-page-content ${pageContainer} flex-1`}>
        <AlertsListPanel />
      </div>
      <AlertsTicker alerts={tickerAlerts} />
    </div>
  );
}
