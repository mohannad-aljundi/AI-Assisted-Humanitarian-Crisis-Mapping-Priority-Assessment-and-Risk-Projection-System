"use client";

import type { AssessmentOverview } from "@/lib/incidentEnrichment";
import type { ExtendedAnalysisInsight, PersistedAnalysisView } from "@/types";
import { ClipboardCheck } from "lucide-react";
import {
  dashboardCard,
  dashboardCardHover,
  levelToSeverityGradient,
  priorityBadgeClass,
  severityBarColor,
} from "@/components/incidents/dashboard/incidentDashboardStyles";

interface IncidentFinalAssessmentCardProps {
  overview: AssessmentOverview;
  analysis: PersistedAnalysisView;
  insight: ExtendedAnalysisInsight | null;
}

export function IncidentFinalAssessmentCard({
  overview,
  analysis,
  insight,
}: IncidentFinalAssessmentCardProps) {
  const priorityScore = Math.round(analysis.priorityAssessment.severityScore * 100);
  const confidencePct = Math.round(overview.confidence * 100);
  const reliabilityPct = Math.round(overview.reliability * 100);
  const severityScore = overview.disasterSeverity?.score ?? priorityScore / 10;
  const severityPct = Math.min(100, Math.round((severityScore / 10) * 100));

  const summary =
    insight?.priorityReasoning?.narrative ??
    insight?.finalReasoning?.conclusion ??
    insight?.situationSummary ??
    insight?.priorityExplanation?.conclusion ??
    `The report was classified as ${overview.priority.toUpperCase()} PRIORITY based on humanitarian severity, source reliability, and operational risk indicators.`;

  const bars = [
    { label: "Severity", value: severityPct, level: overview.priority },
    { label: "Confidence", value: confidencePct, level: confidencePct >= 75 ? "High" : confidencePct >= 50 ? "Medium" : "Low" },
    { label: "Reliability", value: reliabilityPct, level: reliabilityPct >= 80 ? "Low" : reliabilityPct >= 60 ? "Medium" : "High" },
  ];

  return (
    <article
      className={`${dashboardCard} ${dashboardCardHover} relative flex h-full flex-col overflow-hidden bg-gradient-to-br p-6 ${levelToSeverityGradient(overview.priority)}`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300/90">
          Final Assessment
        </p>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black/20 ring-1 ring-white/10 ${priorityBadgeClass(overview.priority)}`}
          aria-hidden
        >
          <ClipboardCheck className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex rounded-2xl px-4 py-2 text-lg font-bold ring-1 ${priorityBadgeClass(overview.priority)}`}
        >
          {overview.priority}
        </span>
        <div className="text-right">
          <p className="text-xs text-slate-400">Severity score</p>
          <p className="text-2xl font-bold text-white">
            {overview.disasterSeverity
              ? `${overview.disasterSeverity.score.toFixed(1)}/10`
              : `${priorityScore}/100`}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-300">
        Confidence{" "}
        <span className="font-semibold text-cyan-200">{confidencePct}%</span>
      </p>

      <p className="mt-4 line-clamp-4 flex-1 text-sm leading-relaxed text-slate-200">{summary}</p>

      <div className="mt-6 space-y-4 border-t border-white/5 pt-5">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-slate-400">{bar.label}</span>
              <span className="font-medium text-white">{bar.value}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/25">
              <div
                className={`h-full rounded-full transition-all duration-700 ${severityBarColor(bar.level)}`}
                style={{ width: `${bar.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
