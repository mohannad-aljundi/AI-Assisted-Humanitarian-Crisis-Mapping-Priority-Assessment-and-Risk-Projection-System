import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  beginProcessingWave,
  endProcessingWaveIfIdle,
  getAverageAnalysisSeconds,
  getWaveBaselineReady,
  recordAnalysisDurationMs,
  type ProcessingQueueSnapshot,
} from "@/lib/analysisEventBus";
import { backgroundJobRepository } from "@/repositories/backgroundJobRepository";
import { reportImportService } from "@/services/reportImportService";
import {
  countActionableWaiting,
  reconcileProcessingState,
} from "@/services/processingStateReconciler";

const AVG_SAMPLE_LIMIT = 20;

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseJobDurationMs(timingMs: unknown): number | null {
  if (!timingMs || typeof timingMs !== "object") return null;
  const timing = timingMs as { totalMs?: number; aiAnalysisMs?: number };
  const ms = timing.totalMs ?? timing.aiAnalysisMs;
  return typeof ms === "number" && ms > 0 ? ms : null;
}

async function computeAverageAnalysisSeconds(): Promise<number | null> {
  try {
    const jobs = await prisma.backgroundJob.findMany({
      where: {
        type: "REPORT_ANALYSIS",
        status: "COMPLETED",
        timingMs: { not: Prisma.DbNull },
      },
      orderBy: { completedAt: "desc" },
      take: AVG_SAMPLE_LIMIT,
      select: { timingMs: true },
    });

    const durationsMs = jobs
      .map((job) => parseJobDurationMs(job.timingMs))
      .filter((value): value is number => value != null);

    if (durationsMs.length > 0) {
      const total = durationsMs.reduce((sum, value) => sum + value, 0);
      return Math.round((total / durationsMs.length / 1000) * 10) / 10;
    }
  } catch (error) {
    console.warn(
      "[QueueSnapshot] Average duration query failed:",
      error instanceof Error ? error.message : error
    );
  }

  return getAverageAnalysisSeconds();
}

export class QueueSnapshotService {
  /**
   * Canonical queue state — every API route and live event must use this.
   */
  async getSnapshot(
    latestCompletedId: string | null = null
  ): Promise<ProcessingQueueSnapshot> {
    await reconcileProcessingState().catch((error) => {
      console.warn(
        "[QueueSnapshot] Reconcile failed:",
        error instanceof Error ? error.message : error
      );
    });

    const [counts, completedToday, averageAnalysisSeconds, jobStats, actionableWaiting] =
      await Promise.all([
        reportImportService.getProcessingCounts(),
        prisma.report
          .count({
            where: {
              processingStatus: "INTELLIGENCE_READY",
              updatedAt: { gte: startOfUtcDay() },
            },
          })
          .catch(() => 0),
        computeAverageAnalysisSeconds(),
        backgroundJobRepository.getQueueStats().catch(() => ({
          pending: 0,
          running: 0,
          failed: 0,
        })),
        countActionableWaiting(),
      ]);

    const completed = counts.INTELLIGENCE_READY ?? 0;
    const analysing = counts.ANALYSING ?? 0;
    const waiting = actionableWaiting;
    const failed = counts.FAILED ?? 0;

    if (analysing + waiting > 0) {
      beginProcessingWave(completed);
    }

    const baseline = getWaveBaselineReady();
    const waveCompleted = Math.max(0, completed - baseline);
    const waveTotal = waveCompleted + analysing + waiting + failed;
    const progressPercent =
      waveTotal > 0 ? Math.min(100, Math.round((waveCompleted / waveTotal) * 100)) : 100;

    const inFlight = analysing > 0 || waiting > 0 || jobStats.running > 0;

    const snapshot: ProcessingQueueSnapshot = {
      completed,
      analysing,
      waiting,
      failed,
      completedToday,
      progressPercent: inFlight || failed > 0 ? progressPercent : 100,
      waveCompleted,
      waveTotal: inFlight || failed > 0 ? waveTotal : waveCompleted,
      latestCompletedId,
      active: inFlight,
      averageAnalysisSeconds,
    };

    endProcessingWaveIfIdle(snapshot);
    return snapshot;
  }

  recordCompletedDuration(durationMs: number): void {
    recordAnalysisDurationMs(durationMs);
  }
}

export const queueSnapshotService = new QueueSnapshotService();
