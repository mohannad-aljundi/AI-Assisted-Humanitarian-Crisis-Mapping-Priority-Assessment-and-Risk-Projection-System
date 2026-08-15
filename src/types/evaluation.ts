import type { PriorityLevel } from "@prisma/client";

export type EvaluationSort =
  | "newest"
  | "oldest"
  | "confirmation_desc"
  | "dynamic_priority_desc"
  | "linked_reports_desc"
  | "priority_desc"
  | "priority_asc"
  | "reliability_desc"
  | "reliability_asc";

export type EvaluationStatusFilter =
  | "all"
  | "validated"
  | "feedback"
  | "pending";

export type EvaluationReportStatus =
  | "Validated"
  | "Feedback submitted"
  | "Pending review";

export interface EvaluationReportListItem {
  id: string;
  incidentLabel: string;
  originalTitle: string;
  /** @deprecated Use incidentLabel for display; kept for compatibility */
  title: string;
  reportDate: string;
  analysedAt: string;
  sourceId: string;
  sourceName: string;
  crisisType: string | null;
  location: string | null;
  priorityLevel: PriorityLevel;
  reliabilityScore: number;
  affectedPopulation: number | null;
  evaluationStatus: EvaluationReportStatus;
  masterIncidentId?: string | null;
  supportingReportCount?: number;
  independentSourceCount?: number;
  sourceAgreementPercent?: number;
  correlationVerificationStatus?: string | null;
  dynamicPriorityScore?: number | null;
  dynamicPriorityLevel?: PriorityLevel | null;
  confidenceScore?: number | null;
  sourceSummary?: string;
  displayStatus?: {
    label: string;
    kind: "analyst" | "correlation" | "pending";
  };
  intelligenceSummary?: string | null;
  intelligenceConfidence?: number | null;
}

export interface EvaluationReportsQuery {
  page?: number;
  limit?: number;
  search?: string;
  crisisType?: string;
  priority?: PriorityLevel;
  reliabilityMin?: number;
  reliabilityMax?: number;
  dateFrom?: string;
  dateTo?: string;
  sourceId?: string;
  evaluationStatus?: EvaluationStatusFilter;
  sort?: EvaluationSort;
}

export interface EvaluationReportsResponse {
  items: EvaluationReportListItem[];
  page: number;
  nextPage: number | null;
  hasMore: boolean;
  totalCount: number;
}

export interface EvaluationFilterOptions {
  sources: Array<{ id: string; name: string }>;
  crisisTypes: string[];
  priorities: PriorityLevel[];
  evaluationStatuses: Array<{ value: EvaluationStatusFilter; label: string }>;
}
