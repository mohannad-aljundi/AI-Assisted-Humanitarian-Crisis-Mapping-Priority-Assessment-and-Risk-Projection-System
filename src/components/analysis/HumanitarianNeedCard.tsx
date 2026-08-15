import type { ExtractedHumanitarianNeed } from "@/types";
import { HumanitarianNeedLabel } from "@/components/humanitarian/HumanitarianNeedIcon";
import { ExpandableDescription } from "@/components/humanitarian/ExpandableDescription";
import { LevelBadge, levelTone } from "./shared";

interface HumanitarianNeedCardProps {
  need: ExtractedHumanitarianNeed;
  compact?: boolean;
}

export function HumanitarianNeedCard({ need, compact = false }: HumanitarianNeedCardProps) {
  const confidencePercent =
    need.confidence !== undefined ? Math.round(need.confidence * 100) : null;
  const source = need.source ?? "Observed";

  if (compact) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <HumanitarianNeedLabel needType={need.needType} labelClassName="font-medium text-white" />
          <SourceBadge source={source} />
          <LevelBadge tone={levelTone(need.severity)}>{need.severity}</LevelBadge>
          {confidencePercent !== null && (
            <span className="text-xs text-slate-500">{confidencePercent}%</span>
          )}
        </div>
      </div>
    );
  }

  const reasoning = (need.reasoning ?? need.reason ?? "").trim();
  const evidence = (need.evidence ?? "").trim();

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-slate-900/30 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Need</p>
          <HumanitarianNeedLabel needType={need.needType} className="mt-0.5" />
        </div>
        <div className="text-end">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Type</p>
          <SourceBadge source={source} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LevelBadge tone={levelTone(need.severity)}>{need.severity}</LevelBadge>
        {confidencePercent !== null && (
          <span className="text-xs text-slate-400">Confidence: {confidencePercent}%</span>
        )}
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3">
        {evidence ? (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Evidence
            </p>
            <ExpandableDescription
              text={evidence}
              maxLines={5}
              className="mt-1"
              fadeClassName="from-slate-950/95"
            />
          </div>
        ) : null}

        {reasoning ? (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Reasoning
            </p>
            <ExpandableDescription
              text={reasoning}
              maxLines={6}
              className="mt-1"
              fadeClassName="from-slate-950/95"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: "Observed" | "Inferred" }) {
  const isInferred = source === "Inferred";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isInferred
          ? "bg-violet-500/15 text-violet-300"
          : "bg-emerald-500/15 text-emerald-300"
      }`}
    >
      {source}
    </span>
  );
}
