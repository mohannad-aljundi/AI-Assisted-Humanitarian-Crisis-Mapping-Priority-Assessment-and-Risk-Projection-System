"use client";

import { useSyncMonitoringOptional } from "@/contexts/SyncMonitoringContext";

function formatSyncUtc(iso: string | null): string {
  if (!iso) return "Not run yet";
  return (
    new Date(iso).toLocaleString("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " UTC"
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${minutes}m ${rem}s`;
}

export function LastSuccessfulSyncCard({ className = "" }: { className?: string }) {
  const sync = useSyncMonitoringOptional();
  if (!sync) return null;

  const { status } = sync;
  const hasSuccess = Boolean(status.lastSuccessfulSyncAt);
  const durationMs =
    status.lastSyncTiming?.totalMs ??
    (status.lastFetchDurationMs != null || status.lastSaveDurationMs != null
      ? (status.lastFetchDurationMs ?? 0) + (status.lastSaveDurationMs ?? 0)
      : null);

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c1424] to-[#0a101c] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${className}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
        Ingestion
      </p>
      <h2 className="mt-1 text-lg font-semibold text-white">Last Successful Sync</h2>
      <p className="mt-1 text-xs text-slate-500">
        Latest fetch/import operation only — independent of live worker status
      </p>

      {!hasSuccess ? (
        <p className="mt-5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-slate-500">
          No successful ingestion run has been recorded yet.
        </p>
      ) : (
        <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
          <Row label="Fetched" value={String(status.lastFetchedCount)} />
          <Row label="New Imports" value={String(status.lastNewImportCount ?? 0)} />
          <Row label="Requeued" value={String(status.lastRequeuedCount ?? 0)} />
          <Row
            label="Already Analysed"
            value={String(status.lastPreviouslyAnalysedCount ?? 0)}
          />
          <Row label="Skipped" value={String(status.lastSkippedCount)} />
          <Row label="Duration" value={formatDuration(durationMs)} />
          <div className="col-span-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Sync Time
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-200">
              {formatSyncUtc(status.lastSuccessfulSyncAt)}
            </dd>
          </div>
        </dl>
      )}

      {status.lastError ? (
        <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {status.lastError}
        </p>
      ) : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold tabular-nums text-white">{value}</dd>
    </div>
  );
}
