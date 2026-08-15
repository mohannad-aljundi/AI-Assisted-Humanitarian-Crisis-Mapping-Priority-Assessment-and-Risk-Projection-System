"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAnalysisLiveOptional } from "@/contexts/AnalysisLiveContext";
import { formatRelativeTime } from "@/lib/utils";

function LiveRelativeTime({ iso }: { iso: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span>Completed {formatRelativeTime(iso).toLowerCase()}</span>;
}

export function RecentlyCompletedIntelligencePanel({
  className = "",
}: {
  className?: string;
}) {
  const live = useAnalysisLiveOptional();
  if (!live) return null;

  const { recentCompleted, pinnedReportId } = live;

  return (
    <section
      className={`flex h-full flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1424] to-[#0a101c] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${className}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">
            Live Feed
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Recently Completed Intelligence
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Newest first · available instantly · no refresh required
          </p>
        </div>
        <Link
          href="/analysis"
          className="text-xs font-semibold text-blue-400 transition hover:text-blue-300"
        >
          View all
        </Link>
      </header>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {recentCompleted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-slate-500">
            Completed intelligence will appear here the moment analysis finishes.
          </div>
        ) : (
          recentCompleted.map((item) => {
            const pinned = item.id === pinnedReportId;
            return (
              <article
                key={item.id}
                className={`rounded-xl border px-4 py-3 transition-all duration-500 ${
                  pinned
                    ? "border-emerald-400/40 bg-emerald-500/10 shadow-[0_0_28px_rgba(16,185,129,0.15)]"
                    : "border-white/8 bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-white">
                      ✔ {item.incidentLabel}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      <LiveRelativeTime iso={item.completedAt} />
                    </p>
                  </div>
                  <Link
                    href={`/incidents/${item.id}`}
                    className="shrink-0 rounded-lg bg-blue-500/20 px-3 py-1.5 text-[11px] font-semibold text-blue-100 transition hover:bg-blue-500/30"
                  >
                    Open Intelligence
                  </Link>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
