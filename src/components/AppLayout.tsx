import { AppSidebar } from "@/components/ui/AppSidebar";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { NavigationPerfTracker } from "@/components/perf/NavigationPerfTracker";
import { AnalysisCompletedToasts } from "@/components/analysis/AnalysisCompletedToasts";
import { AnalysisLiveProvider } from "@/contexts/AnalysisLiveContext";
import { SyncProvider } from "@/contexts/SyncMonitoringContext";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SyncProvider>
      <AnalysisLiveProvider>
        <NavigationPerfTracker />
        <div className="min-h-screen bg-[#070b14]">
          <AppSidebar />
          <div className="lg:pl-[260px]">
            <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.08),_transparent_50%),linear-gradient(180deg,#070b14_0%,#0a1120_50%,#0d1528_100%)]">
              <ErrorBoundary>{children}</ErrorBoundary>
            </div>
          </div>
          <AnalysisCompletedToasts />
        </div>
      </AnalysisLiveProvider>
    </SyncProvider>
  );
}
