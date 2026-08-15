import { AnalysisReportsPanel } from "@/components/analysis/AnalysisReportsPanel";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { pageContainer } from "@/lib/uiClasses";
import { logPerfRouteLoaded } from "@/lib/perfLogs";

export const dynamic = "force-dynamic";

export default async function AnalysisIndexPage() {
  logPerfRouteLoaded("/analysis");
  return (
    <div className="flex min-h-screen flex-col">
      <AppTopBar title="Analysis Results" />
      <div className={`app-page-content ${pageContainer}`}>
        <AnalysisReportsPanel />
      </div>
    </div>
  );
}
