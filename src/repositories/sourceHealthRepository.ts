import { prisma } from "@/lib/prisma";
import { roundTo } from "@/lib/utils";
import type { IngestionProviderId } from "@/types";

export interface SourceHealthRecord {
  providerId: IngestionProviderId;
  totalFetched: number;
  totalSaved: number;
  duplicatesSkipped: number;
  failedRequests: number;
  successfulRuns: number;
  totalRuns: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  uptimeScore: number;
  reliabilityScore: number;
}

export class SourceHealthRepository {
  async recordSuccess(
    providerId: IngestionProviderId,
    fetchedCount: number,
    savedCount = 0,
    duplicatesSkipped = 0
  ): Promise<void> {
    const existing = await prisma.ingestionSourceHealth.findUnique({
      where: { providerId },
    });

    const totalRuns = (existing?.totalRuns ?? 0) + 1;
    const successfulRuns = (existing?.successfulRuns ?? 0) + 1;
    const uptimeScore = roundTo(successfulRuns / totalRuns);

    await prisma.ingestionSourceHealth.upsert({
      where: { providerId },
      create: {
        providerId,
        totalFetched: fetchedCount,
        totalSaved: savedCount,
        duplicatesSkipped,
        successfulRuns: 1,
        totalRuns: 1,
        uptimeScore: 1,
        reliabilityScore: 0.8,
        lastSuccessAt: new Date(),
      },
      update: {
        totalFetched: { increment: fetchedCount },
        totalSaved: { increment: savedCount },
        duplicatesSkipped: { increment: duplicatesSkipped },
        successfulRuns: { increment: 1 },
        totalRuns: { increment: 1 },
        uptimeScore,
        lastSuccessAt: new Date(),
      },
    });
  }

  async recordFailure(
    providerId: IngestionProviderId,
    error: string
  ): Promise<void> {
    const existing = await prisma.ingestionSourceHealth.findUnique({
      where: { providerId },
    });

    const totalRuns = (existing?.totalRuns ?? 0) + 1;
    const successfulRuns = existing?.successfulRuns ?? 0;
    const uptimeScore = roundTo(totalRuns > 0 ? successfulRuns / totalRuns : 0);

    await prisma.ingestionSourceHealth.upsert({
      where: { providerId },
      create: {
        providerId,
        failedRequests: 1,
        totalRuns: 1,
        uptimeScore: 0,
        reliabilityScore: 0.5,
        lastFailureAt: new Date(),
        lastError: error.slice(0, 2000),
      },
      update: {
        failedRequests: { increment: 1 },
        totalRuns: { increment: 1 },
        uptimeScore,
        lastFailureAt: new Date(),
        lastError: error.slice(0, 2000),
      },
    });
  }

  async getAll(): Promise<SourceHealthRecord[]> {
    const records = await prisma.ingestionSourceHealth.findMany({
      orderBy: { totalFetched: "desc" },
    });

    return records.map((r) => ({
      providerId: r.providerId as IngestionProviderId,
      totalFetched: r.totalFetched,
      totalSaved: r.totalSaved,
      duplicatesSkipped: r.duplicatesSkipped,
      failedRequests: r.failedRequests,
      successfulRuns: r.successfulRuns,
      totalRuns: r.totalRuns,
      lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: r.lastFailureAt?.toISOString() ?? null,
      lastError: r.lastError,
      uptimeScore: r.uptimeScore,
      reliabilityScore: r.reliabilityScore,
    }));
  }
}

export const sourceHealthRepository = new SourceHealthRepository();
