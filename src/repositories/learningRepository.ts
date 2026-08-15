import type {
  CorrectionField,
  LearningExampleStatus,
  PriorityLevel,
  RiskLevel,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { LearningNeedSnapshot } from "@/types/learning";

export interface CreateLearningCaseInput {
  reportId: string;
  title: string;
  crisisType?: string | null;
  country?: string | null;
  city?: string | null;
  reportPurpose?: string | null;
  crisisPhase?: string | null;
  priorityLevel?: PriorityLevel | null;
  riskLevel?: RiskLevel | null;
  reliabilityScore?: number | null;
  confidenceLevel?: string | null;
  humanitarianNeeds?: LearningNeedSnapshot[];
  evidence?: string[];
  contentFingerprint?: string | null;
  pipelineVersion?: string | null;
}

export interface CreateLearningExampleInput {
  reportId: string;
  learningCaseId?: string | null;
  feedbackId?: string | null;
  field: CorrectionField;
  originalValue: unknown;
  correctedValue: unknown;
  reason?: string | null;
  evidence?: string | null;
  analystId?: string | null;
  pipelineVersion?: string | null;
  status?: LearningExampleStatus;
}

export class LearningRepository {
  async upsertLearningCase(input: CreateLearningCaseInput) {
    return prisma.learningCase.upsert({
      where: { reportId: input.reportId },
      create: {
        reportId: input.reportId,
        title: input.title,
        crisisType: input.crisisType,
        country: input.country,
        city: input.city,
        reportPurpose: input.reportPurpose,
        crisisPhase: input.crisisPhase,
        priorityLevel: input.priorityLevel ?? undefined,
        riskLevel: input.riskLevel ?? undefined,
        reliabilityScore: input.reliabilityScore,
        confidenceLevel: input.confidenceLevel,
        humanitarianNeedsJson: (input.humanitarianNeeds ?? []) as object,
        evidenceJson: (input.evidence ?? []) as object,
        contentFingerprint: input.contentFingerprint,
        pipelineVersion: input.pipelineVersion,
      },
      update: {
        title: input.title,
        crisisType: input.crisisType,
        country: input.country,
        city: input.city,
        reportPurpose: input.reportPurpose,
        crisisPhase: input.crisisPhase,
        priorityLevel: input.priorityLevel ?? undefined,
        riskLevel: input.riskLevel ?? undefined,
        reliabilityScore: input.reliabilityScore,
        confidenceLevel: input.confidenceLevel,
        humanitarianNeedsJson: (input.humanitarianNeeds ?? []) as object,
        evidenceJson: (input.evidence ?? []) as object,
        contentFingerprint: input.contentFingerprint,
        pipelineVersion: input.pipelineVersion,
      },
    });
  }

  async findLearningCaseByReportId(reportId: string) {
    return prisma.learningCase.findUnique({ where: { reportId } });
  }

  async createAnalystFeedback(reportId: string, analystId?: string, summary?: string) {
    return prisma.analystFeedback.create({
      data: { reportId, analystId, summary },
    });
  }

  async createLearningExample(input: CreateLearningExampleInput) {
    const existingCount = await prisma.learningExample.count({
      where: { reportId: input.reportId, field: input.field },
    });

    return prisma.learningExample.create({
      data: {
        reportId: input.reportId,
        learningCaseId: input.learningCaseId,
        feedbackId: input.feedbackId,
        field: input.field,
        originalValue: input.originalValue as object,
        correctedValue: input.correctedValue as object,
        reason: input.reason,
        evidence: input.evidence,
        analystId: input.analystId,
        pipelineVersion: input.pipelineVersion,
        status: input.status ?? "APPLIED",
        version: existingCount + 1,
      },
    });
  }

  async listLearningExamples(reportId: string) {
    return prisma.learningExample.findMany({
      where: { reportId },
      orderBy: { createdAt: "desc" },
    });
  }

  async listAllLearningCases(limit = 500) {
    return prisma.learningCase.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  }

  async markCaseValidated(reportId: string, validatedBy?: string) {
    return prisma.learningCase.update({
      where: { reportId },
      data: {
        analystValidated: true,
        validatedAt: new Date(),
        validatedBy,
      },
    });
  }

  async upsertReasoningPattern(params: {
    patternKey: string;
    evidencePattern: string;
    inferredOutcome: string;
    outcomeType: string;
    sourceReportId?: string;
    validated?: boolean;
  }) {
    const existing = await prisma.reasoningPattern.findUnique({
      where: { patternKey: params.patternKey },
    });

    if (!existing) {
      return prisma.reasoningPattern.create({
        data: {
          patternKey: params.patternKey,
          evidencePattern: params.evidencePattern,
          inferredOutcome: params.inferredOutcome,
          outcomeType: params.outcomeType,
          sourceReportIds: params.sourceReportId ? [params.sourceReportId] : ([] as unknown as object),
          validationCount: params.validated ? 1 : 0,
          confidenceBoost: params.validated ? 0.05 : 0.02,
        },
      });
    }

    const reportIds = Array.isArray(existing.sourceReportIds)
      ? (existing.sourceReportIds as string[])
      : [];
    if (params.sourceReportId && !reportIds.includes(params.sourceReportId)) {
      reportIds.push(params.sourceReportId);
    }

    const occurrenceCount = existing.occurrenceCount + 1;
    const validationCount = existing.validationCount + (params.validated ? 1 : 0);
    const confidenceBoost = Math.min(
      0.25,
      validationCount / Math.max(occurrenceCount, 1) * 0.2 + 0.02
    );

    return prisma.reasoningPattern.update({
      where: { patternKey: params.patternKey },
      data: {
        occurrenceCount,
        validationCount,
        confidenceBoost,
        lastSeenAt: new Date(),
        sourceReportIds: reportIds.slice(-20),
      },
    });
  }

  async upsertInferenceMemory(params: {
    memoryKey: string;
    mistakeType: string;
    contextPattern: string;
    incorrectConclusion: string;
    correctConclusion: string;
    reason: string;
    sourceReportId?: string;
    analystId?: string;
  }) {
    return prisma.inferenceMemory.upsert({
      where: { memoryKey: params.memoryKey },
      create: {
        memoryKey: params.memoryKey,
        mistakeType: params.mistakeType,
        contextPattern: params.contextPattern,
        incorrectConclusion: params.incorrectConclusion,
        correctConclusion: params.correctConclusion,
        reason: params.reason,
        sourceReportId: params.sourceReportId,
        analystId: params.analystId,
      },
      update: {
        occurrenceCount: { increment: 1 },
        reason: params.reason,
        sourceReportId: params.sourceReportId,
        analystId: params.analystId,
      },
    });
  }

  async listInferenceMemories(limit = 50) {
    return prisma.inferenceMemory.findMany({
      orderBy: { occurrenceCount: "desc" },
      take: limit,
    });
  }

  async listReasoningPatterns(limit = 100) {
    return prisma.reasoningPattern.findMany({
      orderBy: { occurrenceCount: "desc" },
      take: limit,
    });
  }

  async adjustConfidenceCalibration(
    contextKey: string,
    dimension: string,
    wasCorrect: boolean
  ) {
    const delta = wasCorrect ? 0.02 : -0.04;
    const existing = await prisma.confidenceCalibration.findUnique({
      where: { contextKey_dimension: { contextKey, dimension } },
    });

    if (!existing) {
      return prisma.confidenceCalibration.create({
        data: {
          contextKey,
          dimension,
          adjustment: delta,
          sampleCount: 1,
        },
      });
    }

    const sampleCount = existing.sampleCount + 1;
    const adjustment = Math.max(
      -0.3,
      Math.min(0.3, existing.adjustment + delta)
    );

    return prisma.confidenceCalibration.update({
      where: { contextKey_dimension: { contextKey, dimension } },
      data: { adjustment, sampleCount },
    });
  }

  async getCalibrationsForContext(contextKey: string) {
    return prisma.confidenceCalibration.findMany({
      where: { contextKey },
    });
  }

  async createHistoricalOutcome(params: {
    reportId?: string;
    learningCaseId?: string;
    crisisId?: string;
    outcomeSummary: string;
    outcomeType?: string;
    validatedBy?: string;
  }) {
    return prisma.historicalOutcome.create({ data: params });
  }
}

export const learningRepository = new LearningRepository();
