"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DashboardAlert } from "@/types";
import { ANALYSIS_COMPLETED_EVENT } from "@/contexts/AnalysisLiveContext";
import { SYNC_DATA_REFRESH_EVENT } from "@/contexts/SyncMonitoringContext";
import {
  getDashboardLiveState,
  scheduleDashboardRefresh,
  subscribeDashboardLive,
  type DashboardLiveState,
} from "@/lib/dashboardClientFetch";

interface DashboardLiveContextValue extends DashboardLiveState {
  recentAlerts: DashboardAlert[];
}

const DashboardLiveContext = createContext<DashboardLiveContextValue | null>(null);

export function DashboardLiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashboardLiveState>(() => getDashboardLiveState());

  useEffect(() => {
    return subscribeDashboardLive(setState);
  }, []);

  useEffect(() => {
    const onAnalysisCompleted = () => {
      scheduleDashboardRefresh("analysis_completed", { bypassCache: true });
    };

    const onSyncRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ savedCount?: number }>).detail;
      if ((detail?.savedCount ?? 0) > 0) {
        scheduleDashboardRefresh("sync_refresh", { bypassCache: true });
      }
    };

    window.addEventListener(ANALYSIS_COMPLETED_EVENT, onAnalysisCompleted);
    window.addEventListener(SYNC_DATA_REFRESH_EVENT, onSyncRefresh);
    return () => {
      window.removeEventListener(ANALYSIS_COMPLETED_EVENT, onAnalysisCompleted);
      window.removeEventListener(SYNC_DATA_REFRESH_EVENT, onSyncRefresh);
    };
  }, []);

  const value = useMemo<DashboardLiveContextValue>(
    () => ({
      ...state,
      recentAlerts: state.panels?.recentAlerts ?? [],
    }),
    [state]
  );

  return (
    <DashboardLiveContext.Provider value={value}>{children}</DashboardLiveContext.Provider>
  );
}

export function useDashboardLive(): DashboardLiveContextValue {
  const ctx = useContext(DashboardLiveContext);
  if (!ctx) {
    throw new Error("useDashboardLive must be used within DashboardLiveProvider");
  }
  return ctx;
}
