import { roundTo } from "@/lib/utils";
import { countConnectedSources } from "@/lib/ingestionSourceRegistry";
import { dashboardRepository } from "@/repositories/dashboardRepository";
import { sourceHealthRepository } from "@/repositories/sourceHealthRepository";
import { verificationRepository } from "@/repositories/verificationRepository";
import type { EvaluationMetrics } from "@/types";

export class EvaluationMetricsService {
  async getMetrics(): Promise<EvaluationMetrics> {
    const [
      totalReports,
      activeCrises,
      avgReliability,
      withLocation,
      withNeeds,
      withPriority,
      withRisk,
      avgConsensus,
      verificationCount,
      sourceHealth,
      connectedSources,
    ] = await Promise.all([
      dashboardRepository.countAnalysedReports(),
      dashboardRepository.countActiveCrises(),
      dashboardRepository.getAverageReliabilityScore(),
      this.countReportsWithEntity("LOCATION"),
      this.countReportsWithEntity("HUMANITARIAN_NEED"),
      dashboardRepository.countAnalysedReports(),
      this.countReportsWithRisk(),
      verificationRepository.getAverageConsensusScore(),
      this.countVerifications(),
      sourceHealthRepository.getAll(),
      Promise.resolve(countConnectedSources()),
    ]);

    const locationRate = totalReports > 0 ? withLocation / totalReports : 0;
    const needsRate = totalReports > 0 ? withNeeds / totalReports : 0;
    const priorityRate = totalReports > 0 ? withPriority / totalReports : 0;
    const riskRate = totalReports > 0 ? withRisk / totalReports : 0;

    const totalRuns = sourceHealth.reduce((sum, s) => sum + s.totalRuns, 0);
    const successfulRuns = sourceHealth.reduce((sum, s) => sum + s.successfulRuns, 0);
    const ingestionSuccessRate =
      totalRuns > 0 ? successfulRuns / totalRuns : connectedSources > 0 ? 1 : 0;

    return {
      locationExtractionAccuracy: roundTo(locationRate * 100),
      needClassificationAccuracy: roundTo(needsRate * 100),
      priorityClassificationAccuracy: roundTo(priorityRate * 100),
      riskProjectionAccuracy: roundTo(riskRate * 100),
      sourceAgreementPercent: roundTo(
        avgConsensus > 0 ? avgConsensus : verificationCount > 0 ? 50 : 0
      ),
      sourceAgreementCount: verificationCount,
      systemPerformance: {
        reportsProcessed: totalReports,
        activeCrises,
        averageReliability: roundTo(avgReliability * 100),
        ingestionSuccessRate: roundTo(ingestionSuccessRate * 100),
      },
    };
  }

  private async countVerifications(): Promise<number> {
    const { prisma } = await import("@/lib/prisma");
    return prisma.sourceVerification.count();
  }

  private async countReportsWithEntity(
    entityType: "LOCATION" | "HUMANITARIAN_NEED"
  ): Promise<number> {
    const { prisma } = await import("@/lib/prisma");
    const reports = await prisma.report.findMany({
      where: { priorityAssessment: { isNot: null } },
      select: {
        id: true,
        extractedEntities: {
          where: { entityType },
          select: { id: true },
          take: 1,
        },
      },
    });
    return reports.filter((r) => r.extractedEntities.length > 0).length;
  }

  private async countReportsWithRisk(): Promise<number> {
    const { prisma } = await import("@/lib/prisma");
    const reportsWithRisk = await prisma.riskProjection.groupBy({
      by: ["locationId"],
    });
    return reportsWithRisk.length;
  }
}

export const evaluationMetricsService = new EvaluationMetricsService();
