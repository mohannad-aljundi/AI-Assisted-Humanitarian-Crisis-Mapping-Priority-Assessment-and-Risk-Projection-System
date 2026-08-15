"use client";

import type { HumanitarianNeedDetail } from "@/lib/incidentEnrichment";
import { getHumanitarianNeedIcon } from "@/lib/humanitarianNeedIcons";
import { normaliseNeedName } from "@/lib/humanitarianNeedTaxonomy";
import {
  needExplanation,
  severityBadgeClass,
} from "@/lib/humanitarianNeedDisplay";
import {
  dashboardCard,
  severityBarColor,
  severityGradient,
} from "@/components/incidents/dashboard/incidentDashboardStyles";

interface HumanitarianNeedSelectedDetailProps {
  need: HumanitarianNeedDetail;
  onClose: () => void;
}

export function HumanitarianNeedSelectedDetail({
  need,
  onClose,
}: HumanitarianNeedSelectedDetailProps) {
  const canonical = normaliseNeedName(need.needType);
  const icon = getHumanitarianNeedIcon(canonical);
  const confidencePct = Math.round(need.confidence * 100);
  const explanation = needExplanation(need);
  const barWidth = Math.max(need.score, need.confidence) * 100;

  return (
    <div
      className={`${dashboardCard} border-cyan-500/20 bg-gradient-to-br p-6 ${severityGradient(need.severity)}`}
      id="selected-need-detail"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-4xl leading-none" role="img" aria-hidden>
            {icon}
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">
              Selected need detail
            </p>
            <h3 className="mt-1 text-xl font-semibold text-white">{canonical}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${severityBadgeClass(need.severity)}`}
              >
                {need.severity}
              </span>
              <span className="text-xs text-slate-400">
                {need.source === "Inferred" ? "AI inferred" : need.source ?? "Observed"}
              </span>
              <span className="text-xs font-semibold text-white">{confidencePct}% confidence</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-400 hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="mt-5 space-y-5">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            AI interpretation
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{explanation}</p>
        </section>

        {need.evidence ? (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Evidence
            </p>
            <p className="mt-2 rounded-xl border border-white/8 bg-black/20 px-4 py-3 text-sm leading-relaxed text-slate-300">
              {need.evidence}
            </p>
          </section>
        ) : null}

        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Severity assessment
          </p>
          <div className="mt-2">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-slate-400">Combined severity score</span>
              <span className="font-medium text-white">{Math.round(barWidth)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/25">
              <div
                className={`h-full rounded-full ${severityBarColor(need.severity)}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
