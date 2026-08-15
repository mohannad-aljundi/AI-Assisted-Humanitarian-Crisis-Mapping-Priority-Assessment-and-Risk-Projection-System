"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_INGESTION_SOURCE,
  INGESTION_KEYWORDS,
  type IngestionKeyword,
  type IngestionSource,
} from "@/lib/ingestionConstants";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { SourceStatusGrid } from "@/components/ingestion/SourceStatusGrid";
import { SourceSummaryTable } from "@/components/ingestion/SourceSummaryTable";
import { SourceStatisticsPanel } from "@/components/dashboard/SourceStatisticsPanel";
import { useSyncMonitoring } from "@/contexts/SyncMonitoringContext";
import {
  alertError,
  alertInfo,
  btnGhost,
  btnPrimary,
  inputDark,
  pageContainer,
  selectDark,
} from "@/lib/uiClasses";
import type { IngestionRunResult, IngestionSourceInfo, SourceStatisticsDashboard } from "@/types";

interface IngestionErrorDetails {
  message: string;
  errorType?: string;
  status?: number;
  stack?: string;
}

const KEYWORD_OPTIONS: { value: IngestionKeyword; label: string }[] = [
  { value: "all", label: "All Keywords" },
  ...INGESTION_KEYWORDS.map((keyword) => ({
    value: keyword,
    label: keyword.charAt(0).toUpperCase() + keyword.slice(1),
  })),
];

async function fetchSourceStatuses(): Promise<IngestionSourceInfo[]> {
  const response = await fetch("/api/ingestion/sources");
  if (!response.ok) {
    throw new Error("Failed to load ingestion source status");
  }
  const payload = (await response.json()) as { sources?: IngestionSourceInfo[] };
  return payload.sources ?? [];
}

export function IngestionPanel() {
  const router = useRouter();
  const { syncNow, status: syncStatus, isRefreshing: isSyncing, refreshStatus } =
    useSyncMonitoring();
  const [source, setSource] = useState<IngestionSource>(DEFAULT_INGESTION_SOURCE);
  const [keyword, setKeyword] = useState<IngestionKeyword>("all");
  const [sources, setSources] = useState<IngestionSourceInfo[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false);
  const [error, setError] = useState<IngestionErrorDetails | null>(null);
  const [result, setResult] = useState<IngestionRunResult | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [includeManual, setIncludeManual] = useState(false);
  const [sourceStats, setSourceStats] = useState<SourceStatisticsDashboard | null>(null);
  const sourceOptions = useMemo(
    () => [
      { value: "FALLBACK", label: "Multi-source fallback (recommended)" },
      ...sources.map((item) => ({
        value: item.id,
        label: `${item.name} only`,
      })),
      { value: "MANUAL", label: "Manual import only" },
    ],
    [sources]
  );

  useEffect(() => {
    let cancelled = false;

    void fetchSourceStatuses()
      .then((nextSources) => {
        if (!cancelled) setSources(nextSources);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });

    void fetch("/api/ingestion/health")
      .then((r) => r.json())
      .then((payload: { statistics?: SourceStatisticsDashboard }) => {
        if (!cancelled && payload.statistics) setSourceStats(payload.statistics);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSyncNow() {
    if (isRunningRef.current || isSyncing) return;

    isRunningRef.current = true;
    setIsRunning(true);
    setError(null);
    setResult(null);

    const manualArticles =
      includeManual && manualTitle.trim() && manualContent.trim()
        ? [
            {
              title: manualTitle.trim(),
              content: manualContent.trim(),
              reportDate: new Date().toISOString(),
              sourceName: "Manual Import",
            },
          ]
        : undefined;

    try {
      const syncResult = await syncNow(
        manualArticles ? { manualArticles } : undefined
      );
      if (syncResult) {
        setResult(syncResult);
        router.refresh();
      }

      void fetchSourceStatuses()
        .then(setSources)
        .catch(() => undefined);

      void fetch("/api/ingestion/health")
        .then((r) => r.json())
        .then((payload: { statistics?: SourceStatisticsDashboard }) => {
          if (payload.statistics) setSourceStats(payload.statistics);
        })
        .catch(() => undefined);
    } catch (runError) {
      setError({
        message:
          runError instanceof Error ? runError.message : "Sync failed",
      });
    } finally {
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }

  async function handleRun() {
    if (isRunningRef.current) return;

    isRunningRef.current = true;
    setIsRunning(true);
    setError(null);
    setResult(null);

    const manualArticles =
      includeManual && manualTitle.trim() && manualContent.trim()
        ? [
            {
              title: manualTitle.trim(),
              content: manualContent.trim(),
              reportDate: new Date().toISOString(),
              sourceName: "Manual Import",
            },
          ]
        : undefined;

    try {
      const response = await fetch("/api/ingestion/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          keyword,
          limit: 10,
          manualArticles,
        }),
      });

      const raw = await response.text();
      let payload: IngestionRunResult & IngestionErrorDetails & { error?: string };

      try {
        payload = JSON.parse(raw) as IngestionRunResult &
          IngestionErrorDetails & { error?: string };
      } catch {
        throw new Error(raw.slice(0, 500) || "Ingestion failed");
      }

      if (!response.ok) {
        setError({
          message: payload.error ?? raw.slice(0, 500) ?? "Ingestion failed",
          errorType: payload.errorType,
          status: payload.status ?? response.status,
          stack: payload.stack,
        });
        return;
      }

      setResult(payload);

      void refreshStatus();
      void fetchSourceStatuses()
        .then(setSources)
        .catch(() => undefined);
    } catch (runError) {
      setError({
        message:
          runError instanceof Error ? runError.message : "Ingestion failed",
      });
    } finally {
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopBar title="Data Ingestion" showAddReport={false} />

      <div className={`app-page-content ${pageContainer}`}>
        <SectionCard
          title="Ingestion Sources"
          description={
            sources.length > 0
              ? `Multi-source fallback: ${sources.map((item) => item.name).join(" → ")}. Automatic retry with exponential backoff and source health monitoring.`
              : "Configured operational sources appear here. Automatic retry with exponential backoff and source health monitoring."
          }
        >
          {sourcesLoading ? (
            <p className="text-sm text-slate-500">Loading source status…</p>
          ) : (
            <SourceStatusGrid sources={sources} />
          )}
        </SectionCard>

        {sourceStats && (
          <SourceStatisticsPanel statistics={sourceStats} />
        )}

        <SectionCard
          title="Crisis Data Ingestion"
          description="Fetch humanitarian reports, analyse with AI when configured, and persist through the existing Report → Analysis → Dashboard → Crisis Map pipeline."
        >
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <button
              type="button"
              onClick={() => void handleSyncNow()}
              disabled={isRunning || isSyncing}
              className={`${btnPrimary} gap-2 text-base`}
            >
              {isRunning || isSyncing || syncStatus.isRunning
                ? syncStatus.phaseMessage || "Syncing…"
                : "🔄 Sync Now"}
            </button>
            <p className="text-sm text-slate-400">
              Immediately fetch all enabled sources, skip duplicates, run the AI
              pipeline, and refresh Dashboard, Map, Alerts, Analysis, and
              Statistics.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Source</label>
              <select
                className={selectDark}
                value={source}
                disabled={isRunning || sourcesLoading}
                onChange={(event) =>
                  setSource(event.target.value as IngestionSource)
                }
              >
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-slate-500">
                Keyword / Category
              </label>
              <select
                className={selectDark}
                value={keyword}
                disabled={isRunning}
                onChange={(event) =>
                  setKeyword(event.target.value as IngestionKeyword)
                }
              >
                {KEYWORD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={isRunning}
              className={btnPrimary}
            >
              {isRunning ? "Running Ingestion…" : "Run Ingestion"}
            </button>
            <p className="text-xs text-slate-500">
              Maximum 10 reports per run. GDELT allows one query every 6 seconds.
              Rule-based analysis is used when AI is unavailable.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="Manual Import (Guaranteed Fallback)"
          description="Always available when automated sources fail. Paste a report below to include it in this run, or use the full report form for detailed source metadata."
        >
          <label className="mb-4 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={includeManual}
              onChange={(event) => setIncludeManual(event.target.checked)}
              disabled={isRunning}
              className="rounded border-white/20"
            />
            Include manual report in this ingestion run
          </label>

          {includeManual && (
            <div className="grid gap-4">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Title</label>
                <input
                  type="text"
                  className={inputDark}
                  value={manualTitle}
                  disabled={isRunning}
                  onChange={(event) => setManualTitle(event.target.value)}
                  placeholder="Flooding displaces thousands in Khartoum"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Content</label>
                <textarea
                  className={`${inputDark} min-h-32`}
                  value={manualContent}
                  disabled={isRunning}
                  onChange={(event) => setManualContent(event.target.value)}
                  placeholder="Paste report text, field notes, or bulletin content…"
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <Link href="/reports" className={btnGhost}>
              Open full manual report form
            </Link>
          </div>
        </SectionCard>

        {error && (
          <div className={alertError}>
            <p className="font-medium text-red-200">{error.message}</p>
            {error.errorType && (
              <p className="mt-1 text-xs text-red-300/80">
                Type: {error.errorType}
                {error.status ? ` · HTTP ${error.status}` : ""}
              </p>
            )}
            {error.status === 429 && (
              <p className="mt-2 text-sm text-red-200/90">
                GDELT is rate limited. Run again with multi-source fallback, add
                optional API keys, or use manual import below.
              </p>
            )}
            {error.stack && (
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-red-100/90">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        {result && (
          <SectionCard title="Ingestion Summary" description="">
            {result.syncSummary && (
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryStat label="Sources Run" value={result.syncSummary.totalSources} />
                <SummaryStat label="Successful" value={result.syncSummary.successfulSources} />
                <SummaryStat label="Failed" value={result.syncSummary.failedSources} />
                <SummaryStat
                  label="Duration (ms)"
                  value={result.syncSummary.durationMs}
                />
                <SummaryStat
                  label="Duplicates Removed"
                  value={result.syncSummary.duplicatesRemoved}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryStat label="Fetched" value={result.fetchedCount} />
              <SummaryStat label="Analysed" value={result.analysedCount} />
              <SummaryStat label="Saved" value={result.savedCount} />
              <SummaryStat label="Skipped" value={result.skippedCount} />
              <SummaryStat
                label="Dup. skipped"
                value={result.failedDuplicateCount ?? 0}
              />
              <SummaryStat
                label="Loc. verified"
                value={result.locationVerifiedCount ?? 0}
              />
              <SummaryStat
                label="Loc. approx."
                value={result.locationApproximateCount ?? 0}
              />
              <SummaryStat
                label="Loc. pending"
                value={result.locationPendingCount ?? 0}
              />
              <SummaryStat
                label="Coord errors"
                value={result.failedMissingCoordsCount ?? 0}
              />
              <SummaryStat
                label="DB errors"
                value={result.failedDbErrorCount ?? 0}
              />
              <SummaryStat
                label="AI JSON errors"
                value={result.failedAiInvalidJsonCount ?? 0}
              />
              <SummaryStat label="Other errors" value={result.errors.length} />
            </div>

            <SourceSummaryTable summaries={result.sourceSummaries ?? []} />

            {result.manualImportSuggested && (
              <div className={`${alertInfo} mt-4`}>
                All automated sources returned no articles. Use manual import
                above or the{" "}
                <Link href="/reports" className="underline">
                  report form
                </Link>{" "}
                to add crisis data — it always flows through the same analysis
                pipeline.
              </div>
            )}

            {result.reportIds.length > 0 && (
              <div className={`${alertInfo} mt-4`}>
                {result.savedCount} report(s) saved successfully.
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/analysis" className={btnGhost}>
                View Analysis
              </Link>
              <Link href="/dashboard" className={btnGhost}>
                Open Dashboard
              </Link>
              <Link href="/crisis-map" className={btnGhost}>
                Open Crisis Map
              </Link>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-red-300">Errors</p>
                <ul className="space-y-2 text-sm text-slate-300">
                  {result.errors.map((item) => (
                    <li
                      key={`${item.title}-${item.message}`}
                      className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
                    >
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="text-slate-400">{item.message}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
