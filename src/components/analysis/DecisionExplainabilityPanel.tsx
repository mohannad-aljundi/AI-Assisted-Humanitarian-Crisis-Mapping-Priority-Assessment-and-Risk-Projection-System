import type { ExtendedAnalysisInsight } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";
import { ExplanationPanel } from "@/components/analysis/ExplanationPanel";

interface DecisionExplainabilityPanelProps {
  insight: ExtendedAnalysisInsight;
}

export function DecisionExplainabilityPanel({
  insight,
}: DecisionExplainabilityPanelProps) {
  return (
    <SectionCard
      title="Why was this classified?"
      description="AI decision explainability — academic transparency for assessment outcomes"
    >
      <div className="mb-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <p className="text-sm text-cyan-200">
          The system reached its conclusions based on the following decision factors.
          Each factor contributes to priority, risk, and reliability scoring.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FactorList
          title="Decision Factors"
          factors={insight.priorityExplanation.reasons}
        />
        <FactorList
          title="Risk Drivers"
          factors={insight.riskExplanation.reasons}
        />
        <FactorList
          title="Confidence Factors"
          factors={Object.entries(insight.fieldConfidences).map(
            ([field, score]) =>
              `${field}: ${Math.round(score * 100)}% confidence`
          )}
        />
        <FactorList
          title="Priority Drivers"
          factors={insight.reliabilityExplanation.reasons}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <ExplanationPanel
          title="Priority Conclusion"
          explanation={insight.priorityExplanation}
          accent="orange"
        />
        <ExplanationPanel
          title="Risk Conclusion"
          explanation={insight.riskExplanation}
          accent="red"
        />
        <ExplanationPanel
          title="Reliability Conclusion"
          explanation={insight.reliabilityExplanation}
          accent="blue"
        />
      </div>
    </SectionCard>
  );
}

function FactorList({ title, factors }: { title: string; factors: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <ul className="space-y-2">
        {factors.length === 0 ? (
          <li className="text-sm text-slate-500">No factors recorded</li>
        ) : (
          factors.map((factor, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <span className="text-emerald-400">✓</span>
              {factor}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
