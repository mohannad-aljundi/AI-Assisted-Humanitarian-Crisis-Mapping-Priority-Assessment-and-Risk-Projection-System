import { buildNlpViewReadOnly } from "@/lib/analysisView";
import { prisma } from "@/lib/prisma";
import { analysisService } from "@/services/analysisService";
import { continuousHumanitarianLearningEngine } from "@/services/continuousHumanitarianLearningEngine";

export interface ChleBackfillResult {
  total: number;
  upserted: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ reportId: string; message: string }>;
  durationMs: number;
}

export class ChleBackfillService {
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Syncs LearningCase snapshots from persisted analysis only — no AI or re-analysis.
   * Idempotent: upserts by reportId.
   */
  async backfillLearningCases(): Promise<ChleBackfillResult> {
    if (this.running) {
      throw new Error("CHLE backfill already in progress");
    }

    this.running = true;
    const start = Date.now();

    try {
      const reports = await prisma.report.findMany({
        where: { duplicateOfReportId: null },
        select: { id: true, title: true },
        orderBy: { reportDate: "asc" },
      });

      const existingCaseReportIds = new Set(
        (
          await prisma.learningCase.findMany({
            where: { reportId: { in: reports.map((report) => report.id) } },
            select: { reportId: true },
          })
        ).map((row) => row.reportId)
      );

      let upserted = 0;
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const errors: ChleBackfillResult["errors"] = [];

      for (const report of reports) {
        try {
          const view = await analysisService.getByReportIdForView(report.id);
          if (!view) {
            skipped += 1;
            console.log(`[CHLE backfill] skip (no analysis): ${report.id} — ${report.title}`);
            continue;
          }

          const existed = existingCaseReportIds.has(report.id);

          await continuousHumanitarianLearningEngine.recordAnalysisSnapshot({
            reportId: report.id,
            title: view.report.title,
            content: view.report.content,
            nlp:
              view.nlp ??
              buildNlpViewReadOnly(view.extractedEntities, view.crisis),
            priorityLevel: view.priorityAssessment.priorityLevel,
            riskLevel: view.riskProjection?.riskLevel ?? null,
            reliabilityScore: view.reliabilityAssessment.finalScore,
            insight: view.insight ?? null,
            contentFingerprint: view.report.contentFingerprint ?? null,
          });

          upserted += 1;
          if (existed) {
            updated += 1;
          } else {
            created += 1;
            existingCaseReportIds.add(report.id);
          }

          console.log(
            `[CHLE backfill] ${upserted + skipped + failed}/${reports.length} — ${report.id}`
          );
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : "Unknown error";
          errors.push({ reportId: report.id, message });
          console.error(`[CHLE backfill] failed ${report.id}:`, message);
        }
      }

      return {
        total: reports.length,
        upserted,
        created,
        updated,
        skipped,
        failed,
        errors,
        durationMs: Date.now() - start,
      };
    } finally {
      this.running = false;
    }
  }
}

export const chleBackfillService = new ChleBackfillService();
