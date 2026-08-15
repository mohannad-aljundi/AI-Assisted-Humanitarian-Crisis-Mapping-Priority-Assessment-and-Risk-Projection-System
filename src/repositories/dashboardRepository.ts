import type { PriorityLevel, RiskLevel } from "@prisma/client";
import { getCrisisTypeColor } from "@/lib/crisisTypeColors";
import { prisma } from "@/lib/prisma";

const ANALYSED_REPORT_FILTER = {
  priorityAssessment: { isNot: null },
} as const;

function bucketDailyCounts(
  dates: Date[],
  days: number
): number[] {
  const buckets = Array.from({ length: days }, () => 0);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  for (const date of dates) {
    const dayIndex = Math.floor(
      (new Date(date).setHours(0, 0, 0, 0) - start.getTime()) / 86_400_000
    );
    if (dayIndex >= 0 && dayIndex < days) {
      buckets[dayIndex] += 1;
    }
  }

  return buckets;
}

function startOfDayDaysAgo(daysAgo: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

export class DashboardRepository {
  async countAnalysedReports(): Promise<number> {
    return prisma.report.count({ where: ANALYSED_REPORT_FILTER });
  }

  async countReportsToday(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return prisma.report.count({
      where: { ...ANALYSED_REPORT_FILTER, createdAt: { gte: start } },
    });
  }

  async countDistinctSources(): Promise<number> {
    return prisma.source.count({
      where: {
        reports: { some: ANALYSED_REPORT_FILTER },
      },
    });
  }

  async getHighestReliabilityReport() {
    return prisma.reliabilityAssessment.findFirst({
      orderBy: { finalScore: "desc" },
      include: { report: true },
    });
  }

  async countActiveCrises(): Promise<number> {
    return prisma.crisis.count();
  }

  async countPriorityIncidents(level: PriorityLevel): Promise<number> {
    return prisma.priorityAssessment.count({ where: { priorityLevel: level } });
  }

  async countCriticalRiskZones(): Promise<number> {
    return prisma.riskProjection.count({ where: { riskLevel: "Critical" } });
  }

  async getAverageReliabilityScore(): Promise<number> {
    const result = await prisma.reliabilityAssessment.aggregate({
      _avg: { finalScore: true },
    });
    return result._avg.finalScore ?? 0;
  }

  async getTotalAffectedPopulation(): Promise<number> {
    const entities = await prisma.extractedEntity.findMany({
      where: { entityType: "AFFECTED_POPULATION" },
      select: { value: true },
    });

    return entities.reduce(
      (total, entity) => total + (parseInt(entity.value, 10) || 0),
      0
    );
  }

  async getPriorityDistribution(): Promise<Record<PriorityLevel, number>> {
    const groups = await prisma.priorityAssessment.groupBy({
      by: ["priorityLevel"],
      _count: { priorityLevel: true },
    });

    return {
      Low: 0,
      Medium: 0,
      High: 0,
      Critical: 0,
      ...Object.fromEntries(
        groups.map((group) => [group.priorityLevel, group._count.priorityLevel])
      ),
    } as Record<PriorityLevel, number>;
  }

  async getRiskDistribution(): Promise<Record<RiskLevel, number>> {
    const groups = await prisma.riskProjection.groupBy({
      by: ["riskLevel"],
      _count: { riskLevel: true },
    });

    return {
      Low: 0,
      Medium: 0,
      High: 0,
      Critical: 0,
      ...Object.fromEntries(
        groups.map((group) => [group.riskLevel, group._count.riskLevel])
      ),
    } as Record<RiskLevel, number>;
  }

  async getRecentAnalysedReports(limit = 10) {
    return prisma.report.findMany({
      where: {
        ...ANALYSED_REPORT_FILTER,
        processingStatus: "INTELLIGENCE_READY",
      },
      take: limit,
      orderBy: [{ reportDate: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        source: true,
        priorityAssessment: true,
        reliabilityAssessment: true,
        insight: { select: { clusterOperational: true } },
        masterIncidentMember: {
          include: {
            masterIncident: { include: { intelligence: true } },
          },
        },
        extractedEntities: {
          where: {
            entityType: {
              in: ["LOCATION", "CRISIS_TYPE", "AFFECTED_POPULATION"],
            },
          },
        },
      },
    });
  }

  async getLatestRiskProjectionsWithLocations() {
    return prisma.riskProjection.findMany({
      include: {
        location: true,
        crisis: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getCrisisTypeDistribution() {
    const entities = await prisma.extractedEntity.findMany({
      where: { entityType: "CRISIS_TYPE" },
      select: { value: true },
    });

    const counts = new Map<string, number>();
    for (const entity of entities) {
      const label = entity.value.trim() || "Other";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({
        label,
        count,
        color: getCrisisTypeColor(label),
      }))
      .sort((a, b) => b.count - a.count);
  }

  async getDailyAnalysedReportCounts(days = 7): Promise<number[]> {
    const since = startOfDayDaysAgo(days - 1);
    const reports = await prisma.report.findMany({
      where: { ...ANALYSED_REPORT_FILTER, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    return bucketDailyCounts(
      reports.map((report) => report.createdAt),
      days
    );
  }

  async getDailyCrisisCounts(days = 7): Promise<number[]> {
    const since = startOfDayDaysAgo(days - 1);
    const crises = await prisma.crisis.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
    return bucketDailyCounts(
      crises.map((crisis) => crisis.createdAt),
      days
    );
  }

  async getDailyPriorityCounts(level: PriorityLevel, days = 7): Promise<number[]> {
    const since = startOfDayDaysAgo(days - 1);
    const assessments = await prisma.priorityAssessment.findMany({
      where: { priorityLevel: level, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    return bucketDailyCounts(
      assessments.map((assessment) => assessment.createdAt),
      days
    );
  }

  async getDailyCriticalRiskCounts(days = 7): Promise<number[]> {
    const since = startOfDayDaysAgo(days - 1);
    const projections = await prisma.riskProjection.findMany({
      where: { riskLevel: "Critical", createdAt: { gte: since } },
      select: { createdAt: true },
    });
    return bucketDailyCounts(
      projections.map((projection) => projection.createdAt),
      days
    );
  }

  async getDailyAffectedPopulationTotals(days = 7): Promise<number[]> {
    const since = startOfDayDaysAgo(days - 1);
    const entities = await prisma.extractedEntity.findMany({
      where: {
        entityType: "AFFECTED_POPULATION",
        createdAt: { gte: since },
      },
      select: { value: true, createdAt: true },
    });

    const buckets = Array.from({ length: days }, () => 0);
    const start = startOfDayDaysAgo(days - 1);

    for (const entity of entities) {
      const dayIndex = Math.floor(
        (new Date(entity.createdAt).setHours(0, 0, 0, 0) - start.getTime()) /
          86_400_000
      );
      if (dayIndex >= 0 && dayIndex < days) {
        buckets[dayIndex] += parseInt(entity.value, 10) || 0;
      }
    }

    return buckets;
  }

  async getDailyReliabilityAverages(days = 7): Promise<number[]> {
    const since = startOfDayDaysAgo(days - 1);
    const assessments = await prisma.reliabilityAssessment.findMany({
      where: { createdAt: { gte: since } },
      select: { finalScore: true, createdAt: true },
    });

    const totals = Array.from({ length: days }, () => ({ sum: 0, count: 0 }));
    const start = startOfDayDaysAgo(days - 1);

    for (const assessment of assessments) {
      const dayIndex = Math.floor(
        (new Date(assessment.createdAt).setHours(0, 0, 0, 0) - start.getTime()) /
          86_400_000
      );
      if (dayIndex >= 0 && dayIndex < days) {
        totals[dayIndex].sum += assessment.finalScore;
        totals[dayIndex].count += 1;
      }
    }

    return totals.map(({ sum, count }) =>
      count > 0 ? Math.round((sum / count) * 100) : 0
    );
  }

  async getRiskProjectionScores(): Promise<number[]> {
    const projections = await prisma.riskProjection.findMany({
      select: { riskLevel: true },
    });

    const scoreMap: Record<RiskLevel, number> = {
      Low: 25,
      Medium: 45,
      High: 70,
      Critical: 90,
    };

    return projections.map((projection) => scoreMap[projection.riskLevel]);
  }

  async getCountryDistribution() {
    const entities = await prisma.extractedEntity.findMany({
      where: { entityType: "LOCATION" },
      select: { value: true },
    });

    const counts = new Map<string, number>();
    for (const entity of entities) {
      const parts = entity.value.includes(",")
        ? entity.value.split(",").pop()?.trim() ?? entity.value
        : entity.value;
      const country = parts.trim() || "Unverified";
      if (country.toLowerCase() === "unknown") continue;
      counts.set(country, (counts.get(country) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({
        label,
        count,
        color: "#3b82f6",
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }

  async getReliabilityDistribution(): Promise<Record<string, number>> {
    const assessments = await prisma.reliabilityAssessment.findMany({
      select: { finalScore: true },
    });

    const buckets = { "90-100%": 0, "70-89%": 0, "50-69%": 0, "Below 50%": 0 };
    for (const a of assessments) {
      const pct = a.finalScore * 100;
      if (pct >= 90) buckets["90-100%"] += 1;
      else if (pct >= 70) buckets["70-89%"] += 1;
      else if (pct >= 50) buckets["50-69%"] += 1;
      else buckets["Below 50%"] += 1;
    }
    return buckets;
  }

  async getHighestRiskLocation(): Promise<string | null> {
    const risk = await prisma.riskProjection.findFirst({
      where: { riskLevel: { in: ["Critical", "High"] } },
      orderBy: { createdAt: "desc" },
      include: { location: true },
    });
    return risk?.location.name ?? null;
  }

  async getTopAffectedLocations(limit = 5) {
    const [locationEntities, populationEntities] = await Promise.all([
      prisma.extractedEntity.findMany({
        where: { entityType: "LOCATION" },
        select: { reportId: true, value: true },
      }),
      prisma.extractedEntity.findMany({
        where: { entityType: "AFFECTED_POPULATION" },
        select: { reportId: true, value: true },
      }),
    ]);

    const populationByReport = new Map(
      populationEntities.map((entity) => [
        entity.reportId,
        parseInt(entity.value, 10) || 0,
      ])
    );

    const totals = new Map<
      string,
      { incidentCount: number; totalAffectedPopulation: number }
    >();

    for (const location of locationEntities) {
      const population = populationByReport.get(location.reportId) ?? 0;
      const existing = totals.get(location.value) ?? {
        incidentCount: 0,
        totalAffectedPopulation: 0,
      };

      totals.set(location.value, {
        incidentCount: existing.incidentCount + 1,
        totalAffectedPopulation: existing.totalAffectedPopulation + population,
      });
    }

    return Array.from(totals.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort(
        (a, b) =>
          b.totalAffectedPopulation - a.totalAffectedPopulation ||
          b.incidentCount - a.incidentCount
      )
      .slice(0, limit);
  }
}

export const dashboardRepository = new DashboardRepository();
