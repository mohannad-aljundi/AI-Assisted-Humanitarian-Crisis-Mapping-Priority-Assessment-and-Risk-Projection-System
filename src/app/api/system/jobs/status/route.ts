import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllJobStages, getJobStage } from "@/lib/jobStageTracker";
import { backgroundJobRepository } from "@/repositories/backgroundJobRepository";
import { reportImportService } from "@/services/reportImportService";
import { backgroundJobWorkerService } from "@/services/backgroundJobWorkerService";
import { getWorkerRuntimeSummary } from "@/lib/workerRuntime";
import { getAiConfig, getAiKeyPresence, getAiProviderSummary } from "@/lib/aiResolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jobDurationMs(startedAt: Date | null, completedAt: Date | null): number | null {
  if (!startedAt) return null;
  const end = completedAt ?? new Date();
  return Math.max(0, end.getTime() - startedAt.getTime());
}

export async function GET() {
  try {
    const [running, pending, failed, reportCounts, worker] = await Promise.all([
      backgroundJobRepository.listJobsByStatus(["RUNNING"], 50),
      backgroundJobRepository.listJobsByStatus(["PENDING"], 50),
      backgroundJobRepository.listJobsByStatus(["FAILED"], 50),
      reportImportService.getProcessingCounts(),
      backgroundJobWorkerService.getWorkerSnapshot(),
    ]);

    const mapJob = (job: (typeof running)[number]) => {
      const payload = job.payload as { reportId?: string; dedupeKey?: string } | null;
      const stage = getJobStage(job.id);
      return {
        id: job.id,
        type: job.type,
        status: job.status,
        reportId: payload?.reportId ?? null,
        startedAt: job.startedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
        durationMs: jobDurationMs(job.startedAt, job.completedAt),
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        currentStage: stage?.stage ?? null,
        stageUpdatedAt: stage?.updatedAt ?? null,
        lastError: job.error,
      };
    };

    const analysingReports = await prisma.report.findMany({
      where: { processingStatus: "ANALYSING" },
      select: {
        id: true,
        title: true,
        incidentLabel: true,
        processingStatus: true,
        processingError: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 50,
    });

    const mismatches: Array<{
      reportId: string;
      processingStatus: string;
      jobId: string | null;
      jobStatus: string | null;
      type: string;
    }> = [];

    for (const report of analysingReports) {
      const job = await prisma.backgroundJob.findFirst({
        where: {
          payload: { path: ["reportId"], equals: report.id },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!job) {
        mismatches.push({
          reportId: report.id,
          processingStatus: report.processingStatus,
          jobId: null,
          jobStatus: null,
          type: "NO_JOB_ANALYSING_REPORT",
        });
      } else if (job.status === "COMPLETED") {
        mismatches.push({
          reportId: report.id,
          processingStatus: report.processingStatus,
          jobId: job.id,
          jobStatus: job.status,
          type: "COMPLETED_JOB_ANALYSING_REPORT",
        });
      } else if (job.status === "FAILED") {
        mismatches.push({
          reportId: report.id,
          processingStatus: report.processingStatus,
          jobId: job.id,
          jobStatus: job.status,
          type: "FAILED_JOB_ANALYSING_REPORT",
        });
      }
    }

    for (const job of running) {
      const payload = job.payload as { reportId?: string } | null;
      if (!payload?.reportId || job.type !== "REPORT_ANALYSIS") continue;
      const report = await prisma.report.findUnique({
        where: { id: payload.reportId },
        select: { processingStatus: true },
      });
      if (report?.processingStatus === "INTELLIGENCE_READY") {
        mismatches.push({
          reportId: payload.reportId,
          processingStatus: report.processingStatus,
          jobId: job.id,
          jobStatus: job.status,
          type: "RUNNING_JOB_READY_REPORT",
        });
      }
    }

    const completedCount = await prisma.backgroundJob.count({
      where: { status: "COMPLETED" },
    });
    const failedCount = await prisma.backgroundJob.count({
      where: { status: "FAILED" },
    });

    const config = getAiConfig();
    const keys = getAiKeyPresence();
    const summary = getAiProviderSummary();

    return NextResponse.json({
      worker,
      workerRuntime: getWorkerRuntimeSummary(),
      reportCounts: {
        imported: reportCounts.IMPORTED,
        queued: reportCounts.QUEUED,
        analysing: reportCounts.ANALYSING,
        intelligenceReady: reportCounts.INTELLIGENCE_READY,
        failed: reportCounts.FAILED,
      },
      jobs: {
        running: running.map(mapJob),
        queued: pending.map(mapJob),
        failed: failed.map(mapJob),
        completedCount,
        failedCount,
      },
      mismatches,
      analysingReports: analysingReports.map((report) => ({
        reportId: report.id,
        title: report.incidentLabel ?? report.title,
        processingStatus: report.processingStatus,
        processingError: report.processingError,
        updatedAt: report.updatedAt.toISOString(),
        stuckForMs: Date.now() - report.updatedAt.getTime(),
      })),
      liveStages: getAllJobStages(),
      ai: {
        openAiKeyPresent: keys.openai,
        aiProviderEnv: process.env.AI_PROVIDER?.trim() || "openai",
        openAiModel: config.openAiModel,
        primaryProvider: summary.activeProvider,
        activeModel: summary.activeModel,
        backups: summary.backupProviders,
      },
      at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/** POST forces recovery of stuck RUNNING/ANALYSING work and restarts the worker. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { forceAll?: boolean };
    const recovery = await backgroundJobWorkerService.forceRecoverStuckWork({
      forceAll: body.forceAll === true,
    });
    return NextResponse.json({ ok: true, recovery });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
