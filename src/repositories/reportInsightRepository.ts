import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AssessmentExplanation,
  AiDimensionReasoning,
  AiFinalReasoning,
  AnalyticalRiskProjection,
  CrossSourceAnalysis,
  DisasterSeverityAssessment,
  ExtendedAnalysisInsight,
  LocationReasoning,
} from "@/types";

export class ReportInsightRepository {
  async create(
    reportId: string,
    insight: ExtendedAnalysisInsight,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.reportInsight.create({
      data: {
        reportId,
        sentiment: insight.sentiment,
        urgencyLevel: insight.urgencyLevel,
        threatDetected: insight.threatDetected,
        infrastructureDamage: insight.infrastructureDamage,
        displacementRisk: insight.displacementRisk,
        foodInsecurityRisk: insight.foodInsecurityRisk,
        medicalDemand: insight.medicalDemand,
        fieldConfidences: insight.fieldConfidences as object,
        priorityExplanation: insight.priorityExplanation as object,
        riskExplanation: insight.riskExplanation as object,
        reliabilityExplanation: insight.reliabilityExplanation as object,
        situationSummary: insight.situationSummary ?? null,
        extractionMethod: insight.extractionMethod ?? null,
        aiModel: insight.aiModel ?? null,
        crisisExplanation: insight.crisisExplanation ?? null,
        confidenceLevel: insight.confidenceLevel ?? null,
        evidence: insight.evidence as object | undefined,
        confidenceBreakdown: insight.confidenceBreakdown as object | undefined,
        reasoningChain: insight.reasoningChain as object | undefined,
        finalReasoning: insight.finalReasoning as object | undefined,
        priorityReasoning: insight.priorityReasoning as object | undefined,
        reliabilityReasoning: insight.reliabilityReasoning as object | undefined,
        riskReasoning: insight.riskReasoning as object | undefined,
        knownFacts: insight.knownFacts as object | undefined,
        unknownFacts: insight.unknownFacts as object | undefined,
        crossSourceAnalysis: insight.crossSourceAnalysis as object | undefined,
        locationReasoning: insight.locationReasoning as object | undefined,
        pipelineVersion: insight.pipelineVersion ?? null,
        disasterSeverity: insight.disasterSeverity as object | undefined,
        humanitarianReasoning: insight.humanitarianReasoning as object | undefined,
        analyticalRiskProjection: insight.analyticalRiskProjection as object | undefined,
        reanalysisReason: insight.reanalysisReason ?? null,
        reanalyzedAt: insight.reanalyzedAt ? new Date(insight.reanalyzedAt) : null,
      } as unknown as Prisma.ReportInsightUncheckedCreateInput,
    });
  }

  async update(
    reportId: string,
    insight: ExtendedAnalysisInsight,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.reportInsight.update({
      where: { reportId },
      data: {
        sentiment: insight.sentiment,
        urgencyLevel: insight.urgencyLevel,
        threatDetected: insight.threatDetected,
        infrastructureDamage: insight.infrastructureDamage,
        displacementRisk: insight.displacementRisk,
        foodInsecurityRisk: insight.foodInsecurityRisk,
        medicalDemand: insight.medicalDemand,
        fieldConfidences: insight.fieldConfidences as object,
        priorityExplanation: insight.priorityExplanation as object,
        riskExplanation: insight.riskExplanation as object,
        reliabilityExplanation: insight.reliabilityExplanation as object,
        situationSummary: insight.situationSummary ?? null,
        extractionMethod: insight.extractionMethod ?? null,
        aiModel: insight.aiModel ?? null,
        crisisExplanation: insight.crisisExplanation ?? null,
        confidenceLevel: insight.confidenceLevel ?? null,
        evidence: insight.evidence as object | undefined,
        confidenceBreakdown: insight.confidenceBreakdown as object | undefined,
        reasoningChain: insight.reasoningChain as object | undefined,
        finalReasoning: insight.finalReasoning as object | undefined,
        priorityReasoning: insight.priorityReasoning as object | undefined,
        reliabilityReasoning: insight.reliabilityReasoning as object | undefined,
        riskReasoning: insight.riskReasoning as object | undefined,
        knownFacts: insight.knownFacts as object | undefined,
        unknownFacts: insight.unknownFacts as object | undefined,
        crossSourceAnalysis: insight.crossSourceAnalysis as object | undefined,
        locationReasoning: insight.locationReasoning as object | undefined,
        pipelineVersion: insight.pipelineVersion ?? null,
        disasterSeverity: insight.disasterSeverity as object | undefined,
        humanitarianReasoning: insight.humanitarianReasoning as object | undefined,
        analyticalRiskProjection: insight.analyticalRiskProjection as object | undefined,
        reanalysisReason: insight.reanalysisReason ?? null,
        reanalyzedAt: insight.reanalyzedAt ? new Date(insight.reanalyzedAt) : null,
      } as unknown as Prisma.ReportInsightUpdateInput,
    });
  }

  async upsert(
    reportId: string,
    insight: ExtendedAnalysisInsight,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    const data = {
      sentiment: insight.sentiment,
      urgencyLevel: insight.urgencyLevel,
      threatDetected: insight.threatDetected,
      infrastructureDamage: insight.infrastructureDamage,
      displacementRisk: insight.displacementRisk,
      foodInsecurityRisk: insight.foodInsecurityRisk,
      medicalDemand: insight.medicalDemand,
      fieldConfidences: insight.fieldConfidences as object,
      priorityExplanation: insight.priorityExplanation as object,
      riskExplanation: insight.riskExplanation as object,
      reliabilityExplanation: insight.reliabilityExplanation as object,
      situationSummary: insight.situationSummary ?? null,
      extractionMethod: insight.extractionMethod ?? null,
      aiModel: insight.aiModel ?? null,
      crisisExplanation: insight.crisisExplanation ?? null,
      confidenceLevel: insight.confidenceLevel ?? null,
      evidence: insight.evidence as object | undefined,
      confidenceBreakdown: insight.confidenceBreakdown as object | undefined,
      reasoningChain: insight.reasoningChain as object | undefined,
      finalReasoning: insight.finalReasoning as object | undefined,
      priorityReasoning: insight.priorityReasoning as object | undefined,
      reliabilityReasoning: insight.reliabilityReasoning as object | undefined,
      riskReasoning: insight.riskReasoning as object | undefined,
      knownFacts: insight.knownFacts as object | undefined,
      unknownFacts: insight.unknownFacts as object | undefined,
      crossSourceAnalysis: insight.crossSourceAnalysis as object | undefined,
      locationReasoning: insight.locationReasoning as object | undefined,
      pipelineVersion: insight.pipelineVersion ?? null,
      disasterSeverity: insight.disasterSeverity as object | undefined,
      humanitarianReasoning: insight.humanitarianReasoning as object | undefined,
      analyticalRiskProjection: insight.analyticalRiskProjection as object | undefined,
      reanalysisReason: insight.reanalysisReason ?? null,
      reanalyzedAt: insight.reanalyzedAt ? new Date(insight.reanalyzedAt) : null,
    };

    return client.reportInsight.upsert({
      where: { reportId },
      create: {
        reportId,
        ...data,
      } as unknown as Prisma.ReportInsightUncheckedCreateInput,
      update: data as unknown as Prisma.ReportInsightUpdateInput,
    });
  }

  async findByReportId(reportId: string) {
    return prisma.reportInsight.findUnique({ where: { reportId } });
  }
}

export const reportInsightRepository = new ReportInsightRepository();

export function mapInsightFromDb(
  record: NonNullable<Awaited<ReturnType<typeof reportInsightRepository.findByReportId>>>
): ExtendedAnalysisInsight {
  return {
    sentiment: record.sentiment,
    urgencyLevel: record.urgencyLevel,
    threatDetected: record.threatDetected,
    infrastructureDamage: record.infrastructureDamage,
    displacementRisk: record.displacementRisk,
    foodInsecurityRisk: record.foodInsecurityRisk,
    medicalDemand: record.medicalDemand,
    fieldConfidences: (record.fieldConfidences as Record<string, number>) ?? {},
    priorityExplanation: (record.priorityExplanation as unknown as AssessmentExplanation) ?? {
      conclusion: "",
      reasons: [],
    },
    riskExplanation: (record.riskExplanation as unknown as AssessmentExplanation) ?? {
      conclusion: "",
      reasons: [],
    },
    reliabilityExplanation: (record.reliabilityExplanation as unknown as AssessmentExplanation) ?? {
      conclusion: "",
      reasons: [],
    },
    situationSummary: record.situationSummary,
    extractionMethod: record.extractionMethod,
    aiModel: record.aiModel,
    crisisExplanation: record.crisisExplanation,
    confidenceLevel: record.confidenceLevel,
    evidence: (record.evidence as string[]) ?? undefined,
    confidenceBreakdown: (record.confidenceBreakdown as Record<string, number>) ?? undefined,
    reasoningChain:
      (record.reasoningChain as unknown as ExtendedAnalysisInsight["reasoningChain"]) ??
      undefined,
    finalReasoning:
      (record.finalReasoning as unknown as AiFinalReasoning) ?? undefined,
    priorityReasoning:
      (record.priorityReasoning as unknown as AiDimensionReasoning) ?? undefined,
    reliabilityReasoning:
      (record.reliabilityReasoning as unknown as AiDimensionReasoning) ?? undefined,
    riskReasoning:
      (record.riskReasoning as unknown as AiDimensionReasoning) ?? undefined,
    knownFacts: (record.knownFacts as string[]) ?? undefined,
    unknownFacts: (record.unknownFacts as string[]) ?? undefined,
    crossSourceAnalysis:
      (record.crossSourceAnalysis as unknown as CrossSourceAnalysis) ?? undefined,
    locationReasoning:
      (record.locationReasoning as unknown as LocationReasoning) ?? undefined,
    pipelineVersion:
      (record as { pipelineVersion?: string | null }).pipelineVersion ?? undefined,
    disasterSeverity:
      ((record as { disasterSeverity?: unknown }).disasterSeverity as
        | DisasterSeverityAssessment
        | null
        | undefined) ?? undefined,
    humanitarianReasoning:
      ((record as { humanitarianReasoning?: unknown }).humanitarianReasoning as
        | ExtendedAnalysisInsight["humanitarianReasoning"]
        | null
        | undefined) ?? undefined,
    analyticalRiskProjection:
      ((record as { analyticalRiskProjection?: unknown }).analyticalRiskProjection as
        | AnalyticalRiskProjection
        | null
        | undefined) ?? undefined,
    reanalysisReason:
      (record as { reanalysisReason?: string | null }).reanalysisReason ?? undefined,
    reanalyzedAt:
      (record as { reanalyzedAt?: Date | null }).reanalyzedAt?.toISOString() ?? undefined,
    assessmentMethod:
      (record.priorityExplanation as AssessmentExplanation | null)?.assessmentMethod ??
      undefined,
    assessmentFallbackReason:
      (record.priorityExplanation as AssessmentExplanation | null)?.fallbackReason ??
      undefined,
  };
}

