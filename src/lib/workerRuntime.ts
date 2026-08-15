/** Hard cap per background job (REPORT_ANALYSIS, MASTER_INTELLIGENCE, etc.). */
export const JOB_TIMEOUT_MS = 60_000;

export function isDedicatedWorkerProcess(): boolean {
  return process.env.WORKER_PROCESS === "true";
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function isMasterIntelligenceDisabledDuringDemo(): boolean {
  return (
    isDemoMode() &&
    process.env.DISABLE_MASTER_INTELLIGENCE_DURING_DEMO !== "false"
  );
}

/**
 * Background jobs run in the dedicated worker process by default.
 * DEMO_MODE or ALLOW_IN_PROCESS_WORKER enable an in-process loop for single-process setups.
 */
export function shouldRunBackgroundWorker(): boolean {
  if (isDedicatedWorkerProcess()) return true;
  if (isDemoMode()) return true;
  return process.env.ALLOW_IN_PROCESS_WORKER === "true";
}

export function getWorkerConcurrency(): number {
  const fallback = isDemoMode() ? 1 : 2;
  const raw = Number(process.env.WORKER_CONCURRENCY ?? fallback);
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(Math.floor(raw), 4);
}

export function getWorkerRuntimeSummary(): {
  dedicatedWorker: boolean;
  demoMode: boolean;
  inProcessWorker: boolean;
  concurrency: number;
  jobTimeoutMs: number;
  masterIntelligenceDisabled: boolean;
} {
  return {
    dedicatedWorker: isDedicatedWorkerProcess(),
    demoMode: isDemoMode(),
    inProcessWorker: shouldRunBackgroundWorker() && !isDedicatedWorkerProcess(),
    concurrency: getWorkerConcurrency(),
    jobTimeoutMs: JOB_TIMEOUT_MS,
    masterIntelligenceDisabled: isMasterIntelligenceDisabledDuringDemo(),
  };
}
