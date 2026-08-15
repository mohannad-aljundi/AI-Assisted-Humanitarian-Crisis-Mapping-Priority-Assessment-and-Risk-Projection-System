import type { ExtendedAnalysisInsight } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScoreBar } from "@/components/ui/ScoreBar";

interface AiInsightsPanelProps {
  insight: ExtendedAnalysisInsight;
}

export function AiInsightsPanel({ insight }: AiInsightsPanelProps) {
  return (
    <SectionCard
      title="AI Insights"
      description="Extended NLP analysis with confidence scoring"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Sentiment</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {insight.sentiment ?? "Unknown"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Urgency</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {insight.urgencyLevel ?? "Unknown"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Threat Detected</p>
          <p className={`mt-1 text-lg font-semibold ${insight.threatDetected ? "text-red-400" : "text-emerald-400"}`}>
            {insight.threatDetected ? "Yes" : "No"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">Infrastructure Damage</p>
          <p className={`mt-1 text-lg font-semibold ${insight.infrastructureDamage ? "text-orange-400" : "text-slate-300"}`}>
            {insight.infrastructureDamage ? "Detected" : "Not detected"}
          </p>
        </div>
      </div>

      {Object.keys(insight.fieldConfidences).length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-slate-300">Field Confidence</h4>
          {Object.entries(insight.fieldConfidences).map(([field, confidence]) => (
            <ScoreBar
              key={field}
              label={field.replace(/([A-Z])/g, " $1").trim()}
              value={confidence}
              tone="blue"
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
