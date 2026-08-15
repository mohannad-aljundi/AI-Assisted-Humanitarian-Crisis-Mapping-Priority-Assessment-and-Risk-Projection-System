import type { DashboardPanelsData, MapPageData } from "@/types";
import { createCancellableRequest, swallowAbortError } from "@/lib/cancellableFetch";
import { logClientPerf } from "@/lib/perfTrace";

const REFRESH_DEBOUNCE_MS = 500;

type PanelsListener = (panels: DashboardPanelsData | null, error: boolean) => void;
type MapListener = (map: MapPageData | null, error: boolean) => void;

interface RefreshCycleState {
  panels: DashboardPanelsData | null;
  map: MapPageData | null;
  panelsError: boolean;
  mapError: boolean;
  panelsLoading: boolean;
  mapLoading: boolean;
}

let cycleState: RefreshCycleState = {
  panels: null,
  map: null,
  panelsError: false,
  mapError: false,
  panelsLoading: false,
  mapLoading: false,
};

let panelsInflight: Promise<DashboardPanelsData | null> | null = null;
let mapInflight: Promise<MapPageData | null> | null = null;
let panelsRequest: ReturnType<typeof createCancellableRequest> | null = null;
let mapRequest: ReturnType<typeof createCancellableRequest> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let subscriberCount = 0;

const panelsListeners = new Set<PanelsListener>();
const mapListeners = new Set<MapListener>();
const stateListeners = new Set<(state: RefreshCycleState) => void>();

function emitState() {
  for (const listener of stateListeners) {
    listener(cycleState);
  }
}

function setState(patch: Partial<RefreshCycleState>) {
  cycleState = { ...cycleState, ...patch };
  emitState();
}

async function fetchPanels(reason: string, bypassCache: boolean): Promise<DashboardPanelsData | null> {
  if (panelsInflight) return panelsInflight;

  panelsRequest?.abort();
  panelsRequest = createCancellableRequest();
  const request = panelsRequest;
  const started = performance.now();
  const url = bypassCache ? "/api/dashboard/panels?refresh=1" : "/api/dashboard/panels";

  setState({ panelsLoading: true, panelsError: false });
  logClientPerf("fetch:start", { url, reason, scope: "dashboard-panels" });

  panelsInflight = (async () => {
    try {
      const res = await request.fetch(url);
      if (!res.ok) throw new Error("panels load failed");
      const data = (await res.json()) as DashboardPanelsData;
      if (request.signal.aborted) return null;
      setState({ panels: data, panelsError: false });
      for (const listener of panelsListeners) listener(data, false);
      logClientPerf("fetch:complete", {
        url,
        reason,
        scope: "dashboard-panels",
        ms: Math.round(performance.now() - started),
      });
      return data;
    } catch (error) {
      if (swallowAbortError(error, request.signal)) return null;
      setState({ panelsError: true });
      for (const listener of panelsListeners) listener(null, true);
      return null;
    } finally {
      setState({ panelsLoading: false });
      panelsInflight = null;
    }
  })();

  return panelsInflight;
}

async function fetchMap(reason: string, bypassCache: boolean): Promise<MapPageData | null> {
  if (mapInflight) return mapInflight;

  mapRequest?.abort();
  mapRequest = createCancellableRequest();
  const request = mapRequest;
  const started = performance.now();
  const url = bypassCache
    ? "/api/map/summary?readOnly=true&refresh=1"
    : "/api/map/summary?readOnly=true";

  setState({ mapLoading: true, mapError: false });
  logClientPerf("fetch:start", { url, reason, scope: "dashboard-map" });

  mapInflight = (async () => {
    try {
      const res = await request.fetch(url);
      if (!res.ok) throw new Error("map load failed");
      const data = (await res.json()) as MapPageData;
      if (request.signal.aborted) return null;
      setState({ map: data, mapError: false });
      for (const listener of mapListeners) listener(data, false);
      logClientPerf("fetch:complete", {
        url,
        reason,
        scope: "dashboard-map",
        ms: Math.round(performance.now() - started),
      });
      return data;
    } catch (error) {
      if (swallowAbortError(error, request.signal)) return null;
      setState({ mapError: true });
      for (const listener of mapListeners) listener(null, true);
      return null;
    } finally {
      setState({ mapLoading: false });
      mapInflight = null;
    }
  })();

  return mapInflight;
}

export async function runDashboardRefreshCycle(
  reason: string,
  options?: { bypassCache?: boolean }
): Promise<void> {
  const bypassCache = options?.bypassCache ?? reason !== "mount";
  await Promise.all([fetchPanels(reason, bypassCache), fetchMap(reason, bypassCache)]);
}

export function scheduleDashboardRefresh(
  reason: string,
  options?: { bypassCache?: boolean }
): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runDashboardRefreshCycle(reason, options);
  }, REFRESH_DEBOUNCE_MS);
}

export function subscribeDashboardLive(
  listener: (state: RefreshCycleState) => void
): () => void {
  subscriberCount += 1;
  stateListeners.add(listener);
  listener(cycleState);

  if ((!cycleState.panels || !cycleState.map) && !panelsInflight && !mapInflight) {
    void runDashboardRefreshCycle("mount", { bypassCache: false });
  }

  return () => {
    stateListeners.delete(listener);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0) {
      panelsRequest?.abort();
      mapRequest?.abort();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    }
  };
}

export function getDashboardLiveState(): RefreshCycleState {
  return cycleState;
}

export type { RefreshCycleState as DashboardLiveState };
