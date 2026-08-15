"use client";

import Link from "next/link";
import { useAnalysisLiveOptional } from "@/contexts/AnalysisLiveContext";
import { useSyncMonitoringOptional } from "@/contexts/SyncMonitoringContext";
import { formatQueueSummary } from "@/lib/queuePresentation";

function formatSyncUtc(iso: string | null): string {
  if (!iso) return "Not run yet";

  const formatted = new Date(iso).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${formatted} UTC`;
}

/**
 * Compact Auto Sync indicator — queue counters come from AnalysisLiveContext
 * (same source as Processing Queue card).
 */
export function SyncStatusBar({ compact = false }: { compact?: boolean }) {
  const sync = useSyncMonitoringOptional();
  const live = useAnalysisLiveOptional();

  const status = sync?.status;
  const queue = live?.queue ?? status?.backgroundProcessing.queue;
  const autoLabel = status?.autoSyncEnabled ? "Auto Sync ON" : "Auto Sync OFF";
  const queueBusy = (queue?.analysing ?? 0) > 0 || (queue?.waiting ?? 0) > 0;
  const dotClass = status?.isRunning || (queue?.analysing ?? 0) > 0
    ? "bg-amber-400 animate-pulse"
    : (queue?.waiting ?? 0) > 0
      ? "bg-amber-400"
      : status?.autoSyncEnabled
        ? "bg-emerald-400"
        : "bg-slate-500";

  const lastSyncLabel = status?.lastSuccessfulSyncAt
    ? formatSyncUtc(status.lastSuccessfulSyncAt)
    : "Not run yet";

  const valueLabel = status?.isRunning
    ? status.phaseMessage
    : queueBusy
      ? formatQueueSummary(queue!)
      : lastSyncLabel.split(" UTC")[0];

  if (!status) {
    if (compact) {
      return (
        <div className="enterprise-status-widget" aria-hidden>
          <p className="enterprise-status-widget__label">Auto Sync</p>
          <p className="enterprise-status-widget__value">
            <span className="enterprise-status-widget__dot bg-slate-500" />
            <span className="truncate">—</span>
          </p>
        </div>
      );
    }

    return (
      <div
        className="relative shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
        aria-hidden
      >
        <p className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-200">
          <span className="h-2 w-2 shrink-0 rounded-full bg-slate-500" />
          Auto Sync
        </p>
        <p className="mt-1 text-[10px] text-slate-500">
          Last sync: <span className="text-slate-400">—</span>
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="enterprise-status-widget">
        <p className="enterprise-status-widget__label">Auto Sync</p>
        <p className="enterprise-status-widget__value">
          <span className={`enterprise-status-widget__dot ${dotClass}`} />
          <span className="truncate">
            {autoLabel.replace("Auto Sync ", "")} · {valueLabel}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="relative shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-200">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        {autoLabel}
      </p>
      <p className="mt-1 text-[10px] text-slate-500">
        Last sync: <span className="text-slate-400">{lastSyncLabel}</span>
      </p>
    </div>
  );
}

export function NewIncidentsNotification() {
  const sync = useSyncMonitoringOptional();
  if (!sync || sync.status.newIncidentsCount <= 0) return null;

  const count = sync.status.newIncidentsCount;

  return (
    <Link
      href="/alerts"
      onClick={() => sync.acknowledgeNewIncidents()}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 transition hover:border-amber-400/50 hover:bg-amber-500/15"
    >
      <span aria-hidden>🔔</span>
      {count} New Incident{count === 1 ? "" : "s"} Detected
    </Link>
  );
}
