import type {
  BackgroundJobStatus,
  BackgroundJobType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface BackgroundJobRecord {
  id: string;
  type: BackgroundJobType;
  status: BackgroundJobStatus;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  timingMs: Prisma.JsonValue | null;
  runAfter: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export class BackgroundJobRepository {
  async enqueue(params: {
    type: BackgroundJobType;
    payload: Prisma.InputJsonValue;
    runAfter?: Date;
    dedupeKey?: string;
  }): Promise<BackgroundJobRecord | null> {
    const reportId =
      params.type === "REPORT_ANALYSIS"
        ? (params.payload as { reportId?: string } | null)?.reportId
        : undefined;

    if (reportId) {
      const existingByReport = await prisma.backgroundJob.findFirst({
        where: {
          type: "REPORT_ANALYSIS",
          status: { in: ["PENDING", "RUNNING"] },
          payload: { path: ["reportId"], equals: reportId },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existingByReport) return existingByReport;
    }

    if (params.dedupeKey) {
      const existing = await prisma.backgroundJob.findFirst({
        where: {
          type: params.type,
          status: { in: ["PENDING", "RUNNING"] },
          payload: {
            path: ["dedupeKey"],
            equals: params.dedupeKey,
          },
        },
      });
      if (existing) return existing;
    }

    return prisma.backgroundJob.create({
      data: {
        type: params.type,
        payload: {
          ...(params.payload as object),
          ...(params.dedupeKey ? { dedupeKey: params.dedupeKey } : {}),
        },
        runAfter: params.runAfter ?? new Date(),
      },
    });
  }

  async claimNext(types?: BackgroundJobType[]): Promise<BackgroundJobRecord | null> {
    const now = new Date();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = await prisma.backgroundJob.findFirst({
        where: {
          status: "PENDING",
          runAfter: { lte: now },
          ...(types?.length ? { type: { in: types } } : {}),
        },
        orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
      });

      if (!candidate) return null;

      const updated = await prisma.backgroundJob.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: {
          status: "RUNNING",
          startedAt: now,
          attempts: { increment: 1 },
        },
      });

      if (updated.count === 1) {
        return prisma.backgroundJob.findUniqueOrThrow({ where: { id: candidate.id } });
      }
    }

    return null;
  }

  async markCompleted(
    id: string,
    timingMs?: Record<string, number>
  ): Promise<void> {
    await prisma.backgroundJob.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        timingMs: timingMs ?? undefined,
        error: null,
      },
    });
  }

  async markFailed(id: string, error: string, retry: boolean): Promise<void> {
    const job = await prisma.backgroundJob.findUnique({ where: { id } });
    if (!job) return;

    const shouldRetry = retry && job.attempts < job.maxAttempts;

    await prisma.backgroundJob.update({
      where: { id },
      data: {
        status: shouldRetry ? "PENDING" : "FAILED",
        error,
        completedAt: shouldRetry ? null : new Date(),
        runAfter: shouldRetry
          ? new Date(Date.now() + Math.min(60_000, 5_000 * job.attempts))
          : job.runAfter,
        startedAt: shouldRetry ? null : job.startedAt,
      },
    });
  }

  async countByStatus(status: BackgroundJobStatus): Promise<number> {
    return prisma.backgroundJob.count({ where: { status } });
  }

  async countPending(): Promise<number> {
    return prisma.backgroundJob.count({
      where: { status: { in: ["PENDING", "RUNNING"] } },
    });
  }

  async getQueueStats(): Promise<{
    pending: number;
    running: number;
    failed: number;
  }> {
    const [pending, running, failed] = await Promise.all([
      this.countByStatus("PENDING"),
      this.countByStatus("RUNNING"),
      this.countByStatus("FAILED"),
    ]);
    return { pending, running, failed };
  }

  /**
   * Re-queue jobs left RUNNING after a worker crash or DB disconnect.
   */
  async resetStaleRunningJobs(maxAgeMs = 10 * 60_000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await prisma.backgroundJob.updateMany({
      where: {
        status: "RUNNING",
        OR: [{ startedAt: null }, { startedAt: { lt: cutoff } }],
      },
      data: {
        status: "PENDING",
        startedAt: null,
        runAfter: new Date(),
        error: "Reset after worker disconnect",
      },
    });
    return result.count;
  }

  /**
   * Force-fail RUNNING jobs older than maxAgeMs.
   * Pass maxAgeMs=0 to fail ALL currently RUNNING jobs.
   */
  async failStaleRunningJobs(maxAgeMs = 90_000): Promise<number> {
    const where =
      maxAgeMs <= 0
        ? { status: "RUNNING" as const }
        : {
            status: "RUNNING" as const,
            OR: [
              { startedAt: null },
              { startedAt: { lt: new Date(Date.now() - maxAgeMs) } },
            ],
          };

    const stale = await prisma.backgroundJob.findMany({
      where,
      select: { id: true, payload: true },
      take: 100,
    });

    for (const job of stale) {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error:
            maxAgeMs <= 0
              ? "Force-failed stuck RUNNING job on recovery"
              : `Force-failed: RUNNING longer than ${Math.round(maxAgeMs / 1000)}s`,
        },
      });

      const reportId = (job.payload as { reportId?: string } | null)?.reportId;
      if (reportId) {
        await prisma.report
          .updateMany({
            where: { id: reportId, processingStatus: "ANALYSING" },
            data: {
              processingStatus: "FAILED",
              processingError:
                maxAgeMs <= 0
                  ? "Force-failed stuck analysis on recovery"
                  : `Analysis timed out after ${Math.round(maxAgeMs / 1000)}s`,
            },
          })
          .catch(() => undefined);
      }
    }

    return stale.length;
  }

  async listJobsByStatus(statuses: BackgroundJobStatus[], take = 50) {
    return prisma.backgroundJob.findMany({
      where: { status: { in: statuses } },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      take,
    });
  }

  async retryFailedJobs(types?: BackgroundJobType[]): Promise<number> {
    const result = await prisma.backgroundJob.updateMany({
      where: {
        status: "FAILED",
        ...(types?.length ? { type: { in: types } } : {}),
      },
      data: {
        status: "PENDING",
        error: null,
        completedAt: null,
        startedAt: null,
        runAfter: new Date(),
      },
    });
    return result.count;
  }
}

export const backgroundJobRepository = new BackgroundJobRepository();
