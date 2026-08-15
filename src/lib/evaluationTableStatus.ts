import type { EvaluationReportListItem } from "@/types/evaluation";
import { isVerifiedCorrelationStatus } from "@/lib/correlationVerificationStatus";

export type OperationalTableStatus = "Active" | "Monitoring" | "Resolved";

export function resolveOperationalTableStatus(
  report: EvaluationReportListItem
): OperationalTableStatus {
  if (report.evaluationStatus === "Validated") {
    return "Resolved";
  }

  const priority = report.dynamicPriorityLevel ?? report.priorityLevel;
  if (priority === "Critical" || priority === "High") {
    return "Active";
  }

  return "Monitoring";
}

export function confirmationLabel(report: EvaluationReportListItem): string {
  return report.correlationVerificationStatus ?? "Pending Review";
}

export function isConfirmationVerified(report: EvaluationReportListItem): boolean {
  return isVerifiedCorrelationStatus(report.correlationVerificationStatus);
}

export function formatConfidencePercent(report: EvaluationReportListItem): string {
  if (report.confidenceScore == null) return "—";
  return `${Math.round(report.confidenceScore * 100)}%`;
}

export function formatSourceCount(report: EvaluationReportListItem): string {
  return String(report.independentSourceCount ?? 1);
}

export function formatReportCount(report: EvaluationReportListItem): string {
  return String(report.supportingReportCount ?? 1);
}

export function verificationTooltip(report: EvaluationReportListItem): string {
  const label = confirmationLabel(report);
  const parts: string[] = [label];

  if (report.sourceAgreementPercent != null) {
    parts.push(`${Math.round(report.sourceAgreementPercent)}% source agreement`);
  }

  if (report.confidenceScore != null) {
    parts.push(`${Math.round(report.confidenceScore * 100)}% cluster confidence`);
  }

  const linked = report.supportingReportCount ?? 1;
  const sources = report.independentSourceCount ?? 1;
  if (linked > 1 || sources > 1) {
    parts.push(`${linked} linked reports from ${sources} independent sources`);
  }

  return parts.join(" · ");
}

export function verificationDetailText(report: EvaluationReportListItem): string | null {
  if (report.intelligenceSummary) {
    return report.intelligenceSummary;
  }

  if (report.displayStatus?.kind === "analyst") {
    return `Analyst status: ${report.displayStatus.label}`;
  }

  return null;
}

export const VERIFICATION_PREVIEW_LENGTH = 72;

export function verificationFullText(report: EvaluationReportListItem): string {
  const detail = verificationDetailText(report);
  if (detail) {
    return detail;
  }
  return verificationTooltip(report);
}

export function truncateVerificationText(text: string, maxLength = VERIFICATION_PREVIEW_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  const base = lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;
  return `${base}…`;
}

export function verificationNeedsExpansion(
  report: EvaluationReportListItem,
  maxLength = VERIFICATION_PREVIEW_LENGTH
): boolean {
  return verificationFullText(report).length > maxLength;
}
