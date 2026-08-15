import { percentChange, roundTo } from "@/lib/utils";
import { getCached, setCached } from "@/lib/simpleCache";
import { countConnectedSources } from "@/lib/ingestionSourceRegistry";
import { logPerfCache, logPerfRenderDataSize, withPerfTiming } from "@/lib/perfLogs";
import { getCrisisIconKey } from "@/lib/crisisIcons";
import { resolveLocationParts } from "@/lib/locationDisplay";
import { dashboardRepository } from "@/repositories/dashboardRepository";
import { masterIncidentRepository } from "@/repositories/masterIncidentRepository";
import { mapIntelligenceRecord } from "@/repositories/masterIncidentIntelligenceRepository";
import {
  resolveOperationalForLinkedReport,
  resolveOperationalIntelligence,
} from "@/lib/operationalIntelligenceResolver";
import { alertService } from "@/services/alertService";
import {
  logDashboardCacheLookup,
  logRecentIncidents,
} from "@/services/dashboardRefreshService";
import { researchAnalyticsService } from "@/services/researchAnalyticsService";
import { sourceHealthService } from "@/services/sourceHealthService";
import type {
  DashboardCoreData,
  DashboardData,
  DashboardIncident,
  DashboardPanelsData,
  DashboardRecentReport,
  DashboardSparklines,
  DashboardTrends,
  DistributionItem,
} from "@/types";
import type { PriorityLevel, RiskLevel } from "@prisma/client";

const PRIORITY_TONES: Record<PriorityLevel, DistributionItem["tone"]> = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Critical: "critical",
};

const RISK_TONES: Record<RiskLevel, DistributionItem["tone"]> = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Critical: "critical",
};

const RELIABILITY_TONES = {
  "90-100%": "low",
  "70-89%": "medium",
  "50-69%": "high",
  "Below 50%": "critical",
} as const satisfies Record<string, DistributionItem["tone"]>;

type ReliabilityBucketLabel = keyof typeof RELIABILITY_TONES;

const DASHBOARD_CACHE_TTL_MS = 15_000;
const DASHBOARD_CORE_CACHE_KEY = "dashboard:core";
const DASHBOARD_PANELS_CACHE_KEY = "dashboard:panels";

export class DashboardService {
  async getChartSummaries(): Promise<{
    priorityDistribution: DistributionItem[];
    riskDistribution: DistributionItem[];
  }> {
    const [priorityDistribution, riskDistribution] = await Promise.all([
      dashboardRepository.getPriorityDistribution(),
      dashboardRepository.getRiskDistribution(),
    ]);

    return {
      priorityDistribution: this.toDistribution(priorityDistribution, PRIORITY_TONES),
      riskDistribution: this.toDistribution(riskDistribution, RISK_TONES),
    };
  }

  async getDashboardCoreData(options?: { bypassCache?: boolean }): Promise<DashboardCoreData> {
    if (!options?.bypassCache) {
      const cached = getCached<DashboardCoreData>(DASHBOARD_CORE_CACHE_KEY);
      if (cached) {
        logDashboardCacheLookup(DASHBOARD_CORE_CACHE_KEY, true, {
          count: cached.recentAlerts.length,
        });
        return cached;
      }
    }
    logDashboardCacheLookup(DASHBOARD_CORE_CACHE_KEY, false);

    const data = await withPerfTiming("/dashboard", "getDashboardCoreData", async () => {
      const [
        totalReportsAnalysed,
        activeCrises,
        criticalPriorityIncidents,
        highPriorityIncidents,
        criticalRiskZones,
        totalAffectedPopulation,
        averageReliabilityScore,
        reportSparkline,
        crisisSparkline,
        highPrioritySparkline,
        populationSparkline,
        criticalSparkline,
        reliabilitySparkline,
        recentAlerts,
        reportsToday,
      ] = await Promise.all([
        dashboardRepository.countAnalysedReports(),
        dashboardRepository.countActiveCrises(),
        dashboardRepository.countPriorityIncidents("Critical"),
        dashboardRepository.countPriorityIncidents("High"),
        dashboardRepository.countCriticalRiskZones(),
        dashboardRepository.getTotalAffectedPopulation(),
        dashboardRepository.getAverageReliabilityScore(),
        dashboardRepository.getDailyAnalysedReportCounts(),
        dashboardRepository.getDailyCrisisCounts(),
        dashboardRepository.getDailyPriorityCounts("High"),
        dashboardRepository.getDailyAffectedPopulationTotals(),
        dashboardRepository.getDailyCriticalRiskCounts(),
        dashboardRepository.getDailyReliabilityAverages(),
        alertService.getRecentAlerts(8),
        dashboardRepository.countReportsToday(),
      ]);

      const sparklines: DashboardSparklines = {
        totalReports: reportSparkline,
        activeIncidents: crisisSparkline,
        highPriority: highPrioritySparkline,
        peopleAffected: populationSparkline,
        criticalRiskZones: criticalSparkline,
        reliability: reliabilitySparkline,
      };

      return {
        stats: {
          totalReportsAnalysed,
          activeCrises,
          criticalPriorityIncidents,
          highPriorityIncidents,
          criticalRiskZones,
          totalAffectedPopulation,
          averageReliabilityScore: roundTo(averageReliabilityScore),
        },
        sparklines,
        trends: {
          totalReports: this.trendFromSeries(reportSparkline),
          activeIncidents: this.trendFromSeries(crisisSparkline),
          highPriority: this.trendFromSeries(highPrioritySparkline),
          peopleAffected: this.trendFromSeries(populationSparkline),
          criticalRiskZones: this.trendFromSeries(criticalSparkline),
          reliability: this.trendFromSeries(reliabilitySparkline),
        },
        reportsToday,
        connectedSources: countConnectedSources(),
        recentAlerts,
      };
    });

    logPerfRenderDataSize(
      "/dashboard:core",
      data.recentAlerts.length,
      JSON.stringify(data).length
    );
    setCached(DASHBOARD_CORE_CACHE_KEY, data, DASHBOARD_CACHE_TTL_MS);
    logPerfCache("/dashboard:core", false);
    return data;
  }

  async getDashboardPanelsData(options?: { bypassCache?: boolean }): Promise<DashboardPanelsData> {
    if (!options?.bypassCache) {
      const cached = getCached<DashboardPanelsData>(DASHBOARD_PANELS_CACHE_KEY);
      if (cached) {
        logDashboardCacheLookup(DASHBOARD_PANELS_CACHE_KEY, true, {
          count: cached.latestIncidents.length,
          newestReportId: cached.latestIncidents[0]?.id,
          newestReportDate: cached.latestIncidents[0]?.analysedAt,
        });
        logRecentIncidents(
          true,
          cached.latestIncidents.map((item) => ({
            title: item.title,
            analysedAt: item.analysedAt,
          }))
        );
        return cached;
      }
    }
    logDashboardCacheLookup(DASHBOARD_PANELS_CACHE_KEY, false);

    const data = await withPerfTiming("/dashboard", "getDashboardPanelsData", async () => {
      const [
        priorityDistribution,
        riskDistribution,
        crisisTypeDistribution,
        recentReportsRaw,
        riskProjections,
        riskScores,
        researchAnalytics,
        sourceStatistics,
        countryDistribution,
        reliabilityBuckets,
        recentAlerts,
      ] = await Promise.all([
        dashboardRepository.getPriorityDistribution(),
        dashboardRepository.getRiskDistribution(),
        dashboardRepository.getCrisisTypeDistribution(),
        dashboardRepository.getRecentAnalysedReports(10),
        dashboardRepository.getLatestRiskProjectionsWithLocations(),
        dashboardRepository.getRiskProjectionScores(),
        researchAnalyticsService.getResearchAnalytics(),
        sourceHealthService.getStatistics(),
        dashboardRepository.getCountryDistribution(),
        dashboardRepository.getReliabilityDistribution(),
        alertService.getRecentAlerts(8),
      ]);

      const recentReports = recentReportsRaw.map((report) => this.mapRecentReport(report));
      const latestRiskByLocation = this.buildLatestRiskIndex(riskProjections);
      const latestIncidents = await this.buildLatestIncidents(
        recentReports,
        latestRiskByLocation
      );
      logRecentIncidents(
        false,
        latestIncidents.map((item) => ({
          title: item.title,
          analysedAt: item.analysedAt,
        }))
      );
      console.info(
        `[DashboardRefresh] latest incidents count=${latestIncidents.length}` +
          (latestIncidents[0]
            ? ` newest report id=${latestIncidents[0].id} date=${latestIncidents[0].analysedAt}`
            : "")
      );

      return {
        priorityDistribution: this.toDistribution(priorityDistribution, PRIORITY_TONES),
        riskDistribution: this.toDistribution(riskDistribution, RISK_TONES),
        crisisTypeDistribution,
        riskProjectionTrend: this.buildRiskProjectionTrend(riskScores),
        latestIncidents,
        recentAlerts,
        researchAnalytics,
        sourceStatistics,
        countryDistribution,
        reliabilityDistribution: this.toDistribution(
          reliabilityBuckets as Record<ReliabilityBucketLabel, number>,
          RELIABILITY_TONES
        ),
      };
    });

    logPerfRenderDataSize(
      "/dashboard:panels",
      data.latestIncidents.length,
      JSON.stringify(data).length
    );
    setCached(DASHBOARD_PANELS_CACHE_KEY, data, DASHBOARD_CACHE_TTL_MS);
    logPerfCache("/dashboard:panels", false);
    return data;
  }

  async getDashboardData(options?: { bypassCache?: boolean }): Promise<DashboardData> {
    const cacheKey = "dashboard:page";
    if (!options?.bypassCache) {
      const cached = getCached<DashboardData>(cacheKey);
      if (cached) {
        logDashboardCacheLookup(cacheKey, true, {
          count: cached.latestIncidents.length,
        });
        logPerfCache("/dashboard", true);
        return cached;
      }
    }
    logDashboardCacheLookup(cacheKey, false);

    const data = await withPerfTiming("/dashboard", "getDashboardData", async () => {
      const [core, panels, topAffectedLocations, highestRiskLocation] =
        await Promise.all([
          this.getDashboardCoreData(options),
          this.getDashboardPanelsData(options),
          dashboardRepository.getTopAffectedLocations(5),
          dashboardRepository.getHighestRiskLocation(),
        ]);

      return {
        ...core,
        ...panels,
        recentReports: [],
        topAffectedLocations,
        executiveOverview: {
          activeCrises: core.stats.activeCrises,
          criticalIncidents: core.stats.criticalPriorityIncidents,
          highRiskZones:
            core.stats.criticalRiskZones + core.stats.highPriorityIncidents,
          mostAffectedRegion:
            topAffectedLocations[0]?.name ??
            panels.researchAnalytics.topCountries[0]?.country ??
            null,
          mostReliableIncident: panels.researchAnalytics.highestReliabilityIncident,
          highestRiskLocation,
        },
      };
    });

    logPerfRenderDataSize(
      "/dashboard",
      data.latestIncidents.length,
      JSON.stringify(data).length
    );
    setCached(cacheKey, data, DASHBOARD_CACHE_TTL_MS);
    logPerfCache("/dashboard", false);
    return data;
  }

  private mapRecentReport(
    report: Awaited<
      ReturnType<typeof dashboardRepository.getRecentAnalysedReports>
    >[number]
  ): DashboardRecentReport {
    const crisisType =
      report.extractedEntities.find(
        (entity) => entity.entityType === "CRISIS_TYPE"
      )?.value ?? null;

    const location =
      report.extractedEntities.find(
        (entity) => entity.entityType === "LOCATION"
      )?.value ?? null;

    const populationEntity = report.extractedEntities.find(
      (entity) => entity.entityType === "AFFECTED_POPULATION"
    );

    const operational = resolveOperationalForLinkedReport(report);

    return {
      id: report.id,
      title: report.title,
      reportDate: report.reportDate.toISOString(),
      analysedAt: report.updatedAt.toISOString(),
      sourceName: report.source.name,
      crisisType,
      location,
      priorityLevel: operational.priorityLevel,
      reliabilityScore: report.reliabilityAssessment!.finalScore,
      affectedPopulation: populationEntity
        ? parseInt(populationEntity.value, 10) || null
        : null,
    };
  }

  private buildLatestRiskIndex(
    riskProjections: Awaited<
      ReturnType<typeof dashboardRepository.getLatestRiskProjectionsWithLocations>
    >
  ) {
    const index = new Map<
      string,
      Awaited<
        ReturnType<typeof dashboardRepository.getLatestRiskProjectionsWithLocations>
      >[number]
    >();

    for (const risk of riskProjections) {
      const key = risk.location.name.toLowerCase();
      if (!index.has(key)) {
        index.set(key, risk);
      }
    }

    return index;
  }

  private async buildLatestIncidents(
    recentReports: DashboardRecentReport[],
    latestRiskByLocation: Map<
      string,
      Awaited<
        ReturnType<typeof dashboardRepository.getLatestRiskProjectionsWithLocations>
      >[number]
    >
  ): Promise<DashboardIncident[]> {
    const masters = await masterIncidentRepository.findAllOrdered(50);
    const masterByReportId = new Map<
      string,
      Awaited<ReturnType<typeof masterIncidentRepository.findAllOrdered>>[number]
    >();
    for (const master of masters) {
      for (const member of master.members) {
        masterByReportId.set(member.reportId, master);
      }
    }

    const sortedReports = [...recentReports].sort((a, b) => {
      const reportDateDiff =
        new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime();
      if (reportDateDiff !== 0) return reportDateDiff;
      return new Date(b.analysedAt).getTime() - new Date(a.analysedAt).getTime();
    });

    const incidents: DashboardIncident[] = [];
    const seenMasterIds = new Set<string>();

    for (const report of sortedReports) {
      const master = masterByReportId.get(report.id);
      if (master && seenMasterIds.has(master.id)) continue;

      const incident = this.mapIncident(report, latestRiskByLocation, master);
      if (!incident) continue;

      incidents.push(incident);
      if (master) seenMasterIds.add(master.id);
      if (incidents.length >= 10) break;
    }

    return incidents;
  }

  private priorityToRiskLevel(priority: PriorityLevel): RiskLevel {
    if (priority === "Critical") return "Critical";
    if (priority === "High") return "High";
    if (priority === "Low") return "Low";
    return "Medium";
  }

  private mapIncident(
    report: DashboardRecentReport,
    latestRiskByLocation: Map<
      string,
      Awaited<
        ReturnType<typeof dashboardRepository.getLatestRiskProjectionsWithLocations>
      >[number]
    >,
    master?: Awaited<ReturnType<typeof masterIncidentRepository.findAllOrdered>>[number]
  ): DashboardIncident | null {
    const locationLabel =
      report.location?.trim() ||
      report.title.split("—").pop()?.trim() ||
      null;
    if (!locationLabel) return null;

    const risk =
      latestRiskByLocation.get(locationLabel.toLowerCase()) ??
      latestRiskByLocation.get((report.location ?? "").toLowerCase());

    const locationParts = resolveLocationParts(locationLabel);
    if (!locationParts.verified && locationParts.city === "Location Not Verified") {
      return null;
    }

    const intelligence = master?.intelligence
      ? mapIntelligenceRecord(master.intelligence)
      : null;
    const operational = master
      ? resolveOperationalIntelligence({
          master,
          intelligence,
          reportFallback: {
            priorityLevel: report.priorityLevel,
            priorityScore: 0.5,
            verificationStatus: master.correlationVerificationStatus,
            confidence: master.confidenceScore,
          },
        })
      : resolveOperationalIntelligence({
          reportFallback: {
            priorityLevel: report.priorityLevel,
            priorityScore: 0.5,
          },
        });

    return {
      id: report.id,
      title: master?.title ?? report.title,
      analysedAt: report.analysedAt,
      crisisType: report.crisisType,
      crisisIconKey: getCrisisIconKey(report.crisisType),
      cityName: locationParts.city,
      countryName: locationParts.country,
      displayLocation: locationParts.display,
      priorityLevel: operational.priorityLevel,
      riskLevel: risk?.riskLevel ?? this.priorityToRiskLevel(report.priorityLevel),
      reliabilityScore: report.reliabilityScore,
      affectedPopulation: report.affectedPopulation,
      masterIncidentId: operational.masterIncidentId,
      supportingReportCount: operational.supportingReportCount,
      independentSourceCount: operational.independentSourceCount,
      sourceAgreementPercent: operational.sourceAgreementPercent,
      correlationVerificationStatus: operational.verificationStatus,
      dynamicPriorityScore: operational.dynamicPriorityScore,
      dynamicPriorityLevel: operational.priorityLevel,
    };
  }

  private trendFromSeries(series: number[]): number | null {
    if (series.length < 4) return null;
    const midpoint = Math.floor(series.length / 2);
    const previous = series.slice(0, midpoint).reduce((sum, value) => sum + value, 0);
    const current = series.slice(midpoint).reduce((sum, value) => sum + value, 0);
    return percentChange(current, previous);
  }

  private buildRiskProjectionTrend(scores: number[]): number[] {
    const average =
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : 35;

    return Array.from({ length: 7 }, (_, index) => {
      const progress = index / 6;
      return Math.round(average - 8 + progress * 18 + Math.sin(index) * 3);
    });
  }

  private toDistribution<T extends string>(
    counts: Record<T, number>,
    tones: Record<T, DistributionItem["tone"]>
  ): DistributionItem[] {
    return (Object.keys(counts) as T[]).map((label) => ({
      label,
      count: counts[label],
      tone: tones[label],
    }));
  }
}

export const dashboardService = new DashboardService();
