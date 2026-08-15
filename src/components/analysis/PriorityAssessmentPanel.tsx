"use client";

import { useState } from "react";
import type { PriorityAssessment, ReliabilityAssessment, RiskLevel } from "@prisma/client";
import type { ExtendedAnalysisInsight } from "@/types";
import {
  buildAiDecisionSummary,
  buildPriorityFactors,
  buildRiskFactors,
  buildWhyDecisionSections,
  riskBarPercent,
} from "@/lib/initialEvaluationPresentation";
import { LevelBadge, levelTone } from "./shared";

interface PriorityAssessmentPanelProps {
  assessment: PriorityAssessment;
  reasons?: string[];
  riskLevel?: RiskLevel;
  insight?: ExtendedAnalysisInsight | null;
  reliabilityAssessment?: ReliabilityAssessment | null;
}

export function PriorityAssessmentPanel({
  assessment,
  riskLevel,
  insight,
  reliabilityAssessment,
}: PriorityAssessmentPanelProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const priorityScore = Math.round(assessment.severityScore * 100);
  const factors = buildPriorityFactors(assessment, insight);
  const decisionSummary = buildAiDecisionSummary(assessment, insight);
  const whySections = buildWhyDecisionSections(
    assessment,
    reliabilityAssessment,
    insight
  );
  const riskFactors = buildRiskFactors(insight, riskLevel);
  const riskPct = riskBarPercent(riskLevel);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1424] to-[#0a101c] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300/80">
              Initial Evaluation
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">Priority Assessment</h3>
            <div className="mt-3">
              <LevelBadge tone={levelTone(assessment.priorityLevel)}>
                {assessment.priorityLevel}
              </LevelBadge>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Final Priority Score
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-white">
              {priorityScore}
              <span className="text-lg font-medium text-slate-500"> / 100</span>
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Priority Factors
          </p>
          <ul className="mt-3 space-y-2">
            {factors.map((factor) => (
              <li
                key={`${factor.label}-${factor.points}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
              >
                <span className="text-sm text-slate-200">
                  <span className="mr-2 text-emerald-400">✔</span>
                  {factor.label}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-200">
                  +{factor.points}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.07] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/90">
          AI Decision Summary
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-100">{decisionSummary}</p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1424] to-[#0a101c]">
        <button
          type="button"
          onClick={() => setWhyOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition hover:bg-white/[0.03]"
          aria-expanded={whyOpen}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300/80">
              Explainable AI
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              Why did the AI reach this conclusion?
            </p>
          </div>
          <span className="text-slate-400">{whyOpen ? "▴" : "▾"}</span>
        </button>
        {whyOpen ? (
          <div className="space-y-4 border-t border-white/8 px-6 py-5">
            {whySections.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {section.title}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {section.items.map((item) => (
                    <li key={item} className="text-sm text-slate-300">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {whySections.length === 0 ? (
              <p className="text-sm text-slate-400">
                Supporting rationale is limited for this report. Priority reflects the
                humanitarian severity indicators available in the source material.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {riskLevel ? (
        <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1424] to-[#0a101c] p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300/80">
            Risk Summary
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">Humanitarian Risk</h3>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/35">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 transition-[width] duration-700"
              style={{ width: `${riskPct}%` }}
            />
          </div>
          <div className="mt-3">
            <LevelBadge tone={levelTone(riskLevel)}>{riskLevel}</LevelBadge>
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Contributing factors
          </p>
          <ul className="mt-2 space-y-1.5">
            {riskFactors.map((factor) => (
              <li key={factor.label} className="text-sm text-slate-300">
                • {factor.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
