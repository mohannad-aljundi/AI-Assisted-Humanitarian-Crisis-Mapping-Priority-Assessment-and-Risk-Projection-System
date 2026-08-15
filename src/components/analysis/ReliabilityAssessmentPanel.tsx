import type { ReliabilityAssessment } from "@prisma/client";
import type { ExtendedAnalysisInsight } from "@/types";
import { buildReliabilityFactors } from "@/lib/initialEvaluationPresentation";
import { ScoreBar } from "./shared";

interface ReliabilityAssessmentPanelProps {
  assessment: ReliabilityAssessment;
  insight?: ExtendedAnalysisInsight | null;
}

export function ReliabilityAssessmentPanel({
  assessment,
  insight,
}: ReliabilityAssessmentPanelProps) {
  const scorePct = Math.round(assessment.finalScore * 100);
  const factors = buildReliabilityFactors(assessment, insight);

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1424] to-[#0a101c] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300/80">
        Source Trust
      </p>
      <h3 className="mt-1 text-lg font-semibold text-white">Source Reliability</h3>

      <div className="mt-5 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-blue-200/80">
          Reliability Score
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-white">
          {scorePct}
          <span className="text-lg font-medium text-blue-200/70">%</span>
        </p>
      </div>

      <div className="mt-5 space-y-4">
        <ScoreBar label="Source Credibility" value={assessment.sourceScore} />
        <ScoreBar label="Recency" value={assessment.recencyScore} />
        <ScoreBar label="Consistency" value={assessment.consistencyScore} />
      </div>

      <div className="mt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Based on
        </p>
        <ul className="mt-3 space-y-2">
          {factors.map((factor) => (
            <li
              key={factor.label}
              className="flex items-start gap-2 text-sm text-slate-300"
            >
              <span className={factor.positive ? "text-emerald-400" : "text-amber-300"}>
                {factor.positive ? "✔" : "⚠"}
              </span>
              <span>{factor.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
