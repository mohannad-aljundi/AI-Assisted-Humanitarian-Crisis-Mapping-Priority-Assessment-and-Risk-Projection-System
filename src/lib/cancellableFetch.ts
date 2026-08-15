export interface CancellableRequest {
  signal: AbortSignal;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  abort: () => void;
}

export function createCancellableRequest(): CancellableRequest {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: controller.signal,
      }),
  };
}

/** True when a fetch was cancelled via AbortController (including custom abort reasons). */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

export function swallowAbortError(error: unknown, signal?: AbortSignal): boolean {
  return isAbortError(error, signal);
}
