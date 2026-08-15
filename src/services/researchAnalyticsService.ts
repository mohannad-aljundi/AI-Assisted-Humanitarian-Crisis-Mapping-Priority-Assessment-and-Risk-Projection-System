import { roundTo } from "@/lib/utils";
import { dashboardRepository } from "@/repositories/dashboardRepository";
import { verificationRepository } from "@/repositories/verificationRepository";
import type { ResearchAnalytics } from "@/types";

export class ResearchAnalyticsService {
  async getResearchAnalytics(): Promise<ResearchAnalytics> {
    const [
      sourceCount,
      averageSourceAgreement,
      mostVerifiedCrisis,
      topReliability,
      verifications,
    ] = await Promise.all([
      dashboardRepository.countDistinctSources(),
      verificationRepository.getAverageConsensusScore(),
      verificationRepository.getMostVerifiedCrisis(),
      dashboardRepository.getHighestReliabilityReport(),
      verificationRepository.findAll(100),
    ]);

    const countryCounts = new Map<string, number>();
    for (const verification of verifications) {
      countryCounts.set(
        verification.country,
        (countryCounts.get(verification.country) ?? 0) + 1
      );
    }

    const topCountries = [...countryCounts.entries()]
      .map(([country, incidentCount]) => ({ country, incidentCount }))
      .sort((a, b) => b.incidentCount - a.incidentCount)
      .slice(0, 5);

    return {
      totalSourcesAnalysed: sourceCount,
      averageSourceAgreement: roundTo(averageSourceAgreement),
      mostVerifiedCrisis,
      highestReliabilityIncident: topReliability
        ? {
            title: topReliability.report.title,
            score: roundTo(topReliability.finalScore),
          }
        : null,
      topCountries,
    };
  }
}

export const researchAnalyticsService = new ResearchAnalyticsService();
