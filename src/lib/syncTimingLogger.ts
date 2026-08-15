export interface SyncTimingBreakdown {
  fetchMs: number;
  saveMs: number;
  enqueueMs: number;
  totalMs: number;
  aiAnalysisMs?: number;
  correlationMs?: number;
  masterIncidentMs?: number;
  chleMs?: number;
}

export function logSyncTiming(label: string, timing: SyncTimingBreakdown): void {
  const parts = [
    `fetch=${timing.fetchMs}ms`,
    `save=${timing.saveMs}ms`,
    `enqueue=${timing.enqueueMs}ms`,
    `total=${timing.totalMs}ms`,
  ];

  if (timing.aiAnalysisMs != null) parts.push(`ai=${timing.aiAnalysisMs}ms`);
  if (timing.correlationMs != null) parts.push(`correlation=${timing.correlationMs}ms`);
  if (timing.masterIncidentMs != null) parts.push(`master=${timing.masterIncidentMs}ms`);
  if (timing.chleMs != null) parts.push(`chle=${timing.chleMs}ms`);

  console.info(`[SYNC-TIMING] ${label}: ${parts.join(", ")}`);

  if (timing.aiAnalysisMs != null) {
    console.info(
      `[SYNC-TIMING] ai=${timing.aiAnalysisMs}ms total=${timing.totalMs}ms`
    );
  }
}

export function createSyncTiming(): SyncTimingBreakdown {
  return {
    fetchMs: 0,
    saveMs: 0,
    enqueueMs: 0,
    totalMs: 0,
  };
}
