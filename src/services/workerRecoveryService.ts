import { backgroundJobRepository } from "@/repositories/backgroundJobRepository";
import { reportImportService } from "@/services/reportImportService";
import { reportProcessingService } from "@/services/reportProcessingService";
import { backgroundJobWorkerService } from "@/services/backgroundJobWorkerService";
import { requestWorkerStart } from "@/lib/workerLauncher";
import { logImportPipeline } from "@/lib/importPipelineLogger";

export interface WorkerRecoveryResult {
  retriedJobs: number;
  requeuedReports: number;
  failedStuckJobs: number;
  resetAnalysingReports: number;
}

export async function recoverAnalysisWorkerQueue(options?: {
  forceAll?: boolean;
}): Promise<WorkerRecoveryResult> {
  try {
    // Startup uses forceAll to clear frozen counters; normal sync only clears timed-out work.
    const recovery = await backgroundJobWorkerService.forceRecoverStuckWork({
      forceAll: options?.forceAll === true,
    });

    const retriedJobs = await backgroundJobRepository.retryFailedJobs([
      "REPORT_ANALYSIS",
    ]);
    const requeuedReports = await reportImportService.reconcilePendingReports();

    const result: WorkerRecoveryResult = {
      retriedJobs,
      requeuedReports,
      failedStuckJobs: recovery.failedJobs,
      resetAnalysingReports: recovery.requeuedReports,
    };

    if (
      result.retriedJobs > 0 ||
      result.requeuedReports > 0 ||
      result.failedStuckJobs > 0 ||
      result.resetAnalysingReports > 0
    ) {
      logImportPipeline("reconcile_pending", result);
      console.info(
        `[ImportPipeline] Worker recovery: failedStuck=${result.failedStuckJobs}, ` +
          `resetAnalysing=${result.resetAnalysingReports}, ` +
          `retriedFailed=${result.retriedJobs}, requeued=${result.requeuedReports}`
      );
    }

    await requestWorkerStart("worker-recovery");
    return result;  } catch (error) {
    console.warn(
      "[ImportPipeline] Worker recovery skipped — database unreachable:",
      error instanceof Error ? error.message : error
    );
    return {
      retriedJobs: 0,
      requeuedReports: 0,
      failedStuckJobs: 0,
      resetAnalysingReports: 0,
    };
  }
}
