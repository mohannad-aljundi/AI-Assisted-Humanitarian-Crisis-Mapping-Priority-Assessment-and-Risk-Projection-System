import { incidentCorrelationService } from "@/services/incidentCorrelationService";
import { invalidateCache } from "@/lib/simpleCache";
import { invalidateIncidentCache } from "@/services/incidentCache";
import { prisma } from "@/lib/prisma";

export interface CorrelationBackfillResult {
  total: number;
  correlated: number;
  failed: number;
  clustersCreated: number;
  errors: Array<{ reportId: string; message: string }>;
}

export interface CorrelationBackfillOptions {
  /** Clear existing clusters before re-correlating all reports. */
  reset?: boolean;
}

export class CorrelationBackfillService {
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  async backfillAllReports(
    options: CorrelationBackfillOptions = {}
  ): Promise<CorrelationBackfillResult> {
    if (this.running) {
      throw new Error("Correlation backfill already in progress");
    }

    this.running = true;
    const errors: CorrelationBackfillResult["errors"] = [];
    let correlated = 0;
    let failed = 0;

    try {
      if (options.reset) {
        await prisma.masterIncident.deleteMany({});
        console.log("[Correlation backfill] Cleared existing master incidents");
      }

      const reports = await prisma.report.findMany({
        where: {
          priorityAssessment: { isNot: null },
          reliabilityAssessment: { isNot: null },
        },
        select: { id: true, title: true },
        orderBy: [{ reportDate: "asc" }, { createdAt: "asc" }],
      });

      for (const report of reports) {
        try {
          await incidentCorrelationService.correlateReport(report.id, { backfill: true });
          correlated += 1;
          if (correlated % 25 === 0 || correlated === reports.length) {
            console.log(
              `[Correlation backfill] ${correlated}/${reports.length} — ${report.id}`
            );
          }
        } catch (error) {
          failed += 1;
          const message =
            error instanceof Error ? error.message : "Unknown correlation error";
          errors.push({ reportId: report.id, message });
          console.error(`[Correlation backfill] failed ${report.id}:`, message);
        }
      }

      const clustersCreated = await prisma.masterIncident.count();

      invalidateCache("dashboard:");
      invalidateCache("map:");
      invalidateIncidentCache();

      return {
        total: reports.length,
        correlated,
        failed,
        clustersCreated,
        errors,
      };
    } finally {
      this.running = false;
    }
  }
}

export const correlationBackfillService = new CorrelationBackfillService();
