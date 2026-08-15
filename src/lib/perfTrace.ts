type PerfStageStatus = "start" | "end" | "skip" | "error";

export interface PerfStageEvent {
  traceId: string;
  stage: string;
  status: PerfStageStatus;
  route?: string;
  reportId?: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

const traces = new Map<string, number>();
let traceCounter = 0;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function createPerfTrace(route: string, reportId?: string): string {
  const traceId = `${route}#${++traceCounter}-${Date.now().toString(36)}`;
  traces.set(traceId, nowMs());
  emit({
    traceId,
    stage: "trace:start",
    status: "start",
    route,
    reportId,
  });
  return traceId;
}

export function perfStage(
  traceId: string,
  stage: string,
  detail?: Record<string, unknown>
): void {
  emit({
    traceId,
    stage,
    status: "start",
    detail,
  });
}

export function perfStageEnd(
  traceId: string,
  stage: string,
  detail?: Record<string, unknown>
): void {
  const started = traces.get(`${traceId}:${stage}`);
  const durationMs =
    started !== undefined ? Math.round(nowMs() - started) : undefined;
  emit({
    traceId,
    stage,
    status: "end",
    durationMs,
    detail,
  });
}

export function perfStageTimed<T>(
  traceId: string,
  stage: string,
  fn: () => Promise<T> | T,
  detail?: Record<string, unknown>
): Promise<T> {
  const key = `${traceId}:${stage}`;
  traces.set(key, nowMs());
  perfStage(traceId, stage, detail);

  const finish = (extra?: Record<string, unknown>) => {
    perfStageEnd(traceId, stage, { ...detail, ...extra });
  };

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        (value) => {
          finish();
          return value;
        },
        (error) => {
          emit({
            traceId,
            stage,
            status: "error",
            durationMs: Math.round(nowMs() - (traces.get(key) ?? nowMs())),
            detail: {
              ...detail,
              message: error instanceof Error ? error.message : "unknown",
            },
          });
          throw error;
        }
      );
    }
    finish();
    return Promise.resolve(result);
  } catch (error) {
    emit({
      traceId,
      stage,
      status: "error",
      durationMs: Math.round(nowMs() - (traces.get(key) ?? nowMs())),
      detail: {
        ...detail,
        message: error instanceof Error ? error.message : "unknown",
      },
    });
    throw error;
  }
}

export function endPerfTrace(
  traceId: string,
  route: string,
  detail?: Record<string, unknown>
): void {
  const started = traces.get(traceId);
  const durationMs =
    started !== undefined ? Math.round(nowMs() - started) : undefined;
  emit({
    traceId,
    stage: "trace:end",
    status: "end",
    route,
    durationMs,
    detail,
  });
  traces.delete(traceId);
}

export function logClientPerf(
  event: string,
  detail?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  console.log("[PERF:client]", { event, ...detail, at: new Date().toISOString() });
}

function emit(event: PerfStageEvent): void {
  const payload = {
    ...event,
    at: new Date().toISOString(),
  };
  console.log("[PERF:stage]", payload);
}
