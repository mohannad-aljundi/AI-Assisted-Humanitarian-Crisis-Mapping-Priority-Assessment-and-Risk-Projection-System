import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/simpleCache";
import { invalidateIncidentCache } from "@/services/incidentCache";
import { analysisService } from "@/services/analysisService";

export interface ReanalysisProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentReportId: string | null;
  errors: Array<{ reportId: string; message: string }>;
}

export interface ReanalysisResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ reportId: string; message: string }>;
  durationMs: number;
}

const BATCH_SIZE = 5;

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export class ReanalysisService {
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Re-runs the full explainable AI pipeline for every non-duplicate report:
   * final reasoning, dimension reasonings, entity extraction, scores, location/cross-source insight.
   * Trigger via POST /api/system/reanalyze or System Health panel.
   */
  async reanalyzeAll(
    onProgress?: (progress: ReanalysisProgress) => void
  ): Promise<ReanalysisResult> {
    if (this.running) {
      throw new Error("Reanalysis already in progress");
    }

    this.running = true;
    const start = Date.now();

    const reports = await prisma.report.findMany({
      where: { duplicateOfReportId: null },
      select: { id: true },
      orderBy: { reportDate: "asc" },
    });

    const progress: ReanalysisProgress = {
      total: reports.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      currentReportId: null,
      errors: [],
    };

    for (let i = 0; i < reports.length; i += BATCH_SIZE) {
      const batch = reports.slice(i, i + BATCH_SIZE);
      for (const report of batch) {
        progress.currentReportId = report.id;
        onProgress?.({ ...progress });

        try {
          await analysisService.reanalyzeExisting(report.id);
          invalidateIncidentCache(report.id);
          progress.succeeded += 1;
          console.log(`[Reanalysis] ${progress.succeeded}/${progress.total} — ${report.id}`);
        } catch (error) {
          progress.failed += 1;
          progress.errors.push({
            reportId: report.id,
            message: error instanceof Error ? error.message : "Unknown error",
          });
          console.error(`[Reanalysis] Failed ${report.id}:`, error);
        } finally {
          progress.processed += 1;
        }

        await yieldEventLoop();
      }
      onProgress?.({ ...progress });
    }

    this.running = false;
    progress.currentReportId = null;
    invalidateIncidentCache();
    invalidateCache("dashboard:");
    invalidateCache("map:");

    return {
      total: progress.total,
      succeeded: progress.succeeded,
      failed: progress.failed,
      errors: progress.errors,
      durationMs: Date.now() - start,
    };
  }
}

export const reanalysisService = new ReanalysisService();
