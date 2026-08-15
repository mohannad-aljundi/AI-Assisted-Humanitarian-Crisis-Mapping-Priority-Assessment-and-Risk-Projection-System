import {
  isVerifiedCorrelationStatus,
  type CorrelationVerificationStatus,
} from "@/lib/correlationVerificationStatus";

export type EvaluationDisplayStatusKind = "analyst" | "correlation" | "pending";

export interface EvaluationDisplayStatus {
  label: string;
  kind: EvaluationDisplayStatusKind;
}

export function resolveEvaluationDisplayStatus(params: {
  analystValidated?: boolean;
  feedbackCount: number;
  correlationVerificationStatus?: string | null;
  supportingReportCount?: number;
}): EvaluationDisplayStatus {
  if (params.analystValidated) {
    return { label: "Validated", kind: "analyst" };
  }
  if (params.feedbackCount > 0) {
    return { label: "Feedback submitted", kind: "analyst" };
  }

  const correlation = params.correlationVerificationStatus as
    | CorrelationVerificationStatus
    | undefined
    | null;

  if (correlation && isVerifiedCorrelationStatus(correlation)) {
    return { label: correlation, kind: "correlation" };
  }

  if (
    correlation &&
    correlation !== "Pending Review" &&
    (params.supportingReportCount ?? 1) > 1
  ) {
    return { label: correlation, kind: "correlation" };
  }

  return { label: "Pending review", kind: "pending" };
}

export function formatClusterSourceSummary(params: {
  sourceName: string;
  independentSourceCount?: number;
  supportingReportCount?: number;
}): string {
  const independent = params.independentSourceCount ?? 1;
  const linked = params.supportingReportCount ?? 1;

  if (linked > 1) {
    return `${independent} independent source${independent === 1 ? "" : "s"}`;
  }

  return params.sourceName;
}
