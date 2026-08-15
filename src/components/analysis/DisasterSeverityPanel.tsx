"use client";

import type { DisasterSeverityAssessment } from "@/types";
import { LevelBadge, levelTone } from "@/components/analysis/shared";

const LEVEL_DOT: Record<DisasterSeverityAssessment["level"], string> = {
  Critical: "bg-red-500",
  High: "bg-orange-500",
  Medium: "bg-amber-400",
  Low: "bg-emerald-500",
};

interface DisasterSeverityPanelProps {
  assessment: DisasterSeverityAssessment | null;
  compact?: boolean;
}

export function DisasterSeverityPanel({
  assessment,
  compact = false,
}: DisasterSeverityPanelProps) {
  if (!assessment) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <p className="text-sm text-slate-500">
          Disaster severity assessment is not yet available for this report.
        </p>
      </div>
    );
  }

  const barPercent = Math.round((assessment.score / 10) * 100);
  const tone = levelTone(assessment.level);

  if (compact) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[assessment.level]}`} />
          <LevelBadge tone={tone}>{assessment.level}</LevelBadge>
          <span className="text-sm text-slate-400">
            {assessment.score.toFixed(1)} / 10
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Disaster Severity
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Overall humanitarian harm on a 0–10 scale (not a percentage metric)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-3 w-3 rounded-full ${LEVEL_DOT[assessment.level]}`}
            aria-hidden
          />
          <LevelBadge tone={tone}>{assessment.level}</LevelBadge>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-300">
        Severity score:{" "}
        <span className="text-lg font-semibold text-white">
          {assessment.score.toFixed(1)} / 10
        </span>
      </p>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-all ${
            assessment.level === "Critical"
              ? "bg-red-500"
              : assessment.level === "High"
                ? "bg-orange-500"
                : assessment.level === "Medium"
                  ? "bg-amber-400"
                  : "bg-emerald-500"
          }`}
          style={{ width: `${barPercent}%` }}
        />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-200">{assessment.reasoning}</p>

      {assessment.reasons.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Reason
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {assessment.reasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="text-slate-500">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Based on semantic analysis of the complete report
        {assessment.source === "ai"
          ? " using the configured language model."
          : " (rule-based estimate — re-run analysis for full AI assessment)."}
        {" "}Confidence: {Math.round(assessment.confidence * 100)}%.
      </p>
    </div>
  );
}
