"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, Layers, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { MasterIncidentSummary } from "@/services/incidentCorrelationService";
import {
  CORRELATION_STATUS_STYLES,
  type CorrelationVerificationStatus,
} from "@/lib/correlationVerificationStatus";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";
import { formatRelativeTime } from "@/lib/utils";
import { iconProps } from "@/components/ui/AppIcon";
import { StatusBadge } from "@/components/ui/badges";

interface MasterIncidentCorrelationPanelProps {
  cluster: MasterIncidentSummary;
}

export function MasterIncidentCorrelationPanel({
  cluster,
}: MasterIncidentCorrelationPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const statusStyle =
    CORRELATION_STATUS_STYLES[
      cluster.correlationVerificationStatus as CorrelationVerificationStatus
    ];

  return (
    <div className={`${dashboardCard} border-violet-500/20 bg-violet-500/[0.04] p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
            <Layers {...iconProps} size={20} className="text-violet-300" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/80">
              Master Incident
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {cluster.supportingReportCount} linked report
              {cluster.supportingReportCount === 1 ? "" : "s"} from{" "}
              {cluster.independentSourceCount} independent source
              {cluster.independentSourceCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${statusStyle}`}
        >
          <ShieldCheck {...iconProps} size={14} />
          {cluster.correlationVerificationStatus}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Supporting reports" value={String(cluster.supportingReportCount)} />
        <Metric label="Independent sources" value={String(cluster.independentSourceCount)} />
        <Metric label="Source agreement" value={`${Math.round(cluster.sourceAgreementPercent)}%`} />
        <Metric
          label="Timeline consistency"
          value={`${Math.round(cluster.timelineConsistency * 100)}%`}
        />
        <Metric label="Confidence" value={`${Math.round(cluster.confidenceScore * 100)}%`} />
        <Metric label="Evidence strength" value={`${Math.round(cluster.evidenceStrength * 100)}%`} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <StatusBadge level={cluster.dynamicPriorityLevel} />
        <span className="text-xs text-slate-500">
          Dynamic priority score {Math.round(cluster.dynamicPriorityScore * 100)}%
        </span>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-5 flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-slate-200 transition hover:border-violet-500/30 hover:bg-violet-500/[0.06]"
      >
        <span>
          {expanded ? "Hide" : "Inspect"} {cluster.linkedReports.length} contributing report
          {cluster.linkedReports.length === 1 ? "" : "s"}
        </span>
        {expanded ? (
          <ChevronUp {...iconProps} size={18} className="text-slate-400" />
        ) : (
          <ChevronDown {...iconProps} size={18} className="text-slate-400" />
        )}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-2">
          {cluster.linkedReports.map((report) => (
            <div
              key={report.reportId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/6 bg-slate-950/40 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-white">{report.title}</p>
                  {report.isCanonical ? (
                    <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                      Canonical
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {report.sourceName} · {formatRelativeTime(report.reportDate)} ·{" "}
                  {Math.round(report.similarityScore * 100)}% match
                </p>
              </div>
              <Link
                href={`/incidents/${report.reportId}`}
                className="shrink-0 text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Open report
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
