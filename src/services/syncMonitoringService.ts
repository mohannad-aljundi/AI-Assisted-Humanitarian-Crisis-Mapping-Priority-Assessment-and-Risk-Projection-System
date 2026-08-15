import { invalidateCache } from "@/lib/simpleCache";
import {
  DEFAULT_SYNC_SETTINGS,
  loadSyncSettings,
  saveSyncSettings,
  type SyncSettings,
} from "@/lib/syncSettingsStore";
import { buildIngestionResultMessage } from "@/lib/ingestionResultMessage";
import { formatSyncWarning } from "@/lib/syncWarningFormatter";
import { ingestionSyncStateRepository } from "@/repositories/ingestionSyncStateRepository";
import type { IngestionSyncStateRecord } from "@/repositories/ingestionSyncStateRepository";
import { newsIngestionService } from "@/services/newsIngestionService";
import { requestWorkerStart } from "@/lib/workerLauncher";
import { formatQueueSummary } from "@/lib/queuePresentation";
import { queueSnapshotService } from "@/services/queueSnapshotService";
import type {
  BackgroundProcessingSnapshot,
  IngestionRunResult,
  ManualImportArticle,
  SyncPhase,
  SyncStatusSnapshot,
} from "@/types";

const PHASE_MESSAGES: Record<SyncPhase, string> = {
  idle: "Standing by",
  fetching: "Fetching reports…",
  importing: "Saving imported reports…",
  analyzing: "Analyzing with AI…",
  updating_database: "Updating database…",
  updating_map: "Updating map…",
  background_processing: "Processing intelligence in background…",
  completed: "Completed ✓",
  error: "Sync encountered errors",
};

class SyncMonitoringService {
  private phase: SyncPhase = "idle";
  private phaseMessage = PHASE_MESSAGES.idle;
  private newIncidentsCount = 0;
  private warnings: string[] = [];
  private runLock: Promise<void> = Promise.resolve();
  private lastImportStats: Pick<
    IngestionRunResult,
    | "previouslyAnalysedCount"
    | "newImportCount"
    | "requeuedCount"
    | "pendingAnalysisCount"
  > = {};

  private setPhase(phase: SyncPhase, message?: string) {
    this.phase = phase;
    this.phaseMessage = message ?? PHASE_MESSAGES[phase];
  }

  private computeNextScheduledSyncAt(
    settings: SyncSettings,
    baseIso: string | null
  ): Date | null {
    if (!settings.autoSyncEnabled) return null;
    const base = baseIso ? new Date(baseIso) : new Date();
    return new Date(base.getTime() + settings.syncIntervalMinutes * 60_000);
  }

  private async buildBackgroundSnapshot(): Promise<BackgroundProcessingSnapshot> {
    const queue = await queueSnapshotService.getSnapshot();
    return { queue };
  }

  private async buildSnapshot(
    settings: SyncSettings,
    persisted: IngestionSyncStateRecord
  ): Promise<SyncStatusSnapshot> {
    const backgroundProcessing = await this.buildBackgroundSnapshot();
    const syncRunning =
      this.phase === "fetching" ||
      this.phase === "importing" ||
      this.phase === "analyzing" ||
      this.phase === "updating_database" ||
      this.phase === "updating_map";
    const queueBusy =
      backgroundProcessing.queue.analysing > 0 ||
      backgroundProcessing.queue.waiting > 0;
    const isRunning =
      persisted.isRunning || syncRunning || backgroundProcessing.queue.analysing > 0;

    if (queueBusy && backgroundProcessing.queue.analysing > 0 && !syncRunning && this.phase !== "error") {
      this.phase = "background_processing";
      this.phaseMessage = formatQueueSummary(backgroundProcessing.queue);
    } else if (
      !syncRunning &&
      !queueBusy &&
      (this.phase === "background_processing" || this.phase === "completed")
    ) {
      this.setPhase("idle");
    }

    return {
      autoSyncEnabled: settings.autoSyncEnabled,
      syncIntervalMinutes: settings.syncIntervalMinutes,
      maxReportsPerSync: settings.maxReportsPerSync,
      enabledProviders: settings.enabledProviders,
      phase: this.phase,
      phaseMessage: this.phaseMessage,
      isRunning,
      backgroundProcessing,
      lastSyncStartedAt: persisted.lastSyncStartedAt,
      lastSyncCompletedAt: persisted.lastSyncCompletedAt,
      lastSuccessfulSyncAt: persisted.lastSuccessfulSyncAt,
      nextScheduledSyncAt: persisted.nextScheduledSyncAt,
      lastFetchedCount: persisted.lastFetchedCount,
      lastAnalysedCount: persisted.lastAnalysedCount,
      lastSavedCount: persisted.lastSavedCount,
      lastSkippedCount: persisted.lastSkippedCount,
      lastPreviouslyAnalysedCount: this.lastImportStats.previouslyAnalysedCount,
      lastNewImportCount: this.lastImportStats.newImportCount,
      lastRequeuedCount: this.lastImportStats.requeuedCount,
      lastPendingAnalysisCount: this.lastImportStats.pendingAnalysisCount,
      lastUsedSources: persisted.lastUsedSources,
      lastError: persisted.lastError,
      lastSyncAt: persisted.lastSyncStartedAt,
      lastCompletedAt: persisted.lastSyncCompletedAt,
      nextSyncAt: persisted.nextScheduledSyncAt,
      newIncidentsCount: this.newIncidentsCount,
      warnings: [...this.warnings],
      lastFetchDurationMs: persisted.lastFetchDurationMs,
      lastSaveDurationMs: persisted.lastSaveDurationMs,
      lastSyncTiming: persisted.lastSyncTiming,
    };
  }

  private buildBackgroundMessage(snapshot: BackgroundProcessingSnapshot): string {
    return formatQueueSummary(snapshot.queue);
  }

  async getStatusAsync(): Promise<SyncStatusSnapshot> {
    await ingestionSyncStateRepository.clearStaleRunning();
    const settings = await loadSyncSettings();
    let persisted = await ingestionSyncStateRepository.get();

    if (settings.autoSyncEnabled && !persisted.nextScheduledSyncAt) {
      await this.scheduleNextSync(settings);
      persisted = await ingestionSyncStateRepository.get();
    }

    return this.buildSnapshot(settings, persisted);
  }

  async getSettings(): Promise<SyncSettings> {
    return loadSyncSettings();
  }

  async updateSettings(partial: Partial<SyncSettings>): Promise<{
    settings: SyncSettings;
    status: SyncStatusSnapshot;
  }> {
    const settings = await saveSyncSettings(partial);
    await this.scheduleNextSync(settings);
    const status = await this.getStatusAsync();
    return { settings, status };
  }

  async scheduleNextSync(settings: SyncSettings): Promise<void> {
    const persisted = await ingestionSyncStateRepository.get();
    const nextAt = this.computeNextScheduledSyncAt(
      settings,
      persisted.lastSuccessfulSyncAt ?? persisted.lastSyncCompletedAt
    );
    await ingestionSyncStateRepository.setNextScheduledSyncAt(nextAt);
  }

  acknowledgeNewIncidents() {
    this.newIncidentsCount = 0;
  }

  clearWarnings() {
    this.warnings = [];
  }

  async runSync(options?: {
    manualArticles?: ManualImportArticle[];
  }): Promise<IngestionRunResult> {
    let release!: () => void;
    const previous = this.runLock;
    this.runLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const settings = await loadSyncSettings();
    this.warnings = [];
    this.setPhase("fetching");

    await ingestionSyncStateRepository.markStarted();

    try {
      this.setPhase("importing");
      const result = await newsIngestionService.runIngestion({
        source: "FALLBACK",
        keyword: "all",
        limit: settings.maxReportsPerSync,
        manualArticles: options?.manualArticles,
        enabledProviders: settings.enabledProviders,
        fastImport: true,
        onProviderWarning: (message) => {
          const formatted = formatSyncWarning(message);
          this.warnings.push(formatted.message);
        },
      });

      this.lastImportStats = {
        previouslyAnalysedCount: result.previouslyAnalysedCount,
        newImportCount: result.newImportCount,
        requeuedCount: result.requeuedCount,
        pendingAnalysisCount: result.pendingAnalysisCount,
      };

      this.setPhase("updating_database");
      invalidateCache("dashboard:");
      invalidateCache("map:");

      this.setPhase("updating_map");
      const { recoverAnalysisWorkerQueue } = await import(
        "@/services/workerRecoveryService"
      );
      await recoverAnalysisWorkerQueue();
      await requestWorkerStart("sync-monitoring");

      for (const err of result.errors) {
        const formatted = formatSyncWarning(`${err.title}: ${err.message}`, {
          source: "ingestion",
        });
        this.warnings.push(formatted.message);
      }

      const nextAt = this.computeNextScheduledSyncAt(
        settings,
        new Date().toISOString()
      );
      await ingestionSyncStateRepository.markCompleted(result, {
        nextScheduledSyncAt: nextAt,
      });

      if (result.savedCount > 0) {
        this.newIncidentsCount += result.savedCount;
      }

      this.setPhase(
        result.errors.length > 0 && result.savedCount === 0 && result.analysedCount === 0
          ? "error"
          : "completed",
        result.queuedCount && result.queuedCount > 0
          ? `Queued ${result.analysedCount} report${result.analysedCount === 1 ? "" : "s"} for analysis — ${result.pendingAnalysisCount ?? 0} pending`
          : buildIngestionResultMessage(result)
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      this.setPhase("error", message);
      this.warnings.push(formatSyncWarning(message).message);

      const nextAt = this.computeNextScheduledSyncAt(settings, null);
      await ingestionSyncStateRepository.markFailed(message, {
        nextScheduledSyncAt: nextAt,
      });

      throw error;
    } finally {
      if (this.phase !== "completed" && this.phase !== "error") {
        this.setPhase("idle");
      }
      release();
    }
  }

  async recordManualIngestionResult(
    result: IngestionRunResult,
    options?: { failed?: boolean; errorMessage?: string }
  ): Promise<SyncStatusSnapshot> {
    const settings = await loadSyncSettings();

    if (options?.failed && options.errorMessage) {
      const nextAt = this.computeNextScheduledSyncAt(settings, null);
      await ingestionSyncStateRepository.markFailed(options.errorMessage, {
        nextScheduledSyncAt: nextAt,
      });
    } else {
      const nextAt = this.computeNextScheduledSyncAt(
        settings,
        new Date().toISOString()
      );
      await ingestionSyncStateRepository.markCompleted(result, {
        nextScheduledSyncAt: nextAt,
      });
      if (result.savedCount > 0) {
        this.newIncidentsCount += result.savedCount;
      }
    }

    return this.getStatusAsync();
  }

  async beginManualIngestion(): Promise<void> {
    this.setPhase("fetching");
    await ingestionSyncStateRepository.markStarted();
  }

  async finishManualIngestionPhase(phase: SyncPhase) {
    this.setPhase(phase);
  }

  async resetIdlePhase() {
    this.setPhase("idle");
  }
}

export const syncMonitoringService = new SyncMonitoringService();

export type { SyncSettings };
export { DEFAULT_SYNC_SETTINGS, SYNC_INTERVAL_OPTIONS } from "@/lib/syncSettingsStore";
