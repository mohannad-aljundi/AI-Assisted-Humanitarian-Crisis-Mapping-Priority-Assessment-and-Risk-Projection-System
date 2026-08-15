"use client";

import type { IngestionSourceRunStatus, IngestionSourceSummary } from "@/types";
import { ZERO_REASON_LABELS } from "@/lib/ingestionZeroReasons";
import { PROVIDER_LABELS } from "@/lib/ingestionSourceRegistry";

const RUN_STATUS_STYLES: Record<
  IngestionSourceRunStatus,
  { label: string; className: string }
> = {
  success: {
    label: "Success",
    className: "text-emerald-300",
  },
  failed: {
    label: "Failed",
    className: "text-red-300",
  },
  skipped: {
    label: "Skipped",
    className: "text-slate-400",
  },
  rate_limited: {
    label: "Rate limited",
    className: "text-orange-300",
  },
  requires_api_key: {
    label: "Requires API key",
    className: "text-amber-300",
  },
};

function formatDetails(summary: IngestionSourceSummary): string {
  if (summary.zeroReasonLabel) return summary.zeroReasonLabel;
  if (summary.error) return summary.error;
  if (summary.fetchedCount === 0 && summary.zeroReason) {
    return ZERO_REASON_LABELS[summary.zeroReason];
  }
  if (summary.durationMs) return `Completed in ${summary.durationMs}ms`;
  return "—";
}

interface SourceSummaryTableProps {
  summaries: IngestionSourceSummary[];
}

export function SourceSummaryTable({
  summaries = [],
}: SourceSummaryTableProps) {
  if (summaries.length === 0) return null;

  return (
    <div className="mt-4 overflow-x-auto">
      <p className="mb-2 text-sm font-medium text-slate-300">Per-source results</p>
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs text-slate-500">
            <th className="py-2 pr-4 font-medium">Source</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Raw</th>
            <th className="py-2 pr-4 font-medium">Fetched</th>
            <th className="py-2 pr-4 font-medium">Inserted</th>
            <th className="py-2 pr-4 font-medium">Duplicates</th>
            <th className="py-2 pr-4 font-medium">HTTP</th>
            <th className="py-2 pr-4 font-medium">Time</th>
            <th className="py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((summary) => {
            const style = RUN_STATUS_STYLES[summary.status];
            return (
              <tr
                key={summary.source}
                className="border-b border-white/5 text-slate-300"
              >
                <td className="py-2 pr-4 text-white">
                  {PROVIDER_LABELS[summary.source]}
                </td>
                <td className={`py-2 pr-4 ${style.className}`}>{style.label}</td>
                <td className="py-2 pr-4">{summary.rawFetchedCount ?? "—"}</td>
                <td className="py-2 pr-4">{summary.fetchedCount}</td>
                <td className="py-2 pr-4 text-emerald-300">
                  {summary.insertedCount ?? 0}
                </td>
                <td className="py-2 pr-4">{summary.duplicatesSkipped ?? 0}</td>
                <td className="py-2 pr-4">{summary.responseStatus ?? "—"}</td>
                <td className="py-2 pr-4">
                  {summary.durationMs ? `${summary.durationMs}ms` : "—"}
                </td>
                <td className="max-w-xs py-2 text-slate-400">{formatDetails(summary)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
