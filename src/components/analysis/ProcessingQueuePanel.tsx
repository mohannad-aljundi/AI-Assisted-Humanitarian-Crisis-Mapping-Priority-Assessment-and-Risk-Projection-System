"use client";

import { AnimatedCounter } from "@/components/analysis/AnimatedCounter";
import { useAnalysisLiveOptional } from "@/contexts/AnalysisLiveContext";
import { formatAverageAnalysisTime } from "@/lib/queuePresentation";

interface ProcessingQueuePanelProps {
  compact?: boolean;
  className?: string;
}

function PipelineStage({
  label,
  active,
  done,
}: {
  label: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-all duration-500 ${
          done
            ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
            : active
              ? "border-amber-400/50 bg-amber-500/20 text-amber-100 shadow-[0_0_16px_rgba(245,158,11,0.25)]"
              : "border-white/10 bg-white/[0.03] text-slate-500"
        }`}
      >
        {done ? "✓" : active ? "⚙" : "·"}
      </div>
      <p
        className={`text-[10px] font-semibold uppercase tracking-wider ${
          done ? "text-emerald-300" : active ? "text-amber-200" : "text-slate-500"
        }`}
      >
        {label}
      </p>
    </div>
  );
}

export function ProcessingQueuePanel({
  compact = false,
  className = "",
}: ProcessingQueuePanelProps) {
  const live = useAnalysisLiveOptional();

  if (!live?.queue) {
    if (!compact) return null;

    return (
      <div
        className={`rounded-xl border border-white/10 bg-[#0b1220]/90 px-3 py-2.5 shadow-lg backdrop-blur ${className}`}
        aria-hidden
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Processing Queue
        </p>
        <p className="mt-1 text-xs text-slate-400">—</p>
      </div>
    );
  }

  const { queue, connected } = live;
  const isActive = queue.analysing > 0 || queue.waiting > 0;
  const isEmpty = !isActive && queue.failed === 0;

  if (compact) {
    return (
      <div
        className={`rounded-xl border border-white/10 bg-[#0b1220]/90 px-3 py-2.5 shadow-lg backdrop-blur ${className}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Processing Queue
          </p>
          <p className="text-sm font-bold tabular-nums text-white">
            <AnimatedCounter value={queue.progressPercent} />%
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-400 to-cyan-300 transition-[width] duration-700 ease-out"
            style={{ width: `${queue.progressPercent}%` }}
          />
        </div>
        <div className="mt-2 flex gap-3 text-[10px] text-slate-300">
          <span className="text-emerald-300">
            ✓ <AnimatedCounter value={queue.completedToday} />
          </span>
          <span className="text-amber-300">
            ⚙ <AnimatedCounter value={queue.analysing} />
          </span>
          <span>
            ⏳ <AnimatedCounter value={queue.waiting} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`flex h-full flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1424] to-[#0a101c] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${className}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-300/80">
            AI Operations
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">Processing Queue</h2>
          <p className="mt-1 text-xs text-slate-500">
            {connected ? "Live worker status" : "Reconnecting…"} · each report opens as soon as it finishes
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums tracking-tight text-white">
            <AnimatedCounter value={queue.progressPercent} />
            <span className="text-lg text-slate-400">%</span>
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Complete
          </p>
        </div>
      </header>

      <div
        className="mt-5 h-3 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/5"
        role="progressbar"
        aria-valuenow={queue.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-400 to-cyan-300 transition-[width] duration-700 ease-out"
          style={{ width: `${queue.progressPercent}%` }}
        />
      </div>

      <div className="mt-5 flex items-center gap-2">
        <PipelineStage label="Queued" active={queue.waiting > 0} done={queue.waiting === 0 && queue.analysing === 0} />
        <div className="mb-5 h-px flex-1 bg-gradient-to-r from-slate-600 to-amber-500/50" />
        <PipelineStage label="Analysing" active={queue.analysing > 0} done={queue.analysing === 0 && queue.waiting === 0} />
        <div className="mb-5 h-px flex-1 bg-gradient-to-r from-amber-500/50 to-emerald-500/50" />
        <PipelineStage label="Completed" done={queue.completedToday > 0 || queue.waveCompleted > 0} active={false} />
      </div>

      {isEmpty ? (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-5 text-center">
          <p className="text-sm font-semibold text-emerald-200">✔ Queue Empty</p>
          <p className="mt-1 text-xs text-emerald-100/70">
            All reports analysed successfully.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            icon="✓"
            label="Completed"
            value={queue.completedToday}
            tone="emerald"
          />
          <Metric icon="⚙" label="Analysing" value={queue.analysing} tone="amber" pulse={queue.analysing > 0} />
          <Metric icon="⏳" label="Waiting" value={queue.waiting} tone="slate" />
          {queue.failed > 0 ? (
            <Metric icon="❌" label="Failed" value={queue.failed} tone="red" />
          ) : (
            <Metric icon="Σ" label="All-time ready" value={queue.completed} tone="violet" />
          )}
        </div>
      )}

      <div className="mt-4 border-t border-white/5 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Average Analysis Time
        </p>
        <p className="mt-0.5 text-sm font-semibold text-slate-200">
          {formatAverageAnalysisTime(queue.averageAnalysisSeconds)}
        </p>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
  pulse = false,
}: {
  icon: string;
  label: string;
  value: number;
  tone: "emerald" | "amber" | "slate" | "red" | "violet";
  pulse?: boolean;
}) {
  const tones = {
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-100",
    slate: "border-white/10 bg-white/[0.03] text-slate-200",
    red: "border-red-500/20 bg-red-500/10 text-red-100",
    violet: "border-violet-500/20 bg-violet-500/10 text-violet-100",
  };

  return (
    <div
      className={`rounded-xl border px-3 py-3 ${tones[tone]} ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
        {icon} {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        <AnimatedCounter value={value} />
      </p>
    </div>
  );
}
