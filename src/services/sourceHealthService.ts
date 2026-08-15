import {
  countConnectedSources,
  getIngestionSourcesStatus,
  getOperationalProviderIds,
  getProviderStatus,
  PROVIDER_LABELS,
} from "@/lib/ingestionSourceRegistry";
import { dashboardRepository } from "@/repositories/dashboardRepository";
import { sourceHealthRepository } from "@/repositories/sourceHealthRepository";
import type { SourceHealthStats, SourceStatisticsDashboard } from "@/types";

export class SourceHealthService {
  async getStatistics(): Promise<SourceStatisticsDashboard> {
    const [healthRecords, reportsToday, weeklyTrend] = await Promise.all([
      sourceHealthRepository.getAll(),
      dashboardRepository.countReportsToday(),
      dashboardRepository.getDailyAnalysedReportCounts(),
    ]);

    const healthByProvider = new Map(
      healthRecords.map((r) => [r.providerId, r])
    );

    const sources: SourceHealthStats[] = getOperationalProviderIds().map((id) => {
      const health = healthByProvider.get(id);
      return {
        providerId: id,
        name: PROVIDER_LABELS[id],
        totalFetched: health?.totalFetched ?? 0,
        totalSaved: health?.totalSaved ?? 0,
        duplicatesSkipped: health?.duplicatesSkipped ?? 0,
        failedRequests: health?.failedRequests ?? 0,
        uptimeScore: health?.uptimeScore ?? 1,
        reliabilityScore: health?.reliabilityScore ?? 0.8,
        lastSuccessAt: health?.lastSuccessAt ?? null,
        lastFailureAt: health?.lastFailureAt ?? null,
        lastError: health?.lastError ?? null,
        status: getProviderStatus(id),
      };
    });

    return {
      sources,
      totalReportsToday: reportsToday,
      connectedSources: countConnectedSources(),
      weeklyIngestionTrend: weeklyTrend,
    };
  }

  getLiveSourceStatus() {
    return getIngestionSourcesStatus();
  }
}

export const sourceHealthService = new SourceHealthService();
