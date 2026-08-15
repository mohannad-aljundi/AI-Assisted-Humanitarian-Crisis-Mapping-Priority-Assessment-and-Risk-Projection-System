"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { IngestionRunResult, SyncStatusSnapshot } from "@/types";

export const SYNC_DATA_REFRESH_EVENT = "humanitarian-sync-refresh";

const POLL_IDLE_MS = 60_000;
const POLL_ACTIVE_MS = 8_000;
const POLL_BACKGROUND_MS = 5_000;

function isHeavyDetailRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/incidents/") ||
    pathname.startsWith("/analysis/") ||
    pathname === "/evaluation" ||
    pathname === "/dashboard" ||
    pathname === "/alerts" ||
    pathname === "/analysis"
  );
}

function shouldRefreshAfterSync(pathname: string, savedCount: number): boolean {
  if (savedCount <= 0) return false;
  return (
    pathname === "/dashboard" ||
    pathname === "/crisis-map" ||
    pathname === "/alerts" ||
    pathname === "/ingestion"
  );
}

const DEFAULT_STATUS: SyncStatusSnapshot = {
  autoSyncEnabled: true,
  syncIntervalMinutes: 15,
  maxReportsPerSync: 10,
  enabledProviders: [],
  phase: "idle",
  phaseMessage: "Standing by",
  isRunning: false,
  backgroundProcessing: {
    queue: {
      completed: 0,
      analysing: 0,
      waiting: 0,
      failed: 0,
      completedToday: 0,
      progressPercent: 0,
      waveCompleted: 0,
      waveTotal: 0,
      latestCompletedId: null,
      active: false,
      averageAnalysisSeconds: null,
    },
  },
  lastSyncStartedAt: null,
  lastSyncCompletedAt: null,
  lastSuccessfulSyncAt: null,
  nextScheduledSyncAt: null,
  lastFetchedCount: 0,
  lastAnalysedCount: 0,
  lastSavedCount: 0,
  lastSkippedCount: 0,
  lastUsedSources: [],
  lastError: null,
  lastSyncAt: null,
  lastCompletedAt: null,
  nextSyncAt: null,
  newIncidentsCount: 0,
  warnings: [],
};

interface SyncContextValue {
  status: SyncStatusSnapshot;
  syncNow: (manualArticles?: Parameters<typeof fetchSyncRun>[0]) => Promise<IngestionRunResult | null>;
  acknowledgeNewIncidents: () => void;
  refreshStatus: () => Promise<void>;
  isRefreshing: boolean;
}

const SyncContext = createContext<SyncContextValue | null>(null);

async function fetchStatus(): Promise<SyncStatusSnapshot> {
  const response = await fetch("/api/ingestion/sync/status", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to load sync status");
  }
  return (await response.json()) as SyncStatusSnapshot;
}

async function fetchSyncRun(body?: {
  manualArticles?: Array<{
    title: string;
    content: string;
    reportDate?: string;
    sourceName?: string;
    sourceUrl?: string;
  }>;
}): Promise<{ result: IngestionRunResult; status: SyncStatusSnapshot }> {
  const response = await fetch("/api/ingestion/sync/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const payload = (await response.json()) as {
    result?: IngestionRunResult;
    status?: SyncStatusSnapshot;
    error?: string;
  };

  if (!response.ok) {
    if (payload.status) {
      throw Object.assign(new Error(payload.error ?? "Sync failed"), {
        status: payload.status,
      });
    }
    throw new Error(payload.error ?? "Sync failed");
  }

  return {
    result: payload.result!,
    status: payload.status ?? DEFAULT_STATUS,
  };
}

function dispatchDataRefresh(savedCount: number) {
  window.dispatchEvent(
    new CustomEvent(SYNC_DATA_REFRESH_EVENT, { detail: { savedCount } })
  );
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<SyncStatusSnapshot>(DEFAULT_STATUS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const statusRef = useRef(status);
  const syncInFlightRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  statusRef.current = status;

  const refreshAllViews = useCallback(
    (savedCount: number) => {
      if (shouldRefreshAfterSync(pathname, savedCount)) {
        router.refresh();
      }
      dispatchDataRefresh(savedCount);
    },
    [pathname, router]
  );

  const pollStatus = useCallback(async () => {
    try {
      const next = await fetchStatus();
      setStatus(next);
    } catch {
      // Keep previous status on poll failure
    }
  }, []);

  const syncNow = useCallback(
    async (manualArticles?: {
      manualArticles?: Array<{
        title: string;
        content: string;
        reportDate?: string;
        sourceName?: string;
        sourceUrl?: string;
      }>;
    }) => {
      if (syncInFlightRef.current) return null;

      syncInFlightRef.current = true;
      setIsRefreshing(true);

      try {
        const { result, status: nextStatus } = await fetchSyncRun(manualArticles);
        setStatus(nextStatus);
        refreshAllViews(result.savedCount);
        if ((result.queuedCount ?? 0) > 0) {
          void pollStatus();
        }
        return result;
      } catch (error) {
        const err = error as Error & { status?: SyncStatusSnapshot };
        if (err.status) {
          setStatus(err.status);
        } else {
          await pollStatus();
        }
        return null;
      } finally {
        syncInFlightRef.current = false;
        setIsRefreshing(false);
      }
    },
    [pollStatus, refreshAllViews]
  );

  const acknowledgeNewIncidents = useCallback(() => {
    setStatus((prev) => ({ ...prev, newIncidentsCount: 0 }));
    void fetch("/api/ingestion/sync/acknowledge", { method: "POST" }).catch(
      () => undefined
    );
  }, []);

  const scheduleAutoSync = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    const current = statusRef.current;
    if (!current.autoSyncEnabled || current.isRunning) return;

    const scheduledAt = current.nextScheduledSyncAt ?? current.nextSyncAt;
    const nextAt = scheduledAt
      ? new Date(scheduledAt).getTime()
      : Date.now() + current.syncIntervalMinutes * 60_000;

    const delay = Math.max(nextAt - Date.now(), 5_000);

    autoTimerRef.current = setTimeout(() => {
      void syncNow().then(() => pollStatus());
    }, delay);
  }, [pollStatus, syncNow]);

  useEffect(() => {
    void pollStatus();

    const intervalMs = statusRef.current.isRunning
      ? statusRef.current.backgroundProcessing?.queue.active
        ? POLL_BACKGROUND_MS
        : POLL_ACTIVE_MS
      : statusRef.current.backgroundProcessing?.queue.active
        ? POLL_BACKGROUND_MS
        : isHeavyDetailRoute(pathname)
          ? POLL_BACKGROUND_MS
          : POLL_IDLE_MS;

    const pollTimer = setInterval(() => {
      if (document.hidden) return;
      void pollStatus();
    }, intervalMs);

    const onVisibility = () => {
      if (!document.hidden) {
        void pollStatus();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onAnalysisCompleted = () => {
      void pollStatus();
    };
    window.addEventListener("humanitarian-analysis-completed", onAnalysisCompleted);

    return () => {
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("humanitarian-analysis-completed", onAnalysisCompleted);
    };
  }, [pollStatus, pathname, status.isRunning, status.backgroundProcessing?.queue.active]);

  useEffect(() => {
    scheduleAutoSync();
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [
    scheduleAutoSync,
    status.autoSyncEnabled,
    status.syncIntervalMinutes,
    status.nextScheduledSyncAt,
    status.nextSyncAt,
    status.isRunning,
    status.lastSuccessfulSyncAt,
    status.lastSyncCompletedAt,
  ]);

  const value = useMemo(
    () => ({
      status,
      syncNow,
      acknowledgeNewIncidents,
      refreshStatus: pollStatus,
      isRefreshing,
    }),
    [status, syncNow, acknowledgeNewIncidents, pollStatus, isRefreshing]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncMonitoring(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSyncMonitoring must be used within SyncProvider");
  }
  return ctx;
}

export function useSyncMonitoringOptional(): SyncContextValue | null {
  return useContext(SyncContext);
}
