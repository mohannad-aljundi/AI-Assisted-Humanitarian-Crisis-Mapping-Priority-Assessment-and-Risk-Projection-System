import { prisma } from "@/lib/prisma";
import { logImportPipeline } from "@/lib/importPipelineLogger";
import { logSyncTiming, type SyncTimingBreakdown } from "@/lib/syncTimingLogger";
import { isReportFullyAnalysed } from "@/lib/reportAnalysisStatus";
import { analysisService } from "@/services/analysisService";
import { incidentCorrelationService } from "@/services/incidentCorrelationService";
import { backgroundJobRepository } from "@/repositories/backgroundJobRepository";
import { continuousHumanitarianLearningEngine } from "@/services/continuousHumanitarianLearningEngine";
import { multiSourceVerificationService } from "@/services/multiSourceVerificationService";
import { intelligenceFusionService } from "@/services/intelligenceFusionService";
import { alertService } from "@/services/alertService";
import { analysisLiveService } from "@/services/analysisLiveService";
import { crisisCoordinateRepairService } from "@/services/crisisCoordinateRepairService";
import {
  invalidateDashboardCache,
  notifyWebDashboardRefresh,
} from "@/services/dashboardRefreshService";
import { invalidateIncidentCache } from "@/services/incidentCache";
import { logAnalysisStage } from "@/lib/jobStageTracker";
import { isMasterIntelligenceDisabledDuringDemo } from "@/lib/workerRuntime";

export class ReportProcessingService {
  async shouldSkipReport(reportId: string): Promise<boolean> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { insight: true, priorityAssessment: true },
    });

    if (!report) return true;

    return isReportFullyAnalysed(report);
  }

  async processReportAnalysis(reportId: string): Promise<SyncTimingBreakdown> {
    const timing: SyncTimingBreakdown = {
      fetchMs: 0,
      saveMs: 0,
      enqueueMs: 0,
      totalMs: 0,
    };
    const started = Date.now();

    if (await this.shouldSkipReport(reportId)) {
      timing.totalMs = Date.now() - started;
      // Ensure status is terminal even if a prior run left it ANALYSING.
      await prisma.report.update({
        where: { id: reportId },
        data: { processingStatus: "INTELLIGENCE_READY", processingError: null },
      });
      logImportPipeline("analysis_skipped", { reportId, reason: "already_analysed" });
      logImportPipeline("processing_status=INTELLIGENCE_READY", { reportId, skipped: true });
      void analysisLiveService
        .publishCompleted(reportId, timing.totalMs)
        .catch(() => undefined);
      return timing;
    }

    logImportPipeline("analysis_started", { reportId });
    logAnalysisStage("analysis_started", reportId);

    await prisma.report.update({
      where: { id: reportId },
      data: { processingStatus: "ANALYSING", processingError: null },
    });

    void analysisLiveService.publishStarted(reportId).catch((error) => {
      console.warn("[ReportProcessing] Live start event failed:", error);
    });

    try {
      const aiStart = Date.now();
      logAnalysisStage("ai_request_started", reportId);
      logImportPipeline("ai_request_started", { reportId, mode: "unified_single_call" });
      const saved = await analysisService.analyseImportedReport(reportId, {
        skipPostProcessing: true,
      });
      timing.aiAnalysisMs = Date.now() - aiStart;
      logAnalysisStage("ai_request_finished", reportId, `${timing.aiAnalysisMs}ms`);
      logImportPipeline("ai_request_finished", {
        reportId,
        durationMs: timing.aiAnalysisMs,
      });

      if (!saved.saved) {
        throw new Error("Analysis did not persist report data");
      }

      logAnalysisStage("db_save_completed", reportId);
      logImportPipeline("db_save_completed", {
        reportId,
        saved: true,
        durationMs: timing.aiAnalysisMs,
      });

      const verifyStart = Date.now();
      try {
        const verification = await multiSourceVerificationService.verifyAfterReport(
          reportId
        );
        await intelligenceFusionService.applyVerificationBoost(reportId, verification);
        await intelligenceFusionService.applyContradictionPenalty(reportId, verification);
        await alertService.generateForReport(reportId, verification);
      } catch (error) {
        console.warn(
          `[ReportProcessing] Post-verification failed for ${reportId}:`,
          error
        );
      }
      timing.saveMs += Date.now() - verifyStart;

      const corrStart = Date.now();
      const clusterSummary = await incidentCorrelationService.correlateReport(reportId, {
        deferIntelligence: true,
      });
      timing.correlationMs = Date.now() - corrStart;

      if (clusterSummary?.id && !isMasterIntelligenceDisabledDuringDemo()) {
        await backgroundJobRepository.enqueue({
          type: "MASTER_INTELLIGENCE",
          payload: {
            masterIncidentId: clusterSummary.id,
            memberCount: clusterSummary.supportingReportCount,
          },
          dedupeKey: `master-intelligence:${clusterSummary.id}:${clusterSummary.supportingReportCount}`,
        });
      }

      await backgroundJobRepository.enqueue({
        type: "CHLE_RECORD",
        payload: { reportId },
        dedupeKey: `chle-record:${reportId}`,
      });

      await prisma.report.update({
        where: { id: reportId },
        data: { processingStatus: "INTELLIGENCE_READY", processingError: null },
      });

      logAnalysisStage("status_updated_INTELLIGENCE_READY", reportId);
      logImportPipeline("status_updated_INTELLIGENCE_READY", { reportId });

      try {
        const repair = await crisisCoordinateRepairService.repairForReport(reportId);
        if (repair.repaired) {
          console.info(
            `[ReportProcessing] Crisis coordinates repaired for ${reportId}: ${repair.message}`
          );
        }
      } catch (error) {
        console.warn(
          `[ReportProcessing] Crisis coordinate repair failed for ${reportId}:`,
          error instanceof Error ? error.message : error
        );
      }

      notifyWebDashboardRefresh("report completed -> invalidating dashboard", {
        reportId,
      });
      invalidateIncidentCache(reportId);

      logAnalysisStage("cache_invalidated", reportId);
      logImportPipeline("cache_invalidated", { reportId });

      logAnalysisStage("analysis_completed", reportId);
      logImportPipeline("analysis_completed", {
        reportId,
        durationMs: Date.now() - started,
      });

      try {
        await analysisLiveService.publishCompleted(reportId, Date.now() - started);
        logImportPipeline("evaluation_row_added", { reportId, published: true });
      } catch (error) {
        console.error(
          `[ReportProcessing] evaluation_row_added FAILED for ${reportId}:`,
          error instanceof Error ? error.message : error
        );
        logImportPipeline("evaluation_row_added", {
          reportId,
          published: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logAnalysisStage("analysis_failed", reportId, message);
      logImportPipeline("analysis_failed", { reportId, error: message });
      await prisma.report.update({
        where: { id: reportId },
        data: { processingStatus: "FAILED", processingError: message },
      });

      void analysisLiveService.publishFailed(reportId, message).catch(() => undefined);

      throw error;
    }

    timing.totalMs = Date.now() - started;
    logSyncTiming(`report:${reportId}`, timing);
    return timing;
  }

  async processMasterIntelligence(
    masterIncidentId: string,
    memberCount: number
  ): Promise<number> {
    const started = Date.now();

    const { masterIncidentIntelligenceService } = await import(
      "@/services/masterIncidentIntelligenceService"
    );
    const { masterIncidentPropagationService } = await import(
      "@/services/masterIncidentPropagationService"
    );

    await masterIncidentIntelligenceService.synthesizeIfNeeded(
      masterIncidentId,
      memberCount
    );
    await masterIncidentPropagationService.propagateFromIntelligence(masterIncidentId);

    const elapsed = Date.now() - started;
    console.info(
      `[ReportProcessing] Master incident ${masterIncidentId} updated in ${elapsed}ms`
    );
    return elapsed;
  }

  async processChleRecord(reportId: string): Promise<number> {
    const started = Date.now();
    const view = await analysisService.getByReportIdForView(reportId);
    if (!view) {
      console.warn(`[ReportProcessing] CHLE skipped — no analysis view for ${reportId}`);
      return 0;
    }

    if (!view.nlp) {
      console.warn(`[ReportProcessing] CHLE skipped — missing NLP view for ${reportId}`);
      return 0;
    }

    await continuousHumanitarianLearningEngine.recordAnalysisSnapshot({
      reportId,
      title: view.report.title,
      content: view.report.content,
      nlp: view.nlp,
      priorityLevel: view.priorityAssessment.priorityLevel,
      riskLevel: view.riskProjection?.riskLevel ?? "Medium",
      reliabilityScore: view.reliabilityAssessment.finalScore,
      insight: view.insight ?? null,
      contentFingerprint: view.report.contentFingerprint ?? undefined,
    });

    const elapsed = Date.now() - started;
    console.info(`[ReportProcessing] CHLE recorded for ${reportId} in ${elapsed}ms`);
    return elapsed;
  }

  async markReportFailed(reportId: string, message: string): Promise<void> {
    await prisma.report.update({
      where: { id: reportId },
      data: { processingStatus: "FAILED", processingError: message },
    });
    void analysisLiveService.publishFailed(reportId, message).catch(() => undefined);
  }

  /** Re-queue reports left ANALYSING after a worker timeout or crash. maxAgeMs=0 = all. */
  async resetStaleAnalysingReports(maxAgeMs: number): Promise<number> {
    const where =
      maxAgeMs <= 0
        ? { processingStatus: "ANALYSING" as const }
        : {
            processingStatus: "ANALYSING" as const,
            updatedAt: { lt: new Date(Date.now() - maxAgeMs) },
          };

    const stale = await prisma.report.findMany({
      where,
      select: { id: true },
      take: 50,
    });

    for (const report of stale) {
      await prisma.report.update({
        where: { id: report.id },
        data: {
          processingStatus: "QUEUED",
          processingError: "Reset after analysis timeout",
        },
      });
      await backgroundJobRepository.enqueue({
        type: "REPORT_ANALYSIS",
        payload: { reportId: report.id },
        dedupeKey: `report-analysis:${report.id}`,
      });
      console.warn(
        `[ReportProcessing] Re-queued stale ANALYSING report ${report.id}`
      );
    }

    if (stale.length > 0) {
      void analysisLiveService.publishQueueSnapshot().catch(() => undefined);
    }

    return stale.length;
  }
}

export const reportProcessingService = new ReportProcessingService();
