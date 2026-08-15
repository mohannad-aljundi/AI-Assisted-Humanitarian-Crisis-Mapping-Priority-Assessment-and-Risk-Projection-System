"use client";

import { DashboardLiveProvider } from "@/contexts/DashboardLiveContext";
import { DashboardMapLoader } from "@/components/dashboard/DashboardMapLoader";
import { DashboardPanelsLoader } from "@/components/dashboard/DashboardPanelsLoader";
import type { DashboardCoreData } from "@/types";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { CurrentProcessingCard } from "@/components/analysis/CurrentProcessingCard";
import { LastSuccessfulSyncCard } from "@/components/analysis/LastSuccessfulSyncCard";
import { ProcessingQueuePanel } from "@/components/analysis/ProcessingQueuePanel";
import { RecentlyCompletedIntelligencePanel } from "@/components/analysis/RecentlyCompletedIntelligencePanel";
import { DashboardAlertsTickerLoader } from "@/components/dashboard/DashboardAlertsTickerLoader";
import { KPIStatCard } from "@/components/ui/KPIStatCard";
import { dashboardMain } from "@/lib/uiClasses";

interface DashboardPageContentProps {
  core: DashboardCoreData;
}

export function DashboardPageContent({ core }: DashboardPageContentProps) {
  const { stats, sparklines, trends } = core;

  return (
    <DashboardLiveProvider>
      <div className="flex min-h-screen flex-col pb-14">
        <DashboardHeader alertCount={core.recentAlerts.length} />

        <main className={`${dashboardMain} app-page-content`}>
          <section
            className="grid gap-4 xl:grid-cols-12"
            aria-label="AI intelligence operations center"
          >
            <div className="xl:col-span-5">
              <ProcessingQueuePanel />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:col-span-3 xl:grid-cols-1">
              <CurrentProcessingCard />
              <LastSuccessfulSyncCard />
            </div>
            <div className="xl:col-span-4">
              <RecentlyCompletedIntelligencePanel />
            </div>
          </section>

          <section className="enterprise-kpi-grid" aria-label="Key metrics">
            <KPIStatCard
              label="Total Incidents"
              value={stats.totalReportsAnalysed.toLocaleString()}
              trendPercent={trends.totalReports}
              sparkline={sparklines.totalReports}
              accent="blue"
            />
            <KPIStatCard
              label="Active Crises"
              value={stats.activeCrises}
              trendPercent={trends.activeIncidents}
              sparkline={sparklines.activeIncidents}
              accent="red"
            />
            <KPIStatCard
              label="Critical Incidents"
              value={stats.criticalPriorityIncidents}
              trendPercent={trends.highPriority}
              sparkline={sparklines.highPriority}
              accent="orange"
            />
            <KPIStatCard
              label="Crisis Zones"
              value={stats.criticalRiskZones}
              trendPercent={trends.criticalRiskZones}
              sparkline={sparklines.criticalRiskZones}
              accent="yellow"
            />
            <KPIStatCard
              label="Reliability"
              value={`${Math.round(stats.averageReliabilityScore * 100)}%`}
              trendPercent={trends.reliability}
              sparkline={sparklines.reliability}
              accent="green"
            />
            <KPIStatCard
              label="Sources"
              value={core.connectedSources}
              accent="purple"
            />
            <KPIStatCard
              label="Reports Today"
              value={core.reportsToday}
              accent="blue"
            />
            <KPIStatCard
              label="People Affected"
              value={stats.totalAffectedPopulation.toLocaleString()}
              trendPercent={trends.peopleAffected}
              sparkline={sparklines.peopleAffected}
              accent="purple"
            />
          </section>

          <section className="dashboard-section">
            <DashboardMapLoader />
          </section>

          <DashboardPanelsLoader recentAlerts={core.recentAlerts} />
        </main>

        <DashboardAlertsTickerLoader initialAlerts={core.recentAlerts} />
      </div>
    </DashboardLiveProvider>
  );
}
