import { prisma } from "@/lib/prisma";
import { getJobStage } from "@/lib/jobStageTracker";
import { JOB_TIMEOUT_MS } from "@/lib/workerRuntime";
import {
  isReportFullyAnalysed,
  needsReportAnalysis,
} from "@/lib/reportAnalysisStatus";
import { backgroundJobRepository } from "@/repositories/backgroundJobRepository";
import { ingestionSyncStateRepository } from "@/repositories/ingestionSyncStateRepository";
import { reportImportService } from "@/services/reportImportService";
import { notifyWebDashboardRefresh } from "@/services/dashboardRefreshService";

export interface ProcessingReconcileResult {
  failedStaleJobs: number;
  fixedAnalysingReports: number;
  completedOrphanJobs: number;
  dedupedJobs: number;
  clearedStaleWaiting: number;
  fixedQueuedReports: number;
  completedReadyJobs: number;
  syncFinished: boolean;
}

const STALE_QUEUED_REPORT_MS = 24 * 60 * 60 * 1000;

function reportIdFromPayload(payload: unknown): string | null {
  const reportId = (payload as { reportId?: string } | null)?.reportId;
  return typeof reportId === "string" && reportId.length > 0 ? reportId : null;
}

/**
 * Count reports with a pickable PENDING/RUNNING analysis job that still needs analysis.
 */
export async function countActionableWaiting(): Promise<number> {
  const now = new Date();
  const pendingJobs = await prisma.backgroundJob.findMany({
    where: {
      type: "REPORT_ANALYSIS",
      status: { in: ["PENDING", "RUNNING"] },
      runAfter: { lte: now },
    },
    select: {
      id: true,
      status: true,
      payload: true,
      attempts: true,
      maxAttempts: true,
    },
  });

  const seen = new Set<string>();
  let count = 0;

  for (const job of pendingJobs) {
    const reportId = reportIdFromPayload(job.payload);
    if (!reportId || seen.has(reportId)) continue;
    if (job.attempts >= job.maxAttempts) continue;

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        processingStatus: true,
        insight: { select: { pipelineVersion: true } },
        priorityAssessment: { select: { id: true } },
      },
    });

    if (!report || !needsReportAnalysis(report)) continue;
    if (report.processingStatus === "ANALYSING" && job.status === "PENDING") continue;

    seen.add(reportId);
    count += 1;
  }

  return count;
}

async function dedupePendingAnalysisJobs(): Promise<number> {
  const pending = await prisma.backgroundJob.findMany({
    where: {
      type: "REPORT_ANALYSIS",
      status: "PENDING",
    },
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, payload: true, createdAt: true },
  });

  const keepByReport = new Map<string, string>();
  let deduped = 0;

  for (const job of pending) {
    const reportId = reportIdFromPayload(job.payload);
    if (!reportId) continue;

    if (!keepByReport.has(reportId)) {
      keepByReport.set(reportId, job.id);
      continue;
    }

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error: "Duplicate queue entry removed during reconciliation",
      },
    });
    deduped += 1;
    console.info(
      `[QueueReconcile] stale waiting job cleared duplicate jobId=${job.id} reportId=${reportId}`
    );
  }

  return deduped;
}

async function completeJobsForReadyReports(): Promise<number> {
  const pending = await prisma.backgroundJob.findMany({
    where: {
      type: "REPORT_ANALYSIS",
      status: { in: ["PENDING", "RUNNING"] },
    },
    select: { id: true, payload: true, status: true },
    take: 100,
  });

  let completed = 0;

  for (const job of pending) {
    const reportId = reportIdFromPayload(job.payload);
    if (!reportId) continue;

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        insight: { select: { pipelineVersion: true } },
        priorityAssessment: { select: { id: true } },
      },
    });

    if (!report || !isReportFullyAnalysed(report)) continue;

    if (job.status === "RUNNING") {
      await backgroundJobRepository.markCompleted(job.id, { totalMs: 0 });
    } else {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          error: null,
        },
      });
    }

    if (report.processingStatus !== "INTELLIGENCE_READY") {
      await prisma.report.update({
        where: { id: reportId },
        data: { processingStatus: "INTELLIGENCE_READY", processingError: null },
      });
    }

    completed += 1;
    console.info(
      `[QueueReconcile] stale waiting job cleared ready jobId=${job.id} reportId=${reportId}`
    );
  }

  return completed;
}

async function reconcileWaitingReports(): Promise<{
  fixedQueuedReports: number;
  clearedStaleWaiting: number;
}> {
  let fixedQueuedReports = 0;
  let clearedStaleWaiting = 0;

  const waitingReports = await prisma.report.findMany({
    where: { processingStatus: { in: ["IMPORTED", "QUEUED"] } },
    include: {
      insight: { select: { pipelineVersion: true } },
      priorityAssessment: { select: { id: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  for (const report of waitingReports) {
    const stage = await prisma.backgroundJob.findFirst({
      where: {
        type: "REPORT_ANALYSIS",
        status: { in: ["PENDING", "RUNNING", "FAILED"] },
        payload: { path: ["reportId"], equals: report.id },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, attempts: true, maxAttempts: true },
    });
    const lastStage = stage ? getJobStage(stage.id)?.stage ?? null : null;

    console.info(
      `[QueueReconcile] waiting report found reportId=${report.id} status=${report.processingStatus} jobId=${stage?.id ?? "none"} jobStatus=${stage?.status ?? "none"} lastStage=${lastStage ?? "none"}`
    );

    if (!needsReportAnalysis(report)) {
      await prisma.report.update({
        where: { id: report.id },
        data: { processingStatus: "INTELLIGENCE_READY", processingError: null },
      });
      fixedQueuedReports += 1;
      continue;
    }

    const activeJob = await prisma.backgroundJob.findFirst({
      where: {
        type: "REPORT_ANALYSIS",
        status: { in: ["PENDING", "RUNNING"] },
        payload: { path: ["reportId"], equals: report.id },
        runAfter: { lte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeJob) {
      const failedJobs = await prisma.backgroundJob.count({
        where: {
          type: "REPORT_ANALYSIS",
          status: "FAILED",
          payload: { path: ["reportId"], equals: report.id },
        },
      });
      const stale =
        Date.now() - report.updatedAt.getTime() > STALE_QUEUED_REPORT_MS;

      if (stale && failedJobs > 0) {
        await prisma.report.update({
          where: { id: report.id },
          data: {
            processingStatus: "FAILED",
            processingError: "Analysis abandoned — repeated failures with no active worker job",
          },
        });
        clearedStaleWaiting += 1;
        console.info(
          `[QueueReconcile] orphan queued report reportId=${report.id} marked FAILED`
        );
        continue;
      }

      console.info(
        `[QueueReconcile] orphan queued report reportId=${report.id} re-enqueueing`
      );
      await reportImportService.enqueueForAnalysis(report.id);
      fixedQueuedReports += 1;
      continue;
    }

    if (activeJob.attempts >= activeJob.maxAttempts) {
      await prisma.backgroundJob.update({
        where: { id: activeJob.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error: "Exceeded maximum analysis attempts",
        },
      });
      await prisma.report.update({
        where: { id: report.id },
        data: {
          processingStatus: "FAILED",
          processingError: "Exceeded maximum analysis attempts",
        },
      });
      clearedStaleWaiting += 1;
      console.info(
        `[QueueReconcile] stale waiting job cleared jobId=${activeJob.id} reportId=${report.id}`
      );
    }
  }

  return { fixedQueuedReports, clearedStaleWaiting };
}

/**
 * Lightweight reconciliation safe to run from the web server on each queue poll.
 */
export async function reconcileProcessingState(): Promise<ProcessingReconcileResult> {
  const result: ProcessingReconcileResult = {
    failedStaleJobs: 0,
    fixedAnalysingReports: 0,
    completedOrphanJobs: 0,
    dedupedJobs: 0,
    clearedStaleWaiting: 0,
    fixedQueuedReports: 0,
    completedReadyJobs: 0,
    syncFinished: false,
  };

  result.dedupedJobs = await dedupePendingAnalysisJobs();
  result.completedReadyJobs = await completeJobsForReadyReports();

  const exhaustedPending = await prisma.backgroundJob.findMany({
    where: { type: "REPORT_ANALYSIS", status: "PENDING" },
    select: { id: true, payload: true, attempts: true, maxAttempts: true },
    take: 100,
  });

  for (const job of exhaustedPending) {
    if (job.attempts < job.maxAttempts) continue;
    const reportId = reportIdFromPayload(job.payload);
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error: "Exceeded maximum analysis attempts",
      },
    });
    if (reportId) {
      await prisma.report.updateMany({
        where: { id: reportId, processingStatus: { in: ["QUEUED", "IMPORTED", "ANALYSING"] } },
        data: {
          processingStatus: "FAILED",
          processingError: "Exceeded maximum analysis attempts",
        },
      });
    }
    result.clearedStaleWaiting += 1;
    console.info(
      `[QueueReconcile] stale waiting job cleared jobId=${job.id} reportId=${reportId ?? "unknown"}`
    );
  }

  result.failedStaleJobs = await backgroundJobRepository.failStaleRunningJobs(
    JOB_TIMEOUT_MS
  );

  const staleBefore = new Date(Date.now() - JOB_TIMEOUT_MS);
  const analysingReports = await prisma.report.findMany({
    where: { processingStatus: "ANALYSING" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      processingStatus: true,
      insight: { select: { id: true } },
      priorityAssessment: { select: { id: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 25,
  });

  for (const report of analysingReports) {
    const runningJob = await prisma.backgroundJob.findFirst({
      where: {
        status: "RUNNING",
        type: "REPORT_ANALYSIS",
        payload: { path: ["reportId"], equals: report.id },
      },
      select: { id: true, startedAt: true, type: true },
    });

    const fullyAnalysed = isReportFullyAnalysed({
      insight: report.insight,
      priorityAssessment: report.priorityAssessment,
    });

    if (fullyAnalysed) {
      await prisma.report.update({
        where: { id: report.id },
        data: {
          processingStatus: "INTELLIGENCE_READY",
          processingError: null,
        },
      });
      result.fixedAnalysingReports += 1;
      continue;
    }

    const stuckForMs = Date.now() - report.updatedAt.getTime();
    const isStale = report.updatedAt < staleBefore;

    if (!runningJob) {
      if (isStale) {
        await prisma.report.update({
          where: { id: report.id },
          data: {
            processingStatus: "FAILED",
            processingError: "Analysis timed out — no active worker job",
          },
        });
        result.fixedAnalysingReports += 1;
      } else {
        const pendingJob = await prisma.backgroundJob.findFirst({
          where: {
            status: "PENDING",
            type: "REPORT_ANALYSIS",
            payload: { path: ["reportId"], equals: report.id },
          },
          select: { id: true },
        });
        if (!pendingJob) {
          await reportImportService.enqueueForAnalysis(report.id);
          result.fixedAnalysingReports += 1;
        }
      }
    } else if (
      isStale &&
      runningJob.startedAt &&
      runningJob.startedAt < staleBefore
    ) {
      await prisma.backgroundJob.update({
        where: { id: runningJob.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error: `Force-failed: RUNNING longer than ${Math.round(JOB_TIMEOUT_MS / 1000)}s`,
        },
      });
      await prisma.report.update({
        where: { id: report.id },
        data: {
          processingStatus: "FAILED",
          processingError: `Analysis timed out after ${Math.round(JOB_TIMEOUT_MS / 1000)}s`,
        },
      });
      result.failedStaleJobs += 1;
      result.fixedAnalysingReports += 1;
    }
  }

  const waitingFix = await reconcileWaitingReports();
  result.fixedQueuedReports += waitingFix.fixedQueuedReports;
  result.clearedStaleWaiting += waitingFix.clearedStaleWaiting;

  const orphanRunning = await prisma.backgroundJob.findMany({
    where: {
      status: "RUNNING",
      type: "REPORT_ANALYSIS",
      OR: [{ startedAt: null }, { startedAt: { lt: staleBefore } }],
    },
    select: { id: true, payload: true, startedAt: true },
    take: 25,
  });

  for (const job of orphanRunning) {
    const reportId = reportIdFromPayload(job.payload);
    if (!reportId) continue;

    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { insight: true, priorityAssessment: true },
    });

    if (report && report.processingStatus === "INTELLIGENCE_READY") {
      await backgroundJobRepository.markCompleted(job.id, { totalMs: 0 });
      result.completedOrphanJobs += 1;
    }
  }

  const actionableWaiting = await countActionableWaiting();
  const analysing = await prisma.report.count({
    where: { processingStatus: "ANALYSING" },
  });
  const runningJobs = await prisma.backgroundJob.count({
    where: { status: "RUNNING" },
  });

  result.syncFinished =
    analysing === 0 && actionableWaiting === 0 && runningJobs === 0;

  await ingestionSyncStateRepository
    .updateBackgroundJobsPending(actionableWaiting)
    .catch(() => undefined);

  if (result.syncFinished) {
    console.info("[QueueReconcile] sync finished");
  }

  const changed =
    result.failedStaleJobs > 0 ||
    result.fixedAnalysingReports > 0 ||
    result.completedOrphanJobs > 0 ||
    result.dedupedJobs > 0 ||
    result.clearedStaleWaiting > 0 ||
    result.fixedQueuedReports > 0 ||
    result.completedReadyJobs > 0;

  if (changed) {
    console.info("[QueueReconcile] summary", result);
    notifyWebDashboardRefresh("queue reconcile -> invalidating dashboard");
  }

  return result;
}

export async function diagnoseStuckProcessing(): Promise<{
  runningJobs: Array<{
    id: string;
    type: string;
    reportId: string | null;
    startedAt: string | null;
    runningForMs: number | null;
    lastStage: string | null;
  }>;
  analysingReports: Array<{
    id: string;
    title: string;
    updatedAt: string;
    stuckForMs: number;
    processingStatus: string;
    isActuallyReady: boolean;
    runningJobId: string | null;
    lastStage: string | null;
  }>;
  waitingReports: Array<{
    reportId: string;
    title: string;
    processingStatus: string;
    updatedAt: string;
    jobId: string | null;
    jobStatus: string | null;
    attempts: number | null;
    lastStage: string | null;
    actionable: boolean;
  }>;
}> {
  const now = Date.now();
  const running = await prisma.backgroundJob.findMany({
    where: { status: "RUNNING" },
    orderBy: { startedAt: "asc" },
  });

  const analysing = await prisma.report.findMany({
    where: { processingStatus: "ANALYSING" },
    include: { insight: true, priorityAssessment: true },
    orderBy: { updatedAt: "asc" },
  });

  const waiting = await prisma.report.findMany({
    where: { processingStatus: { in: ["IMPORTED", "QUEUED"] } },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });

  const runningJobs = await Promise.all(
    running.map(async (job) => {
      const reportId = reportIdFromPayload(job.payload);
      const stage = getJobStage(job.id);
      return {
        id: job.id,
        type: job.type,
        reportId,
        startedAt: job.startedAt?.toISOString() ?? null,
        runningForMs: job.startedAt ? now - job.startedAt.getTime() : null,
        lastStage: stage?.stage ?? null,
      };
    })
  );

  const analysingReports = await Promise.all(
    analysing.map(async (report) => {
      const runningJob = await prisma.backgroundJob.findFirst({
        where: {
          status: "RUNNING",
          type: "REPORT_ANALYSIS",
          payload: { path: ["reportId"], equals: report.id },
        },
        select: { id: true },
      });
      const stage = runningJob ? getJobStage(runningJob.id) : null;
      return {
        id: report.id,
        title: report.title,
        updatedAt: report.updatedAt.toISOString(),
        stuckForMs: now - report.updatedAt.getTime(),
        processingStatus: report.processingStatus,
        isActuallyReady: isReportFullyAnalysed(report),
        runningJobId: runningJob?.id ?? null,
        lastStage: stage?.stage ?? null,
      };
    })
  );

  const waitingReports = await Promise.all(
    waiting.map(async (report) => {
      const job = await prisma.backgroundJob.findFirst({
        where: {
          type: "REPORT_ANALYSIS",
          status: { in: ["PENDING", "RUNNING"] },
          payload: { path: ["reportId"], equals: report.id },
        },
        orderBy: { createdAt: "desc" },
      });
      const stage = job ? getJobStage(job.id) : null;
      return {
        reportId: report.id,
        title: report.title,
        processingStatus: report.processingStatus,
        updatedAt: report.updatedAt.toISOString(),
        jobId: job?.id ?? null,
        jobStatus: job?.status ?? null,
        attempts: job?.attempts ?? null,
        lastStage: stage?.stage ?? null,
        actionable:
          Boolean(job) &&
          (job?.attempts ?? 0) < (job?.maxAttempts ?? 3) &&
          needsReportAnalysis(report),
      };
    })
  );

  return { runningJobs, analysingReports, waitingReports };
}
