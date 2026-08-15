import type { HumanitarianNeedDetail } from "@/lib/incidentEnrichment";
import { HumanitarianNeedLabel } from "@/components/humanitarian/HumanitarianNeedIcon";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { LevelBadge, levelTone } from "@/components/analysis/shared";
import type { NLPAnalysisResult } from "@/types";

interface HumanitarianMetricsPanelProps {
  nlp: NLPAnalysisResult;
  needs: HumanitarianNeedDetail[];
}

export function HumanitarianMetricsPanel({ nlp, needs }: HumanitarianMetricsPanelProps) {
  return (
    <SectionCard
      title="Humanitarian Impact Metrics"
      description="Population and ranked need severity indicators"
    >
      <div className="mb-6 rounded-xl border border-white/10 bg-slate-900/50 p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">Affected Population</p>
        <p className="mt-1 text-3xl font-bold text-white">
          {nlp.affectedPopulation?.toLocaleString() ?? "Not estimated"}
        </p>
      </div>

      {needs.length === 0 ? (
        <p className="text-sm text-slate-500">No humanitarian needs detected for metrics breakdown.</p>
      ) : (
        <div className="space-y-4">
          {needs.map((need) => {
            const score = Math.max(need.score, need.confidence);
            return (
              <div key={`${need.needType}-${need.severity}`} className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="flex w-40 shrink-0 items-center">
                    <HumanitarianNeedLabel
                      needType={need.needType}
                      labelClassName="text-sm text-slate-300"
                      iconClassName="text-sm leading-none"
                    />
                  </div>
                  <div className="flex-1">
                    <ScoreBar
                      label=""
                      value={score}
                      tone={
                        need.severity === "Critical"
                          ? "critical"
                          : need.severity === "High"
                            ? "high"
                            : need.severity === "Medium"
                              ? "medium"
                              : "low"
                      }
                      showPercent={false}
                    />
                  </div>
                  <LevelBadge tone={levelTone(need.severity)}>{need.severity}</LevelBadge>
                  <span className="w-12 text-right text-xs text-slate-400">
                    {Math.round(need.confidence * 100)}%
                  </span>
                </div>
                <p className="pl-40 text-xs text-slate-500">
                  {need.source === "Inferred" ? "AI inferred" : need.source ?? "Observed"}
                  {need.evidence ? ` · ${need.evidence.slice(0, 80)}${need.evidence.length > 80 ? "…" : ""}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
