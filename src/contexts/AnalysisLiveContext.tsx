"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  AnalysisLiveEvent,
  CompletedAnalysisCard,
  ProcessingQueueSnapshot,
} from "@/lib/analysisEventBus";
import { SYNC_DATA_REFRESH_EVENT } from "@/contexts/SyncMonitoringContext";

export const ANALYSIS_COMPLETED_EVENT = "humanitarian-analysis-completed";
export const ANALYSIS_QUEUE_EVENT = "humanitarian-analysis-queue";

const PIN_MS = 15_000;
const MAX_RECENT = 10;
const MAX_TOASTS = 3;
const TOAST_MS = 5_000;

export type LiveStatusFilter = "all" | "analysing" | "waiting" | "completed_just_now";

export interface AnalysisToast {
  id: string;
  reportId: string;
  incidentLabel: string;
  priorityLevel: CompletedAnalysisCard["priorityLevel"];
  reliabilityPercent: number;
  createdAt: number;
}

interface AnalysisLiveContextValue {
  recentCompleted: CompletedAnalysisCard[];
  queue: ProcessingQueueSnapshot | null;
  pinnedReportId: string | null;
  toasts: AnalysisToast[];
  statusFilter: LiveStatusFilter;
  setStatusFilter: (filter: LiveStatusFilter) => void;
  dismissToast: (id: string) => void;
  connected: boolean;
  latestCompletedId: string | null;
}

const DEFAULT_QUEUE: ProcessingQueueSnapshot = {
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
};

const AnalysisLiveContext = createContext<AnalysisLiveContextValue | null>(null);

function dispatchBrowserEvents(
  event: AnalysisLiveEvent,
  routerRefresh: () => void,
  pathname: string
) {
  if (event.type === "analysis_completed") {
    window.dispatchEvent(
      new CustomEvent(ANALYSIS_COMPLETED_EVENT, { detail: event.report })
    );
    window.dispatchEvent(
      new CustomEvent(SYNC_DATA_REFRESH_EVENT, {
        detail: { savedCount: 1, reportId: event.report.id },
      })
    );

    if (
      pathname === "/dashboard" ||
      pathname === "/crisis-map" ||
      pathname === "/alerts" ||
      pathname === "/evaluation" ||
      pathname === "/analysis"
    ) {
      routerRefresh();
    }

    if (pathname.startsWith(`/incidents/${event.report.id}`)) {
      routerRefresh();
    }
  }

  if (event.type === "queue_snapshot" || event.type === "analysis_started") {
    window.dispatchEvent(
      new CustomEvent(ANALYSIS_QUEUE_EVENT, { detail: event.queue })
    );
  }

  if (event.type === "analysis_failed") {
    window.dispatchEvent(
      new CustomEvent(ANALYSIS_QUEUE_EVENT, { detail: event.queue })
    );
  }

  if (event.type === "analysis_completed") {
    window.dispatchEvent(
      new CustomEvent(ANALYSIS_QUEUE_EVENT, { detail: event.queue })
    );
  }
}

export function AnalysisLiveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [recentCompleted, setRecentCompleted] = useState<CompletedAnalysisCard[]>([]);
  const [queue, setQueue] = useState<ProcessingQueueSnapshot | null>(null);
  const [pinnedReportId, setPinnedReportId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<AnalysisToast[]>([]);
  const [statusFilter, setStatusFilter] = useState<LiveStatusFilter>("all");
  const [connected, setConnected] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const pinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialHydratedRef = useRef(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const handleCompleted = useCallback(
    (report: CompletedAnalysisCard, queueSnapshot: ProcessingQueueSnapshot) => {
      const isLive = initialHydratedRef.current && !seenIdsRef.current.has(report.id);
      seenIdsRef.current.add(report.id);

      setRecentCompleted((prev) => {
        const without = prev.filter((item) => item.id !== report.id);
        return [report, ...without].slice(0, MAX_RECENT);
      });

      if (isLive) {
        setPinnedReportId(report.id);
        if (pinTimerRef.current) clearTimeout(pinTimerRef.current);
        pinTimerRef.current = setTimeout(() => {
          setPinnedReportId((current) => (current === report.id ? null : current));
        }, PIN_MS);

        const toastId = `${report.id}-${Date.now()}`;
        setToasts((prev) =>
          [
            {
              id: toastId,
              reportId: report.id,
              incidentLabel: report.incidentLabel,
              priorityLevel: report.priorityLevel,
              reliabilityPercent: report.reliabilityPercent,
              createdAt: Date.now(),
            },
            ...prev,
          ].slice(0, MAX_TOASTS)
        );
        window.setTimeout(() => dismissToast(toastId), TOAST_MS);
        dispatchBrowserEvents(
          {
            type: "analysis_completed",
            report,
            queue: queueSnapshot,
            at: report.completedAt,
          },
          () => router.refresh(),
          pathnameRef.current
        );
      }
    },
    [dismissToast, router]
  );

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const hydrateQueue = async () => {
      try {
        const response = await fetch("/api/analysis/queue", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as ProcessingQueueSnapshot;
        if (cancelled) return;
        setQueue(payload);
      } catch {
        // keep previous queue
      }
    };

    const hydrateRecent = async () => {
      try {
        const response = await fetch("/api/analysis/recent-completed", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          items: CompletedAnalysisCard[];
          queue: ProcessingQueueSnapshot | null;
        };
        if (cancelled) return;
        setRecentCompleted(payload.items.slice(0, MAX_RECENT));
        if (payload.queue) setQueue(payload.queue);
        for (const item of payload.items) {
          seenIdsRef.current.add(item.id);
        }
        initialHydratedRef.current = true;
      } catch {
        initialHydratedRef.current = true;
      }
    };

    const hydrateFromRest = async () => {
      await Promise.all([hydrateQueue(), hydrateRecent()]);
    };

    const connect = () => {
      if (cancelled) return;
      source = new EventSource("/api/analysis/events");

      source.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      source.onerror = () => {
        setConnected(false);
        source?.close();
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 3_000);
        }
      };

      const onMessage = (raw: MessageEvent<string>) => {
        try {
          const event = JSON.parse(raw.data) as AnalysisLiveEvent;
          if (event.type === "queue_snapshot") {
            setQueue(event.queue);
            dispatchBrowserEvents(event, () => router.refresh(), pathnameRef.current);
            return;
          }

          if (event.type === "analysis_started") {
            setQueue(event.queue);
            dispatchBrowserEvents(event, () => router.refresh(), pathnameRef.current);
            return;
          }

          if (event.type === "analysis_failed") {
            setQueue(event.queue);
            dispatchBrowserEvents(event, () => router.refresh(), pathnameRef.current);
            return;
          }

          if (event.type === "analysis_completed") {
            setQueue(event.queue);
            handleCompleted(event.report, event.queue);
          }
        } catch {
          // ignore malformed events
        }
      };

      source.addEventListener("queue_snapshot", onMessage);
      source.addEventListener("analysis_started", onMessage);
      source.addEventListener("analysis_completed", onMessage);
      source.addEventListener("analysis_failed", onMessage);
    };

    // Hydrate from REST first so dashboard has data before SSE connects
    void hydrateFromRest().finally(() => {
      if (!cancelled) {
        connect();
        pollTimer = setInterval(() => {
          if (cancelled || document.hidden) return;
          void hydrateQueue();
        }, 5_000);
      }
    });

    return () => {
      cancelled = true;
      setConnected(false);
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (pinTimerRef.current) clearTimeout(pinTimerRef.current);
    };
  }, [handleCompleted, router]);

  const value = useMemo<AnalysisLiveContextValue>(
    () => ({
      recentCompleted,
      queue: queue ?? DEFAULT_QUEUE,
      pinnedReportId,
      toasts,
      statusFilter,
      setStatusFilter,
      dismissToast,
      connected,
      latestCompletedId: queue?.latestCompletedId ?? recentCompleted[0]?.id ?? null,
    }),
    [
      recentCompleted,
      queue,
      pinnedReportId,
      toasts,
      statusFilter,
      dismissToast,
      connected,
    ]
  );

  return (
    <AnalysisLiveContext.Provider value={value}>{children}</AnalysisLiveContext.Provider>
  );
}

export function useAnalysisLive(): AnalysisLiveContextValue {
  const ctx = useContext(AnalysisLiveContext);
  if (!ctx) {
    throw new Error("useAnalysisLive must be used within AnalysisLiveProvider");
  }
  return ctx;
}

export function useAnalysisLiveOptional(): AnalysisLiveContextValue | null {
  return useContext(AnalysisLiveContext);
}
