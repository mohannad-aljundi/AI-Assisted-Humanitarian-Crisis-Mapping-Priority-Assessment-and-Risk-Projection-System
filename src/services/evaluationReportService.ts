import { evaluationReportRepository } from "@/repositories/evaluationReportRepository";
import {
  formatClusterSourceSummary,
  resolveEvaluationDisplayStatus,
} from "@/lib/evaluationListStatus";
import { resolveOperationalForLinkedReport } from "@/lib/operationalIntelligenceResolver";
import { deriveIncidentLabelFallback } from "@/services/incidentLabelService";
import type {
  EvaluationFilterOptions,
  EvaluationReportListItem,
  EvaluationReportStatus,
  EvaluationReportsQuery,
  EvaluationReportsResponse,
} from "@/types/evaluation";
import type { EvaluationReportRow } from "@/repositories/evaluationReportRepository";

function resolveEvaluationStatus(row: EvaluationReportRow): EvaluationReportStatus {
  if (row.learningCase?.analystValidated) {
    return "Validated";
  }
  if (row._count.analystFeedback > 0) {
    return "Feedback submitted";
  }
  return "Pending review";
}

function resolveIncidentLabel(row: EvaluationReportRow): string {
  if (row.incidentLabel?.trim()) {
    return row.incidentLabel.trim();
  }

  const crisisType =
    row.extractedEntities.find((entity) => entity.entityType === "CRISIS_TYPE")
      ?.value ?? null;
  const location =
    row.extractedEntities.find((entity) => entity.entityType === "LOCATION")
      ?.value ?? null;

  return deriveIncidentLabelFallback({
    headline: row.title,
    content: row.content,
    crisisType,
    location,
    country: row.segmentCountry,
    priorityLevel: row.priorityAssessment?.priorityLevel ?? null,
  });
}

function mapReportRow(row: EvaluationReportRow): EvaluationReportListItem {
  const crisisType =
    row.extractedEntities.find((entity) => entity.entityType === "CRISIS_TYPE")
      ?.value ?? null;

  const location =
    row.extractedEntities.find((entity) => entity.entityType === "LOCATION")
      ?.value ?? null;

  const populationEntity = row.extractedEntities.find(
    (entity) => entity.entityType === "AFFECTED_POPULATION"
  );

  const master = row.masterIncidentMember?.masterIncident;
  const operational = resolveOperationalForLinkedReport(row);

  const displayStatus = resolveEvaluationDisplayStatus({
    analystValidated: row.learningCase?.analystValidated,
    feedbackCount: row._count.analystFeedback,
    correlationVerificationStatus: operational.verificationStatus,
    supportingReportCount: operational.supportingReportCount,
  });

  const incidentLabel = resolveIncidentLabel(row);
  const originalTitle = row.title;

  return {
    id: row.id,
    incidentLabel,
    originalTitle,
    title: incidentLabel,
    reportDate: row.reportDate.toISOString(),
    analysedAt: row.createdAt.toISOString(),
    sourceId: row.source.id,
    sourceName: row.source.name,
    crisisType: master?.crisisType ?? crisisType,
    location: master
      ? [master.city, master.country].filter(Boolean).join(", ") || location
      : location,
    priorityLevel: operational.priorityLevel,
    reliabilityScore: row.reliabilityAssessment!.finalScore,
    affectedPopulation: populationEntity
      ? parseInt(populationEntity.value, 10) || null
      : null,
    evaluationStatus: resolveEvaluationStatus(row),
    masterIncidentId: operational.masterIncidentId,
    supportingReportCount: operational.supportingReportCount,
    independentSourceCount: operational.independentSourceCount,
    sourceAgreementPercent: operational.sourceAgreementPercent,
    correlationVerificationStatus: operational.verificationStatus,
    dynamicPriorityScore: operational.dynamicPriorityScore,
    dynamicPriorityLevel: operational.priorityLevel,
    confidenceScore: operational.confidence,
    intelligenceSummary: operational.executiveSummary,
    intelligenceConfidence: operational.confidence,
    sourceSummary: formatClusterSourceSummary({
      sourceName: row.source.name,
      independentSourceCount: operational.independentSourceCount,
      supportingReportCount: operational.supportingReportCount,
    }),
    displayStatus,
  };
}

export interface EvaluationLiveListResult {
  item: EvaluationReportListItem | null;
  /** True when the default Evaluation list query would include this report. */
  listVisible: boolean;
  reason: string | null;
}

export class EvaluationReportService {
  async listReports(query: EvaluationReportsQuery): Promise<EvaluationReportsResponse> {
    const result = await evaluationReportRepository.findReports(query);

    return {
      items: result.items.map(mapReportRow),
      page: result.page,
      nextPage: result.nextPage,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
    };
  }

  /**
   * Load a single report for live Evaluation insertion.
   * Always returns a mappable row when assessments exist, even if the report is a
   * non-canonical cluster member (so the UI can show it immediately).
   */
  async getLiveListItem(reportId: string): Promise<EvaluationLiveListResult> {
    const row = await evaluationReportRepository.findById(reportId);
    if (!row) {
      return {
        item: null,
        listVisible: false,
        reason: `Report ${reportId} not found in database`,
      };
    }

    if (!row.priorityAssessment || !row.reliabilityAssessment) {
      return {
        item: null,
        listVisible: false,
        reason: `Report ${reportId} is missing priority or reliability assessment`,
      };
    }

    const member = row.masterIncidentMember;
    const listVisible = !member || member.isCanonical;
    const item = mapReportRow(row as EvaluationReportRow);

    return {
      item,
      listVisible,
      reason: listVisible
        ? null
        : `Report ${reportId} is a non-canonical cluster member (canonical list shows the master incident only)`,
    };
  }

  async getFilterOptions(): Promise<EvaluationFilterOptions> {
    return evaluationReportRepository.getFilterOptions();
  }
}

export const evaluationReportService = new EvaluationReportService();
