import { classifyWarning, stripStackTrace } from "@/lib/warningClassifier";
import type {
  FormattedWarning,
  GroupedWarning,
  WarningSeverity,
} from "@/types";

export type { FormattedWarning, GroupedWarning, WarningSeverity };

export interface FormatWarningContext {
  source?: string;
  reportId?: string;
}

let warningCounter = 0;

function nextWarningId(): string {
  warningCounter += 1;
  return `warn-${Date.now()}-${warningCounter}`;
}

function extractTechnicalDetails(error: unknown): string | undefined {
  if (error instanceof Error) {
    const parts = [error.message];
    if (error.stack) parts.push(error.stack);
    return parts.join("\n");
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function normalizeText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

export function formatSyncWarning(
  error: unknown,
  context?: FormatWarningContext
): FormattedWarning {
  const raw = normalizeText(error);
  const technicalDetails = extractTechnicalDetails(error);
  const matched = classifyWarning(raw);
  const timestamp = new Date().toISOString();

  if (matched) {
    return {
      id: nextWarningId(),
      message: matched.message,
      severity: matched.severity,
      timestamp,
      groupKey: matched.groupKey,
      count: 1,
      technicalDetails,
      source: context?.source,
      reportId: context?.reportId,
    };
  }

  const looksLikeStack =
    raw.includes(" at ") || raw.includes("node_modules") || raw.length > 400;

  return {
    id: nextWarningId(),
    message: looksLikeStack
      ? `⚠️ Sync issue in ${context?.source ?? "pipeline"} — see technical details`
      : `⚠️ ${stripStackTrace(raw)}`,
    severity: "warning",
    timestamp,
    groupKey: `generic:${context?.source ?? "sync"}:${stripStackTrace(raw).slice(0, 60)}`,
    count: 1,
    technicalDetails: looksLikeStack ? technicalDetails : undefined,
    source: context?.source,
    reportId: context?.reportId,
  };
}

export function formatSyncWarningMessage(
  message: string,
  context?: FormatWarningContext
): FormattedWarning {
  return formatSyncWarning(message, context);
}

const SEVERITY_RANK: Record<WarningSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function groupWarnings(warnings: FormattedWarning[]): GroupedWarning[] {
  const groups = new Map<string, GroupedWarning>();

  for (const warning of warnings) {
    const existing = groups.get(warning.groupKey);
    if (!existing) {
      groups.set(warning.groupKey, {
        groupKey: warning.groupKey,
        message: warning.message,
        severity: warning.severity,
        count: 1,
        timestamp: warning.timestamp,
        technicalDetails: warning.technicalDetails,
        source: warning.source,
      });
      continue;
    }

    existing.count += 1;
    if (warning.timestamp > existing.timestamp) {
      existing.timestamp = warning.timestamp;
      if (warning.technicalDetails) {
        existing.technicalDetails = warning.technicalDetails;
      }
    }
    if (SEVERITY_RANK[warning.severity] > SEVERITY_RANK[existing.severity]) {
      existing.severity = warning.severity;
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.timestamp.localeCompare(a.timestamp)
  );
}

export function formatGroupedMessage(warning: GroupedWarning): string {
  if (warning.count <= 1) return warning.message;
  const base = warning.message.replace(/…$/, "").replace(/\.$/, "");
  const countLabel =
    warning.groupKey === "missing-coordinates" ||
    warning.groupKey === "location-pending"
      ? `${warning.count} reports`
      : `${warning.count}×`;
  return `${base} (${countLabel})`;
}
