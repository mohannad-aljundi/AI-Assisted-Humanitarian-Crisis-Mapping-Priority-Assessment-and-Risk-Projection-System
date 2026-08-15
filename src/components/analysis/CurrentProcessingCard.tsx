"use client";

import { AnimatedCounter } from "@/components/analysis/AnimatedCounter";
import { useAnalysisLiveOptional } from "@/contexts/AnalysisLiveContext";
import { formatAverageAnalysisTime } from "@/lib/queuePresentation";

export function CurrentProcessingCard({ className = "" }: { className?: string }) {
  const live = useAnalysisLiveOptional();
  if (!live?.queue) return null;

  const { queue } = live;
  const idle = queue.analysing === 0 && queue.waiting === 0;

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1424] to-[#0a101c] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${className}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">
        Live Workers
      </p>
      <h2 className="mt-1 text-lg font-semibold text-white">Current Processing</h2>
      <p className="mt-1 text-xs text-slate-500">
        Real-time background worker status only — not last sync statistics
      </p>

      {idle ? (
        <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-emerald-200">✔ Queue Empty</p>
          <p className="mt-1 text-xs text-emerald-100/70">
            All reports analysed successfully.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="Analysing" value={queue.analysing} tone="amber" />
          <Stat label="Waiting" value={queue.waiting} tone="slate" />
          <Stat label="Completed Today" value={queue.completedToday} tone="emerald" />
          <Stat
            label="Failed"
            value={queue.failed}
            tone={queue.failed > 0 ? "red" : "muted"}
          />
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Average Analysis Time
        </p>
        <p className="mt-1 text-xl font-bold text-white">
          {formatAverageAnalysisTime(queue.averageAnalysisSeconds)}
        </p>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "slate" | "emerald" | "red" | "muted";
}) {
  const tones = {
    amber: "text-amber-200",
    slate: "text-slate-100",
    emerald: "text-emerald-200",
    red: "text-red-200",
    muted: "text-slate-500",
  };

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>
        <AnimatedCounter value={value} />
      </p>
    </div>
  );
}
