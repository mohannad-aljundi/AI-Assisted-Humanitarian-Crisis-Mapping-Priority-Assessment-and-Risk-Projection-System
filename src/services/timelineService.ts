import { formatSyncWarning } from "@/lib/syncWarningFormatter";
import { prisma } from "@/lib/prisma";
import { crisisRepository } from "@/repositories/crisisRepository";
import { TIMELINE_EVENT_TYPES } from "@/lib/intelligenceConstants";
import type { PriorityLevel, RiskLevel } from "@prisma/client";

export interface TimelineEventRecord {
  time: string | null;
  title: string;
  description: string;
  eventType: string;
}

export class TimelineService {
  async recordInitialAnalysis(params: {
    crisisId: string | null;
    reportId: string;
    title: string;
    crisisType: string | null;
    priorityLevel: PriorityLevel;
    riskLevel: RiskLevel;
    occurredAt: Date;
  }): Promise<string | null> {
    if (!params.crisisId) {
      console.warn("[Timeline] Timeline skipped: missing crisisId");
      return null;
    }

    const existing = await prisma.crisisTimelineEvent.findFirst({
      where: {
        crisisId: params.crisisId,
        reportId: params.reportId,
        eventType: TIMELINE_EVENT_TYPES.INITIAL_REPORT,
      },
    });
    if (existing) {
      console.log("[Timeline] Initial event already exists for report", params.reportId);
      return null;
    }

    return this.createEvent({
      crisisId: params.crisisId,
      reportId: params.reportId,
      eventType: TIMELINE_EVENT_TYPES.INITIAL_REPORT,
      title: "Initial intelligence report",
      description: `${params.crisisType ?? "Humanitarian"} incident analysed: ${params.title}. Priority: ${params.priorityLevel}. Risk: ${params.riskLevel}.`,
      occurredAt: params.occurredAt,
    });
  }

  async recordReportUpdate(params: {
    crisisId: string;
    reportId: string;
    title: string;
    crisisType: string | null;
    priorityLevel: PriorityLevel;
    riskLevel: RiskLevel;
    occurredAt: Date;
    duplicateOfReportId?: string;
  }): Promise<string | null> {
    const existing = await prisma.crisisTimelineEvent.findFirst({
      where: {
        crisisId: params.crisisId,
        reportId: params.reportId,
        eventType: TIMELINE_EVENT_TYPES.UPDATE,
      },
    });
    if (existing) return null;

    return this.createEvent({
      crisisId: params.crisisId,
      reportId: params.reportId,
      eventType: TIMELINE_EVENT_TYPES.UPDATE,
      title: "Corroborating report received",
      description: `Additional source analysed: ${params.title}. Priority: ${params.priorityLevel}. Risk: ${params.riskLevel}.${params.duplicateOfReportId ? " Linked to existing crisis event." : ""}`,
      occurredAt: params.occurredAt,
    });
  }

  private async createEvent(params: {
    crisisId: string;
    reportId: string;
    eventType: string;
    title: string;
    description: string;
    occurredAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    const crisis = await prisma.crisis.findUnique({
      where: { id: params.crisisId },
      select: { id: true },
    });
    if (!crisis) {
      console.warn("[Timeline] Timeline skipped: crisisId not found", params.crisisId);
      return null;
    }

    const report = await prisma.report.findUnique({
      where: { id: params.reportId },
      select: { id: true },
    });
    if (!report) {
      console.warn("[Timeline] Timeline skipped: reportId not found", params.reportId);
      return null;
    }

    try {
      await prisma.crisisTimelineEvent.create({
        data: {
          crisisId: params.crisisId,
          reportId: params.reportId,
          eventType: params.eventType,
          title: params.title,
          description: params.description,
          occurredAt: params.occurredAt,
          metadata: params.metadata as object | undefined,
        },
      });
      console.log("[Timeline] Event created:", params.eventType, params.crisisId);
      return null;
    } catch (error) {
      console.warn("[Timeline] Failed to create event:", error);
      return formatSyncWarning(error, {
        source: "timeline",
        reportId: params.reportId,
      }).message;
    }
  }

  async getTimelineForReport(
    reportId: string,
    crisisId?: string | null
  ): Promise<TimelineEventRecord[]> {
    const crisis =
      crisisId != null
        ? { id: crisisId }
        : await crisisRepository.findByReportId(reportId);
    if (!crisis) return [];

    const events = await prisma.crisisTimelineEvent.findMany({
      where: { crisisId: crisis.id },
      orderBy: { occurredAt: "asc" },
    });

    return events.map((event) => ({
      time: event.occurredAt.toISOString(),
      title: event.title,
      description: event.description,
      eventType: event.eventType,
    }));
  }

  async getTimelineForCrisisId(crisisId: string): Promise<TimelineEventRecord[]> {
    const events = await prisma.crisisTimelineEvent.findMany({
      where: { crisisId },
      orderBy: { occurredAt: "asc" },
    });

    return events.map((event) => ({
      time: event.occurredAt.toISOString(),
      title: event.title,
      description: event.description,
      eventType: event.eventType,
    }));
  }

  async getTimelineForCrisisKey(params: {
    country: string;
    city: string;
    crisisType: string;
  }): Promise<TimelineEventRecord[]> {
    const verifications = await prisma.sourceVerification.findMany({
      where: {
        country: params.country,
        city: params.city,
        crisisType: params.crisisType,
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    const reportIds = verifications[0]?.reportIds as string[] | undefined;
    if (!reportIds || reportIds.length === 0) {
      return [];
    }

    const crises = await prisma.crisis.findMany({
      where: { reportId: { in: reportIds } },
      select: { id: true },
    });

    const crisisIds = crises.map((c) => c.id);
    if (crisisIds.length === 0) return [];

    const events = await prisma.crisisTimelineEvent.findMany({
      where: { crisisId: { in: crisisIds } },
      orderBy: { occurredAt: "asc" },
    });

    return events.map((event) => ({
      time: event.occurredAt.toISOString(),
      title: event.title,
      description: event.description,
      eventType: event.eventType,
    }));
  }
}

export const timelineService = new TimelineService();
