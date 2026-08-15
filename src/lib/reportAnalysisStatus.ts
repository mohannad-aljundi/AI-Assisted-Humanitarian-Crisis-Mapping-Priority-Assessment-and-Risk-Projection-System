import type { ReportProcessingStatus } from "@prisma/client";
import { INTELLIGENCE_PIPELINE_VERSION } from "@/lib/explainabilityPresentation";

export interface ReportAnalysisStatusInput {
  processingStatus: ReportProcessingStatus;
  insight: { pipelineVersion: string } | null;
  priorityAssessment: unknown | null;
}

export function isReportFullyAnalysed(report: ReportAnalysisStatusInput): boolean {
  return (
    report.processingStatus === "INTELLIGENCE_READY" &&
    report.insight?.pipelineVersion === INTELLIGENCE_PIPELINE_VERSION &&
    report.priorityAssessment != null
  );
}

export function needsReportAnalysis(report: ReportAnalysisStatusInput): boolean {
  return !isReportFullyAnalysed(report);
}
