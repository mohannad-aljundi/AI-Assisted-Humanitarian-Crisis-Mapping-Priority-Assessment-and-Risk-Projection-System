import { prisma } from "@/lib/prisma";
import {
  REANALYZE_REASON_OPENAI_UPGRADE,
  TARGET_PIPELINE_VERSION,
} from "@/lib/pipelineVersions";
import { invalidateCache } from "@/lib/simpleCache";
import { invalidateIncidentCache } from "@/services/incidentCache";
import { analysisService } from "@/services/analysisService";

export interface OneTimeReanalysisProgress {
  total: number;
  processed: number;
  upgraded: number;
  skipped: number;
  failed: number;
  currentReportId: string | null;
  errors: Array<{ reportId: string; message: string }>;
}

export interface OneTimeReanalysisResult {
  total: number;
  upgraded: number;
  skipped: number;
  failed: number;
  errors: Array<{ reportId: string; message: string }>;
  durationMs: number;
}

export interface OneTimeReanalysisStatus {
  total: number;
  upgraded: number;
  pending: number;
  complete: boolean;
  targetPipelineVersion: string;
  reanalyzeReason: string;
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export class OneTimeReanalysisService {
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  async getUpgradeStatus(): Promise<OneTimeReanalysisStatus> {
    const reports = await prisma.report.findMany({
      where: { duplicateOfReportId: null },
      select: {
        insight: { select: { pipelineVersion: true } },
      },
    });

    const total = reports.length;
    const upgraded = reports.filter(
      (report) => report.insight?.pipelineVersion === TARGET_PIPELINE_VERSION
    ).length;

    return {
      total,
      upgraded,
      pending: total - upgraded,
      complete: upgraded === total,
      targetPipelineVersion: TARGET_PIPELINE_VERSION,
      reanalyzeReason: REANALYZE_REASON_OPENAI_UPGRADE,
    };
  }

  /**
   * One-time OpenAI upgrade reanalysis — manual trigger only (System Health / API).
   * Skips reports already at TARGET_PIPELINE_VERSION.
   */
  async runOpenAiUpgradeReanalysis(
    onProgress?: (progress: OneTimeReanalysisProgress) => void
  ): Promise<OneTimeReanalysisResult> {
    if (this.running) {
      throw new Error("One-time reanalysis already in progress");
    }

    this.running = true;
    const start = Date.now();

    const reports = await prisma.report.findMany({
      where: { duplicateOfReportId: null },
      select: {
        id: true,
        insight: { select: { pipelineVersion: true } },
      },
      orderBy: { reportDate: "asc" },
    });

    const progress: OneTimeReanalysisProgress = {
      total: reports.length,
      processed: 0,
      upgraded: 0,
      skipped: 0,
      failed: 0,
      currentReportId: null,
      errors: [],
    };

    for (let index = 0; index < reports.length; index++) {
      const report = reports[index]!;
      progress.currentReportId = report.id;
      onProgress?.({ ...progress });

      if (report.insight?.pipelineVersion === TARGET_PIPELINE_VERSION) {
        progress.skipped += 1;
        progress.processed += 1;
        console.log(
          `[OneTimeReanalysis] skipped already upgraded (${index + 1}/${reports.length}) — ${report.id}`
        );
        await yieldEventLoop();
        continue;
      }

      console.log(
        `[OneTimeReanalysis] ${index + 1}/${reports.length} started — ${report.id}`
      );

      try {
        await analysisService.reanalyzeExisting(report.id, {
          reanalysisReason: REANALYZE_REASON_OPENAI_UPGRADE,
        });
        invalidateIncidentCache(report.id);
        progress.upgraded += 1;
        console.log(
          `[OneTimeReanalysis] ${index + 1}/${reports.length} completed — ${report.id}`
        );
      } catch (error) {
        progress.failed += 1;
        progress.errors.push({
          reportId: report.id,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        console.error(
          `[OneTimeReanalysis] ${index + 1}/${reports.length} failed — ${report.id}:`,
          error
        );
      } finally {
        progress.processed += 1;
      }

      onProgress?.({ ...progress });
      await yieldEventLoop();
    }

    this.running = false;
    progress.currentReportId = null;
    invalidateIncidentCache();
    invalidateCache("dashboard:");
    invalidateCache("map:");

    return {
      total: progress.total,
      upgraded: progress.upgraded,
      skipped: progress.skipped,
      failed: progress.failed,
      errors: progress.errors,
      durationMs: Date.now() - start,
    };
  }
}

export const oneTimeReanalysisService = new OneTimeReanalysisService();
