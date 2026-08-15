import { invalidateCache } from "@/lib/simpleCache";
import { logImportPipeline } from "@/lib/importPipelineLogger";
import {
  clearJobStage,
  runWithJobContext,
  setJobStage,
} from "@/lib/jobStageTracker";
import {
  getWorkerConcurrency,
  isDedicatedWorkerProcess,
  isMasterIntelligenceDisabledDuringDemo,
  JOB_TIMEOUT_MS,
  shouldRunBackgroundWorker,
} from "@/lib/workerRuntime";
import { backgroundJobRepository } from "@/repositories/backgroundJobRepository";
import { ingestionSyncStateRepository } from "@/repositories/ingestionSyncStateRepository";
import { reportProcessingService } from "@/services/reportProcessingService";
import { prisma } from "@/lib/prisma";

const IDLE_POLL_MS = 750;
const CONNECTION_BACKOFF_MS = 5_000;
const MAX_CONNECTION_BACKOFF_MS = 30_000;
/** Startup / sweep: any RUNNING job older than this is force-failed. */
export const STALE_RUNNING_MAX_AGE_MS = 5 * 60_000;
/** How often to sweep stale RUNNING jobs / ANALYSING reports. */
const STALE_SWEEP_MS = 10_000;
/** Worker heartbeat interval for observability. */
const HEARTBEAT_MS = 5_000;

export { JOB_TIMEOUT_MS };

function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "P1017" || code === "P1001" || code === "P1002" || code === "P1008") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Server has closed the connection") ||
    message.includes("Can't reach database server") ||
    message.includes("Connection reset") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Connection refused")
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class BackgroundJobWorkerService {
  private loopActive = false;
  private activeWorkers = 0;
  private connectionBackoffMs = CONNECTION_BACKOFF_MS;
  private lastStaleSweepAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private globalSweepTimer: ReturnType<typeof setInterval> | null = null;
  private lastExitReason: string | null = null;

  ensureRunning(): void {
    if (!shouldRunBackgroundWorker()) {
      return;
    }

    this.startGlobalStaleSweeper();
    this.startHeartbeat();

    if (this.loopActive) return;
    this.loopActive = true;
    this.lastExitReason = null;
    void this.runLoop().catch((error) => {
      this.loopActive = false;
      this.lastExitReason = error instanceof Error ? error.message : String(error);
      console.error(
        "[BackgroundWorker] Loop crashed unexpectedly:",
        this.lastExitReason
      );
    });
  }

  /** Runs even when the worker loop is idle or dead — prevents zombie RUNNING jobs. */
  private startGlobalStaleSweeper(): void {
    if (!shouldRunBackgroundWorker()) return;
    if (this.globalSweepTimer) return;
    this.globalSweepTimer = setInterval(() => {
      void this.sweepStaleWork().catch(() => undefined);
    }, STALE_SWEEP_MS);
    if (typeof this.globalSweepTimer === "object" && "unref" in this.globalSweepTimer) {
      this.globalSweepTimer.unref();
    }
  }

  private startHeartbeat(): void {
    if (!shouldRunBackgroundWorker()) return;
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      void this.logHeartbeat().catch(() => undefined);
    }, HEARTBEAT_MS);
    if (typeof this.heartbeatTimer === "object" && "unref" in this.heartbeatTimer) {
      this.heartbeatTimer.unref();
    }
  }

  private async logHeartbeat(): Promise<void> {
    try {
      const stats = await backgroundJobRepository.getQueueStats();
      const pending = stats.pending + stats.running;
      console.info(
        `[BackgroundWorker] heartbeat loopActive=${this.loopActive} activeWorkers=${this.activeWorkers} ` +
          `pending=${stats.pending} running=${stats.running} failed=${stats.failed} ` +
          `queueLength=${pending}` +
          (this.lastExitReason ? ` lastExit=${this.lastExitReason}` : "")
      );

      // If jobs are stuck RUNNING but the loop died, restart processing.
      if (!this.loopActive && (stats.running > 0 || stats.pending > 0)) {
        console.warn(
          `[BackgroundWorker] Worker loop inactive with ${stats.running} RUNNING / ${stats.pending} PENDING — restarting`
        );
        this.ensureRunning();
      }
    } catch (error) {
      if (!isConnectionError(error)) {
        console.warn(
          "[BackgroundWorker] Heartbeat failed:",
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  private async sweepStaleWork(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastStaleSweepAt < STALE_SWEEP_MS) return;
    this.lastStaleSweepAt = now;

    try {
      // Jobs past the hard timeout → FAILED (never stay RUNNING).
      const ageMs = force ? STALE_RUNNING_MAX_AGE_MS : JOB_TIMEOUT_MS;
      const failedJobs = await backgroundJobRepository.failStaleRunningJobs(ageMs);
      if (failedJobs > 0) {
        console.warn(
          `[BackgroundWorker] Force-failed ${failedJobs} RUNNING job(s) older than ${ageMs / 1000}s`
        );
      }

      const resetReports = await reportProcessingService.resetStaleAnalysingReports(ageMs);
      if (resetReports > 0) {
        console.warn(
          `[BackgroundWorker] Reset ${resetReports} stale ANALYSING report(s) to QUEUED`
        );
      }
    } catch (error) {
      if (!isConnectionError(error)) {
        console.warn("[BackgroundWorker] Stale sweep failed:", error);
      }
    }
  }

  /**
   * Clears stuck work. Use forceAll=true only from the admin endpoint when
   * counters are frozen and no legitimate work should remain RUNNING.
   */
  async forceRecoverStuckWork(options?: {
    forceAll?: boolean;
  }): Promise<{ failedJobs: number; requeuedReports: number }> {
    const ageMs = options?.forceAll ? 0 : JOB_TIMEOUT_MS;
    const failedJobs = await backgroundJobRepository.failStaleRunningJobs(ageMs);
    const requeuedReports = await reportProcessingService.resetStaleAnalysingReports(ageMs);
    console.info(
      `[BackgroundWorker] Force recovery: failedJobs=${failedJobs}, requeuedReports=${requeuedReports}, forceAll=${Boolean(options?.forceAll)}`
    );
    this.ensureRunning();
    return { failedJobs, requeuedReports };
  }

  private async runLoop(): Promise<void> {
    try {
      await this.sweepStaleWork(true);

      while (true) {
        try {
          await this.sweepStaleWork();

          if (this.connectionBackoffMs !== CONNECTION_BACKOFF_MS) {
            await this.sweepStaleWork(true);
            this.connectionBackoffMs = CONNECTION_BACKOFF_MS;
          }

          while (this.activeWorkers < getWorkerConcurrency()) {
            const job = await backgroundJobRepository.claimNext();
            if (!job) break;

            if (
              job.type === "MASTER_INTELLIGENCE" &&
              isMasterIntelligenceDisabledDuringDemo()
            ) {
              await this.finalizeJob(job.id, "COMPLETED", { masterIncidentMs: 0 });
              continue;
            }

            logImportPipeline("worker_claimed", {
              jobId: job.id,
              type: job.type,
              attempts: job.attempts,
            });

            this.activeWorkers += 1;
            void this.executeJob(job.id)
              .catch((error) => {
                console.error(
                  `[BackgroundWorker] Unhandled job error ${job.id}:`,
                  error
                );
              })
              .finally(() => {
                this.activeWorkers -= 1;
              });
          }

          const pending = await backgroundJobRepository.countPending();
          await ingestionSyncStateRepository
            .updateBackgroundJobsPending(pending)
            .catch(() => undefined);

          if (pending === 0 && this.activeWorkers === 0) {
            const stats = await backgroundJobRepository.getQueueStats();
            if (stats.running > 0) {
              console.warn(
                `[BackgroundWorker] Loop would idle but ${stats.running} RUNNING job(s) remain — sweeping`
              );
              await this.sweepStaleWork(true);
              continue;
            }

            if (isDedicatedWorkerProcess()) {
              await sleep(IDLE_POLL_MS);
              continue;
            }

            this.lastExitReason = "queue_empty";
            logImportPipeline("worker_idle", { pendingJobs: 0 });
            invalidateCache("dashboard:");
            invalidateCache("map:");
            break;
          }

          await sleep(IDLE_POLL_MS);
        } catch (error) {
          if (isConnectionError(error)) {
            console.warn(
              `[BackgroundWorker] Database connection lost — retrying in ${this.connectionBackoffMs}ms:`,
              error instanceof Error ? error.message : error
            );
            await sleep(this.connectionBackoffMs);
            this.connectionBackoffMs = Math.min(
              this.connectionBackoffMs * 2,
              MAX_CONNECTION_BACKOFF_MS
            );
            continue;
          }

          console.error("[BackgroundWorker] Loop error:", error);
          await sleep(IDLE_POLL_MS);
        }
      }
    } finally {
      this.loopActive = false;
    }
  }

  private async finalizeJob(
    jobId: string,
    outcome: "COMPLETED" | "FAILED",
    timingMs?: Record<string, number>,
    error?: string
  ): Promise<void> {
    try {
      if (outcome === "COMPLETED") {
        await backgroundJobRepository.markCompleted(jobId, timingMs);
        setJobStage(jobId, "analysis_completed");
        console.info(`[BackgroundWorker] Job ${jobId} → COMPLETED`);
      } else {
        // Terminal FAILED — do not auto-retry timeouts (releases the worker slot).
        await prisma.backgroundJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            error: error ?? "Unknown error",
          },
        });
        setJobStage(jobId, "analysis_failed", { detail: error });
        console.info(`[BackgroundWorker] Job ${jobId} → FAILED: ${error}`);
      }
    } catch (markError) {
      console.error(
        `[BackgroundWorker] Could not finalize job ${jobId} as ${outcome}:`,
        markError instanceof Error ? markError.message : markError
      );
      try {
        await prisma.backgroundJob.update({
          where: { id: jobId },
          data: {
            status: outcome === "COMPLETED" ? "COMPLETED" : "FAILED",
            completedAt: new Date(),
            error: error ?? (outcome === "FAILED" ? "Finalize failed" : null),
          },
        });
      } catch {
        console.error(
          `[BackgroundWorker] CRITICAL: job ${jobId} may remain RUNNING — will be swept as stale`
        );
      }
    } finally {
      // Keep stage briefly for the status endpoint, then clear.
      setTimeout(() => clearJobStage(jobId), 60_000);
    }
  }

  private async executeJob(jobId: string): Promise<void> {
    let job: Awaited<ReturnType<typeof prisma.backgroundJob.findUnique>>;
    try {
      job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    } catch (error) {
      if (isConnectionError(error)) {
        console.warn(
          `[BackgroundWorker] Connection lost while loading job ${jobId}:`,
          error instanceof Error ? error.message : error
        );
        await this.finalizeJob(jobId, "FAILED", undefined, "Database connection lost");
        return;
      }
      await this.finalizeJob(jobId, "FAILED", undefined, String(error));
      return;
    }

    if (!job) {
      console.warn(`[BackgroundWorker] Job ${jobId} not found`);
      return;
    }
    if (job.status !== "RUNNING") {
      console.warn(
        `[BackgroundWorker] Job ${jobId} status is ${job.status}, expected RUNNING`
      );
      return;
    }

    const reportId = (job.payload as { reportId?: string } | null)?.reportId;
    setJobStage(jobId, "claimed", { reportId });

    try {
      let timingMs: Record<string, number> = {};

      const work = async () => {
        switch (job!.type) {
          case "REPORT_ANALYSIS": {
            if (!reportId) throw new Error("Missing reportId in REPORT_ANALYSIS job");
            const timing = await runWithJobContext(jobId, () =>
              reportProcessingService.processReportAnalysis(reportId)
            );
            timingMs = {
              aiAnalysisMs: timing.aiAnalysisMs ?? 0,
              correlationMs: timing.correlationMs ?? 0,
              totalMs: timing.totalMs,
            };
            break;
          }
          case "MASTER_INTELLIGENCE": {
            const payload = job!.payload as {
              masterIncidentId?: string;
              memberCount?: number;
            };
            if (!payload.masterIncidentId) {
              throw new Error("Missing masterIncidentId in MASTER_INTELLIGENCE job");
            }
            const elapsed = await reportProcessingService.processMasterIntelligence(
              payload.masterIncidentId,
              payload.memberCount ?? 1
            );
            timingMs = { masterIncidentMs: elapsed };
            break;
          }
          case "CHLE_RECORD": {
            if (!reportId) throw new Error("Missing reportId in CHLE_RECORD job");
            const elapsed = await reportProcessingService.processChleRecord(reportId);
            timingMs = { chleMs: elapsed };
            break;
          }
          default:
            throw new Error(`Unknown job type: ${job!.type as string}`);
        }
      };

      await withTimeout(work(), JOB_TIMEOUT_MS, `Job ${jobId} (${job.type})`);
      await this.finalizeJob(jobId, "COMPLETED", timingMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[BackgroundWorker] Job ${jobId} failed:`, message);

      if (message.includes("timed out")) {
        setJobStage(jobId, "timed_out", { reportId, detail: message });
      }

      await this.finalizeJob(jobId, "FAILED", undefined, message);

      if (job.type === "REPORT_ANALYSIS" && reportId) {
        await reportProcessingService
          .markReportFailed(reportId, message)
          .catch(() => undefined);
      }
    }
  }

  async getWorkerSnapshot(): Promise<{
    active: boolean;
    loopActive: boolean;
    activeWorkers: number;
    pendingJobs: number;
    runningJobs: number;
    lastExitReason: string | null;
  }> {
    try {
      const stats = await backgroundJobRepository.getQueueStats();
      return {
        active: this.loopActive || stats.pending > 0 || stats.running > 0,
        loopActive: this.loopActive,
        activeWorkers: this.activeWorkers,
        pendingJobs: stats.pending,
        runningJobs: stats.running,
        lastExitReason: this.lastExitReason,
      };
    } catch (error) {
      if (isConnectionError(error)) {
        return {
          active: this.loopActive,
          loopActive: this.loopActive,
          activeWorkers: this.activeWorkers,
          pendingJobs: 0,
          runningJobs: 0,
          lastExitReason: this.lastExitReason,
        };
      }
      throw error;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const backgroundJobWorkerService = new BackgroundJobWorkerService();
