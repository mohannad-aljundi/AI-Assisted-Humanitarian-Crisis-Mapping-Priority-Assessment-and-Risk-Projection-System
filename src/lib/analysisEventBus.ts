export type AnalysisLiveEventType =
  | "queue_snapshot"
  | "analysis_started"
  | "analysis_completed"
  | "analysis_failed";

export interface CompletedAnalysisCard {
  id: string;
  incidentLabel: string;
  originalTitle: string;
  crisisType: string | null;
  priorityLevel: "Critical" | "High" | "Medium" | "Low";
  reliabilityPercent: number;
  completedAt: string;
}

export interface ProcessingQueueSnapshot {
  completed: number;
  analysing: number;
  waiting: number;
  failed: number;
  completedToday: number;
  progressPercent: number;
  waveCompleted: number;
  waveTotal: number;
  latestCompletedId: string | null;
  active: boolean;
  /** Rolling average analysis duration in seconds. */
  averageAnalysisSeconds: number | null;
}

export type AnalysisLiveEvent =
  | { type: "queue_snapshot"; queue: ProcessingQueueSnapshot; at: string }
  | {
      type: "analysis_started";
      reportId: string;
      queue: ProcessingQueueSnapshot;
      at: string;
    }
  | {
      type: "analysis_completed";
      report: CompletedAnalysisCard;
      queue: ProcessingQueueSnapshot;
      at: string;
    }
  | {
      type: "analysis_failed";
      reportId: string;
      error?: string;
      queue: ProcessingQueueSnapshot;
      at: string;
    };

type Listener = (event: AnalysisLiveEvent) => void;

const listeners = new Set<Listener>();

/** Wave baseline so progress reflects the current processing batch, not all-time ready reports. */
let waveBaselineReady = 0;
let waveActive = false;
const recentDurationsMs: number[] = [];
const MAX_DURATION_SAMPLES = 20;

export function recordAnalysisDurationMs(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  recentDurationsMs.push(durationMs);
  if (recentDurationsMs.length > MAX_DURATION_SAMPLES) {
    recentDurationsMs.shift();
  }
}

export function getAverageAnalysisSeconds(): number | null {
  if (recentDurationsMs.length === 0) return null;
  const total = recentDurationsMs.reduce((sum, value) => sum + value, 0);
  return Math.round((total / recentDurationsMs.length / 1000) * 10) / 10;
}

export function beginProcessingWave(currentReadyCount: number): void {
  if (!waveActive) {
    waveBaselineReady = currentReadyCount;
    waveActive = true;
  }
}

export function endProcessingWaveIfIdle(snapshot: ProcessingQueueSnapshot): void {
  if (snapshot.analysing === 0 && snapshot.waiting === 0) {
    waveActive = false;
  }
}

export function getWaveBaselineReady(): number {
  return waveBaselineReady;
}

export function isProcessingWaveActive(): boolean {
  return waveActive;
}

export function publishAnalysisEvent(event: AnalysisLiveEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn("[AnalysisEventBus] Listener error:", error);
    }
  }
}

export function subscribeAnalysisEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAnalysisEventListenerCount(): number {
  return listeners.size;
}
