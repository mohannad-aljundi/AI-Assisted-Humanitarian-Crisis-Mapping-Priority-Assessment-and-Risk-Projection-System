import type { EvaluationReportStatus } from "@/types/evaluation";

const STYLES: Record<EvaluationReportStatus, string> = {
  Validated: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "Feedback submitted": "border-violet-500/30 bg-violet-500/10 text-violet-300",
  "Pending review": "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

export function EvaluationStatusBadge({ status }: { status: EvaluationReportStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
