export interface PerfContext {
  route: string;
  cacheHit?: boolean;
  itemCount?: number;
  payloadBytes?: number;
}

function isPerfLoggingEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.DEBUG_PERF === "true"
  );
}

export function logPerfRouteLoaded(route: string, extra?: Record<string, unknown>): void {
  if (!isPerfLoggingEnabled()) return;
  console.info("[PERF] route loaded", { route, ...extra });
}

export function logPerfDbRead(route: string, durationMs: number, queryHint?: string): void {
  if (!isPerfLoggingEnabled()) return;
  console.info("[PERF] db read time", { route, durationMs, queryHint });
}

export function logPerfRenderDataSize(
  route: string,
  itemCount: number,
  payloadBytes?: number
): void {
  if (!isPerfLoggingEnabled()) return;
  console.info("[PERF] render data size", { route, itemCount, payloadBytes });
}

export function logPerfCache(route: string, hit: boolean): void {
  if (!isPerfLoggingEnabled()) return;
  console.info("[PERF] cache hit/miss", { route, hit: hit ? "hit" : "miss" });
}

export async function withPerfTiming<T>(
  route: string,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    logPerfDbRead(route, Math.round(performance.now() - start), label);
  }
}
