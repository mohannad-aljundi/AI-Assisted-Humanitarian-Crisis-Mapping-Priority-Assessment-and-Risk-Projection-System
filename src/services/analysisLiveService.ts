import { prisma } from "@/lib/prisma";

import {

  publishAnalysisEvent,

  type CompletedAnalysisCard,

  type ProcessingQueueSnapshot,

} from "@/lib/analysisEventBus";

import { deriveIncidentLabelFallback } from "@/services/incidentLabelService";

import { queueSnapshotService } from "@/services/queueSnapshotService";
import { notifyWebDashboardRefresh } from "@/services/dashboardRefreshService";

import type { PriorityLevel } from "@prisma/client";



export class AnalysisLiveService {

  async getQueueSnapshot(latestCompletedId: string | null = null): Promise<ProcessingQueueSnapshot> {

    return queueSnapshotService.getSnapshot(latestCompletedId);

  }



  async getRecentlyCompleted(limit = 10): Promise<CompletedAnalysisCard[]> {

    const reports = await prisma.report.findMany({

      where: {

        processingStatus: "INTELLIGENCE_READY",

        priorityAssessment: { isNot: null },

        reliabilityAssessment: { isNot: null },

      },

      orderBy: { updatedAt: "desc" },

      take: limit,

      include: {

        priorityAssessment: true,

        reliabilityAssessment: true,

        extractedEntities: {

          where: { entityType: { in: ["CRISIS_TYPE", "LOCATION"] } },

        },

      },

    });



    return reports.map((report) => this.mapCompletedCard(report));

  }



  async getCompletedCard(reportId: string): Promise<CompletedAnalysisCard | null> {

    const report = await prisma.report.findUnique({

      where: { id: reportId },

      include: {

        priorityAssessment: true,

        reliabilityAssessment: true,

        extractedEntities: {

          where: { entityType: { in: ["CRISIS_TYPE", "LOCATION"] } },

        },

      },

    });



    if (!report?.priorityAssessment || !report.reliabilityAssessment) {

      return null;

    }



    return this.mapCompletedCard(report);

  }



  private mapCompletedCard(report: {

    id: string;

    title: string;

    content: string;

    incidentLabel: string | null;

    segmentCountry: string | null;

    updatedAt: Date;

    priorityAssessment: { priorityLevel: PriorityLevel } | null;

    reliabilityAssessment: { finalScore: number } | null;

    extractedEntities: Array<{ entityType: string; value: string }>;

  }): CompletedAnalysisCard {

    const crisisType =

      report.extractedEntities.find((entity) => entity.entityType === "CRISIS_TYPE")

        ?.value ?? null;

    const location =

      report.extractedEntities.find((entity) => entity.entityType === "LOCATION")

        ?.value ?? null;



    const incidentLabel =

      report.incidentLabel?.trim() ||

      deriveIncidentLabelFallback({

        headline: report.title,

        content: report.content,

        crisisType,

        location,

        country: report.segmentCountry,

        priorityLevel: report.priorityAssessment?.priorityLevel ?? null,

      });



    return {

      id: report.id,

      incidentLabel,

      originalTitle: report.title,

      crisisType,

      priorityLevel: report.priorityAssessment?.priorityLevel ?? "Medium",

      reliabilityPercent: Math.round(

        (report.reliabilityAssessment?.finalScore ?? 0) * 100

      ),

      completedAt: report.updatedAt.toISOString(),

    };

  }



  async publishStarted(reportId: string): Promise<void> {

    const queue = await this.getQueueSnapshot(null);

    publishAnalysisEvent({

      type: "analysis_started",

      reportId,

      queue,

      at: new Date().toISOString(),

    });

  }



  async publishCompleted(reportId: string, durationMs?: number): Promise<void> {

    if (durationMs != null) {

      queueSnapshotService.recordCompletedDuration(durationMs);

    }



    const report = await this.getCompletedCard(reportId);

    const queue = await this.getQueueSnapshot(reportId);



    if (!report) {

      console.error(

        `[AnalysisLive] Completed report ${reportId} has no evaluation card — missing priority/reliability assessment. Evaluation table will not update.`

      );

      publishAnalysisEvent({

        type: "queue_snapshot",

        queue,

        at: new Date().toISOString(),

      });

      return;

    }



    try {

      const { evaluationReportService } = await import(

        "@/services/evaluationReportService"

      );

      const live = await evaluationReportService.getLiveListItem(reportId);

      if (!live.item) {

        console.error(

          `[AnalysisLive] Report ${reportId} finished but cannot appear in Evaluation: ${live.reason}`

        );

      } else if (!live.listVisible) {

        console.warn(

          `[AnalysisLive] Report ${reportId} finished — live row will be shown, but default list filter excludes it: ${live.reason}`

        );

      } else {

        console.info(

          `[AnalysisLive] Report ${reportId} is list-visible in Evaluation`

        );

      }

    } catch (error) {

      console.error(

        `[AnalysisLive] Evaluation visibility check failed for ${reportId}:`,

        error instanceof Error ? error.message : error

      );

    }



    notifyWebDashboardRefresh("report completed -> invalidating dashboard", {
      reportId,
      newestReportDate: report?.completedAt ?? null,
    });

    publishAnalysisEvent({

      type: "analysis_completed",

      report,

      queue,

      at: new Date().toISOString(),

    });

  }



  async publishFailed(reportId: string, error?: string): Promise<void> {

    const queue = await this.getQueueSnapshot(null);

    publishAnalysisEvent({

      type: "analysis_failed",

      reportId,

      error,

      queue,

      at: new Date().toISOString(),

    });

  }



  async publishQueueSnapshot(): Promise<ProcessingQueueSnapshot> {

    const queue = await this.getQueueSnapshot(null);

    publishAnalysisEvent({

      type: "queue_snapshot",

      queue,

      at: new Date().toISOString(),

    });

    return queue;

  }

}



export const analysisLiveService = new AnalysisLiveService();


