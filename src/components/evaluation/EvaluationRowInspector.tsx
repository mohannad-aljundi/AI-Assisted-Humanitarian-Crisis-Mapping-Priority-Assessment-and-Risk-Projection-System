"use client";

import Link from "next/link";
import type { EvaluationReportListItem } from "@/types/evaluation";
import { StatusBadge } from "@/components/ui/badges";
import {
  CORRELATION_STATUS_STYLES,
  type CorrelationVerificationStatus,
} from "@/lib/correlationVerificationStatus";
import {
  confirmationLabel,
  formatConfidencePercent,
  formatReportCount,
  formatSourceCount,
  isConfirmationVerified,
  resolveOperationalTableStatus,
  verificationDetailText,
  verificationTooltip,
} from "@/lib/evaluationTableStatus";
import { btnGhost, btnPrimary } from "@/lib/uiClasses";

interface EvaluationRowInspectorProps {
  report: EvaluationReportListItem;
  viewHref: (reportId: string) => string;
  viewLabel: string;
  onClose: () => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function EvaluationRowInspector({
  report,
  viewHref,
  viewLabel,
  onClose,
}: EvaluationRowInspectorProps) {
  const confirmation = confirmationLabel(report);
  const verified = isConfirmationVerified(report);
  const operational = resolveOperationalTableStatus(report);
  const verificationDetail = verificationDetailText(report);
  const confirmationStyle =
    CORRELATION_STATUS_STYLES[confirmation as CorrelationVerificationStatus] ??
    "border-slate-500/30 bg-slate-500/10 text-slate-300";

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
        aria-label="Close inspector"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-[#0a0f18] shadow-2xl"
        role="dialog"
        aria-labelledby="evaluation-inspector-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-400/80">
              Incident Inspector
            </p>
            <h2
              id="evaluation-inspector-title"
              className="mt-1 text-lg font-bold leading-snug text-white"
            >
              {report.incidentLabel}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              <span className="font-medium text-slate-400">Original headline: </span>
              {report.originalTitle}
            </p>
            {report.location ? (
              <p className="mt-1 text-xs text-slate-500">{report.location}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className={`${btnGhost} shrink-0 px-2 py-1 text-xs`}>
            Close
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="grid grid-cols-2 gap-3">
            <Metric label="Operational status" value={operational} />
            <Metric label="Evaluation" value={report.evaluationStatus} />
            <Metric label="Report date" value={formatDate(report.reportDate)} />
            <Metric label="Crisis type" value={report.crisisType ?? "Unclassified"} />
          </section>

          <section className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Verification
            </p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${confirmationStyle}`}
            >
              {verified ? <span aria-hidden>✓</span> : null}
              {confirmation}
            </span>
            <p className="text-sm text-slate-400">{verificationTooltip(report)}</p>
            {verificationDetail ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-slate-200">
                {verificationDetail}
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Cluster intelligence
            </p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <InspectorStat label="Linked reports" value={String(report.supportingReportCount ?? 1)} />
              <InspectorStat
                label="Independent sources"
                value={String(report.independentSourceCount ?? 1)}
              />
              <InspectorStat
                label="Agreement"
                value={
                  report.sourceAgreementPercent != null
                    ? `${Math.round(report.sourceAgreementPercent)}%`
                    : "—"
                }
              />
              <InspectorStat
                label="Confidence"
                value={
                  report.confidenceScore != null
                    ? `${Math.round(report.confidenceScore * 100)}%`
                    : "—"
                }
              />
            </dl>
          </section>

          <section className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Priority & reliability
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge level={report.priorityLevel} />
              <span className="text-xs text-slate-400">
                Reliability {Math.round(report.reliabilityScore * 100)}%
              </span>
              {report.dynamicPriorityScore != null ? (
                <span className="text-xs text-slate-500">
                  Dynamic score {Math.round(report.dynamicPriorityScore * 100)}
                </span>
              ) : null}
            </div>
          </section>

          <section className="space-y-1 text-sm text-slate-400">
            <p>
              <span className="text-slate-500">Source:</span> {report.sourceSummary ?? report.sourceName}
            </p>
            {report.masterIncidentId ? (
              <p>
                <span className="text-slate-500">Master incident:</span>{" "}
                <span className="font-mono text-xs text-violet-300">{report.masterIncidentId}</span>
              </p>
            ) : null}
          </section>
        </div>

        <footer className="border-t border-white/10 px-5 py-4">
          <Link href={viewHref(report.id)} className={`${btnPrimary} block w-full text-center`}>
            {viewLabel} →
          </Link>
        </footer>
      </aside>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function InspectorStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-white">{value}</dd>
    </div>
  );
}
