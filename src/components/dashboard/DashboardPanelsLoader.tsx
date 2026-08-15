"use client";

import { useDashboardLive } from "@/contexts/DashboardLiveContext";
import type { DashboardAlert } from "@/types";
import { SectionSkeleton } from "@/components/incidents/IncidentSectionSkeletons";
import { CountryDistributionChart } from "@/components/dashboard/CountryDistributionChart";
import { CriticalIncidentsPanel } from "@/components/dashboard/CriticalIncidentsPanel";
import { IncidentTypesDonutChart } from "@/components/dashboard/IncidentTypesDonutChart";
import { LatestIncidentsPanel } from "@/components/dashboard/LatestIncidentsPanel";
import { PriorityDistributionPanel } from "@/components/dashboard/PriorityDistributionPanel";
import { RecentAlertsPanel } from "@/components/dashboard/RecentAlertsPanel";
import { ReliabilityDistributionChart } from "@/components/dashboard/ReliabilityDistributionChart";
import { ResearchAnalyticsPanel } from "@/components/dashboard/ResearchAnalyticsPanel";
import { RiskLevelBarChart } from "@/components/dashboard/RiskLevelBarChart";
import { RiskProjectionLineChart } from "@/components/dashboard/RiskProjectionLineChart";
import { SourceStatisticsPanel } from "@/components/dashboard/SourceStatisticsPanel";

interface DashboardPanelsLoaderProps {
  recentAlerts: DashboardAlert[];
}

export function DashboardPanelsLoader({ recentAlerts: initialAlerts }: DashboardPanelsLoaderProps) {
  const { panels, panelsError, panelsLoading } = useDashboardLive();

  if (panelsError) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-slate-400">
        Dashboard panels failed to load. Refresh to try again.
      </div>
    );
  }

  if (!panels) {
    return (
      <div className="space-y-8">
        <section className="enterprise-grid-12">
          <div className="span-4">
            <SectionSkeleton className="h-72" />
          </div>
          <div className="span-4">
            <SectionSkeleton className="h-72" />
          </div>
          <div className="span-4">
            <SectionSkeleton className="h-72" />
          </div>
        </section>
        <section className="enterprise-grid-12">
          <div className="span-4">
            <SectionSkeleton className="h-72" />
          </div>
          <div className="span-4">
            <SectionSkeleton className="h-72" />
          </div>
          <div className="span-4">
            <SectionSkeleton className="h-72" />
          </div>
        </section>
        <section className="enterprise-grid-12">
          <div className="span-8">
            <SectionSkeleton className="h-80" />
          </div>
          <div className="span-4">
            <SectionSkeleton className="h-80" />
          </div>
        </section>
        <section className="enterprise-grid-12">
          <div className="span-6">
            <SectionSkeleton className="h-72" />
          </div>
          <div className="span-6">
            <SectionSkeleton className="h-72" />
          </div>
        </section>
        <SectionSkeleton className="h-64" />
        {panelsLoading ? null : (
          <p className="text-center text-xs text-slate-500">Loading dashboard panels…</p>
        )}
      </div>
    );
  }

  return (
    <>
      <section className="enterprise-grid-12">
        <div className="span-4">
          <CriticalIncidentsPanel incidents={panels.latestIncidents} />
        </div>
        <div className="span-4">
          <PriorityDistributionPanel data={panels.priorityDistribution} />
        </div>
        <div className="span-4">
          <RiskProjectionLineChart points={panels.riskProjectionTrend} />
        </div>
      </section>

      <section className="enterprise-grid-12">
        <div className="span-4">
          <IncidentTypesDonutChart data={panels.crisisTypeDistribution} />
        </div>
        <div className="span-4">
          <CountryDistributionChart data={panels.countryDistribution} />
        </div>
        <div className="span-4">
          <RiskLevelBarChart data={panels.riskDistribution} />
        </div>
      </section>

      <section className="enterprise-grid-12">
        <div className="span-8">
          <LatestIncidentsPanel incidents={panels.latestIncidents} />
        </div>
        <div className="span-4">
          <RecentAlertsPanel alerts={panels.recentAlerts ?? initialAlerts} />
        </div>
      </section>

      <section className="enterprise-grid-12">
        <div className="span-6">
          <ResearchAnalyticsPanel analytics={panels.researchAnalytics} />
        </div>
        <div className="span-6">
          <ReliabilityDistributionChart data={panels.reliabilityDistribution} />
        </div>
      </section>

      <section className="dashboard-section">
        <SourceStatisticsPanel statistics={panels.sourceStatistics} />
      </section>
    </>
  );
}
