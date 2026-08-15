import type { ReportProcessingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeArticleUrl } from "@/lib/articleDeduplication";
import { logImportPipeline } from "@/lib/importPipelineLogger";
import {
  isReportFullyAnalysed,
  needsReportAnalysis,
} from "@/lib/reportAnalysisStatus";
import { buildContentFingerprint } from "@/services/incidentDeduplicationService";
import { ingestionRepository } from "@/repositories/ingestionRepository";
import { sourceRepository } from "@/repositories/sourceRepository";
import { reportRepository } from "@/repositories/reportRepository";
import { backgroundJobRepository } from "@/repositories/backgroundJobRepository";
import type { IngestedArticle } from "@/types";

export type ImportArticleReason =
  | "duplicate"
  | "already_processed"
  | "requeued"
  | "imported";

export interface ImportArticleResult {
  imported: boolean;
  skipped: boolean;
  reportId?: string;
  reason?: ImportArticleReason;
}

export class ReportImportService {
  async importArticle(article: IngestedArticle): Promise<ImportArticleResult> {
    logImportPipeline("fetched", {
      title: article.title,
      source: article.source.name,
      reportDate: article.reportDate,
      url: article.url ?? null,
    });

    const duplicate = await ingestionRepository.findDuplicateReport(article);
    if (duplicate) {
      logImportPipeline("duplicate_detected", {
        reportId: duplicate.reportId,
        matchType: duplicate.matchType,
        title: article.title,
      });
      return this.resolveExistingReport(duplicate.reportId, duplicate.matchType);
    }

    const reportDate = new Date(article.reportDate);
    const contentFingerprint = buildContentFingerprint(article.title, article.content);

    const existingByFingerprint = await prisma.report.findFirst({
      where: { contentFingerprint },
      select: {
        id: true,
        processingStatus: true,
        insight: { select: { pipelineVersion: true } },
        priorityAssessment: { select: { id: true } },
      },
    });

    if (existingByFingerprint) {
      logImportPipeline("duplicate_detected", {
        reportId: existingByFingerprint.id,
        matchType: "content_fingerprint",
        title: article.title,
      });
      return this.resolveExistingReport(
        existingByFingerprint.id,
        "content_fingerprint"
      );
    }

    const source = await sourceRepository.findOrCreate(
      article.source.name,
      article.source.type,
      article.source.credibilityScore,
      article.source.url
    );

    const report = await reportRepository.create({
      title: article.title,
      content: article.content,
      reportDate,
      contentFingerprint,
      articleUrl: article.url
        ? normalizeArticleUrl(article.url) ?? article.url
        : undefined,
      externalArticleId: article.externalId,
      processingStatus: "IMPORTED",
      source: { connect: { id: source.id } },
    });

    await this.enqueueForAnalysis(report.id);

    logImportPipeline("imported", {
      reportId: report.id,
      title: article.title,
    });

    return { imported: true, skipped: false, reportId: report.id, reason: "imported" };
  }

  private async resolveExistingReport(
    reportId: string,
    matchType: string
  ): Promise<ImportArticleResult> {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        insight: { select: { pipelineVersion: true } },
        priorityAssessment: { select: { id: true } },
      },
    });

    if (!report) {
      return { imported: false, skipped: true, reason: "duplicate" };
    }

    if (isReportFullyAnalysed(report)) {
      logImportPipeline("previously_analysed", {
        reportId,
        matchType,
        processingStatus: report.processingStatus,
      });
      return {
        imported: false,
        skipped: true,
        reportId,
        reason: "already_processed",
      };
    }

    await this.enqueueForAnalysis(reportId);

    logImportPipeline("queued_for_analysis", {
      reportId,
      matchType,
      processingStatus: report.processingStatus,
    });

    return {
      imported: false,
      skipped: false,
      reportId,
      reason: "requeued",
    };
  }

  async enqueueForAnalysis(reportId: string): Promise<void> {
    await backgroundJobRepository.enqueue({
      type: "REPORT_ANALYSIS",
      payload: { reportId },
      dedupeKey: `report-analysis:${reportId}`,
    });

    await prisma.report.update({
      where: { id: reportId },
      data: { processingStatus: "QUEUED", processingError: null },
    });

    void import("@/services/analysisLiveService")
      .then(({ analysisLiveService }) => analysisLiveService.publishQueueSnapshot())
      .catch(() => undefined);
  }

  async reconcilePendingReports(): Promise<number> {
    const candidates = await prisma.report.findMany({
      where: {
        processingStatus: { in: ["IMPORTED", "QUEUED", "FAILED"] },
      },
      include: {
        insight: { select: { pipelineVersion: true } },
        priorityAssessment: { select: { id: true } },
      },
      take: 200,
      orderBy: { createdAt: "asc" },
    });

    let requeued = 0;

    for (const report of candidates) {
      if (!needsReportAnalysis(report)) {
        if (report.processingStatus !== "INTELLIGENCE_READY") {
          await prisma.report.update({
            where: { id: report.id },
            data: { processingStatus: "INTELLIGENCE_READY", processingError: null },
          });
        }
        continue;
      }

      if (report.processingStatus === "QUEUED") {
        const activeJob = await prisma.backgroundJob.findFirst({
          where: {
            type: "REPORT_ANALYSIS",
            status: { in: ["PENDING", "RUNNING"] },
            payload: {
              path: ["reportId"],
              equals: report.id,
            },
          },
        });
        if (activeJob) continue;
      }

      await this.enqueueForAnalysis(report.id);
      requeued += 1;
      logImportPipeline("reconcile_pending", { reportId: report.id });
    }

    if (requeued > 0) {
      console.info(`[ImportPipeline] Reconciled ${requeued} pending report(s) for analysis`);
    }

    return requeued;
  }

  async getProcessingCounts(): Promise<Record<ReportProcessingStatus, number>> {
    const rows = await prisma.report.groupBy({
      by: ["processingStatus"],
      _count: { _all: true },
    });

    const counts: Record<ReportProcessingStatus, number> = {
      IMPORTED: 0,
      QUEUED: 0,
      ANALYSING: 0,
      INTELLIGENCE_READY: 0,
      FAILED: 0,
    };

    for (const row of rows) {
      counts[row.processingStatus] = row._count._all;
    }

    return counts;
  }

  async countPendingAnalysis(): Promise<number> {
    const candidates = await prisma.report.findMany({
      where: {
        processingStatus: { in: ["IMPORTED", "QUEUED", "ANALYSING", "FAILED"] },
      },
      include: {
        insight: { select: { pipelineVersion: true } },
        priorityAssessment: { select: { id: true } },
      },
      take: 500,
    });

    return candidates.filter((report) => needsReportAnalysis(report)).length;
  }
}

export const reportImportService = new ReportImportService();
