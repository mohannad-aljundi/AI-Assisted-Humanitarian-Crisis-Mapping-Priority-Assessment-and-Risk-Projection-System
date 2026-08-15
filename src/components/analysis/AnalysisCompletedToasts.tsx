"use client";

import Link from "next/link";
import { PriorityBadge } from "@/components/dashboard/PriorityBadge";
import { useAnalysisLiveOptional } from "@/contexts/AnalysisLiveContext";

export function AnalysisCompletedToasts() {
  const live = useAnalysisLiveOptional();
  if (!live || live.toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-end gap-2 px-4 sm:bottom-6 sm:px-6"
      aria-live="polite"
    >
      {live.toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto w-full max-w-sm rounded-2xl border border-emerald-400/30 bg-[#0b1524]/96 p-4 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-200">
                ✔ Intelligence analysis completed
              </p>
              <p className="mt-1 truncate text-sm font-bold text-white">
                {toast.incidentLabel}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PriorityBadge level={toast.priorityLevel} />
                <span className="text-xs text-slate-400">
                  Confidence{" "}
                  <span className="font-semibold text-slate-200">
                    {toast.reliabilityPercent}%
                  </span>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => live.dismissToast(toast.id)}
              className="text-xs text-slate-500 hover:text-slate-300"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <Link
            href={`/incidents/${toast.reportId}`}
            onClick={() => live.dismissToast(toast.id)}
            className="mt-3 inline-flex rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
          >
            Open Report
          </Link>
        </div>
      ))}
    </div>
  );
}
