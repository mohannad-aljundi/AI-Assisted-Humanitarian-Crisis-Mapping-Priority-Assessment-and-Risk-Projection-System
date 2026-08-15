import { prisma } from "@/lib/prisma";
import type { IngestionProviderId, IngestionRunResult } from "@/types";

export const SYNC_STATE_ID = "singleton";

export interface IngestionSyncStateRecord {
  id: string;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  nextScheduledSyncAt: string | null;
  lastFetchedCount: number;
  lastAnalysedCount: number;
  lastSavedCount: number;
  lastSkippedCount: number;
  lastUsedSources: IngestionProviderId[];
  lastError: string | null;
  isRunning: boolean;
  backgroundJobsPending: number;
  lastFetchDurationMs: number | null;
  lastSaveDurationMs: number | null;
  lastSyncTiming: import("@/lib/syncTimingLogger").SyncTimingBreakdown | null;
  createdAt: string;
  updatedAt: string;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseUsedSources(value: unknown): IngestionProviderId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is IngestionProviderId => typeof item === "string");
}

function mapRecord(row: {
  id: string;
  lastSyncStartedAt: Date | null;
  lastSyncCompletedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  nextScheduledSyncAt: Date | null;
  lastFetchedCount: number;
  lastAnalysedCount: number;
  lastSavedCount: number;
  lastSkippedCount: number;
  lastUsedSources: unknown;
  lastError: string | null;
  isRunning: boolean;
  backgroundJobsPending: number;
  lastFetchDurationMs: number | null;
  lastSaveDurationMs: number | null;
  lastSyncTiming: unknown;
  createdAt: Date;
  updatedAt: Date;
}): IngestionSyncStateRecord {
  return {
    id: row.id,
    lastSyncStartedAt: toIso(row.lastSyncStartedAt),
    lastSyncCompletedAt: toIso(row.lastSyncCompletedAt),
    lastSuccessfulSyncAt: toIso(row.lastSuccessfulSyncAt),
    nextScheduledSyncAt: toIso(row.nextScheduledSyncAt),
    lastFetchedCount: row.lastFetchedCount,
    lastAnalysedCount: row.lastAnalysedCount,
    lastSavedCount: row.lastSavedCount,
    lastSkippedCount: row.lastSkippedCount,
    lastUsedSources: parseUsedSources(row.lastUsedSources),
    lastError: row.lastError,
    isRunning: row.isRunning,
    backgroundJobsPending: row.backgroundJobsPending,
    lastFetchDurationMs: row.lastFetchDurationMs,
    lastSaveDurationMs: row.lastSaveDurationMs,
    lastSyncTiming: (row.lastSyncTiming as IngestionSyncStateRecord["lastSyncTiming"]) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function extractUsedSources(result: IngestionRunResult): IngestionProviderId[] {
  return result.sourceSummaries
    .filter((summary) => summary.status === "success" && summary.fetchedCount > 0)
    .map((summary) => summary.source);
}

function hasSuccessfulData(result: IngestionRunResult): boolean {
  return result.savedCount > 0 || result.fetchedCount > 0 || result.analysedCount > 0;
}

export class IngestionSyncStateRepository {
  private async findOrCreate() {
    const existing = await prisma.ingestionSyncState.findUnique({
      where: { id: SYNC_STATE_ID },
    });
    if (existing) return existing;

    try {
      return await prisma.ingestionSyncState.create({
        data: { id: SYNC_STATE_ID },
      });
    } catch (error) {
      const isUniqueViolation =
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";

      if (isUniqueViolation) {
        const row = await prisma.ingestionSyncState.findUnique({
          where: { id: SYNC_STATE_ID },
        });
        if (row) return row;
      }

      throw error;
    }
  }

  async get(): Promise<IngestionSyncStateRecord> {
    const row = await this.findOrCreate();
    return mapRecord(row);
  }

  async markStarted(): Promise<IngestionSyncStateRecord> {
    const now = new Date();
    await this.findOrCreate();
    const row = await prisma.ingestionSyncState.update({
      where: { id: SYNC_STATE_ID },
      data: {
        lastSyncStartedAt: now,
        isRunning: true,
        lastError: null,
      },
    });
    return mapRecord(row);
  }

  async markCompleted(
    result: IngestionRunResult,
    options: { nextScheduledSyncAt: Date | null }
  ): Promise<IngestionSyncStateRecord> {
    const now = new Date();
    const usedSources = extractUsedSources(result);
    const succeeded = hasSuccessfulData(result);
    const errorMessages = result.errors.map((err) => `${err.title}: ${err.message}`);

    await this.findOrCreate();
    const row = await prisma.ingestionSyncState.update({
      where: { id: SYNC_STATE_ID },
      data: {
        lastSyncCompletedAt: now,
        nextScheduledSyncAt: options.nextScheduledSyncAt,
        lastFetchedCount: result.fetchedCount,
        lastAnalysedCount: result.analysedCount,
        lastSavedCount: result.savedCount,
        lastSkippedCount: result.skippedCount,
        lastUsedSources: usedSources,
        lastError: errorMessages.length > 0 ? errorMessages.join("\n") : null,
        isRunning: false,
        backgroundJobsPending: result.queuedCount ?? 0,
        lastFetchDurationMs: result.syncTiming?.fetchMs ?? null,
        lastSaveDurationMs: result.syncTiming?.saveMs ?? null,
        lastSyncTiming: result.syncTiming
          ? (result.syncTiming as object)
          : undefined,
        ...(succeeded
          ? {
              lastSuccessfulSyncAt: now,
            }
          : {}),
      },
    });
    return mapRecord(row);
  }

  async markFailed(
    error: string,
    options?: { nextScheduledSyncAt?: Date | null }
  ): Promise<IngestionSyncStateRecord> {
    const now = new Date();
    await this.findOrCreate();
    const row = await prisma.ingestionSyncState.update({
      where: { id: SYNC_STATE_ID },
      data: {
        lastSyncCompletedAt: now,
        lastError: error,
        isRunning: false,
        ...(options?.nextScheduledSyncAt !== undefined
          ? { nextScheduledSyncAt: options.nextScheduledSyncAt }
          : {}),
      },
    });
    return mapRecord(row);
  }

  async setNextScheduledSyncAt(value: Date | null): Promise<IngestionSyncStateRecord> {
    await this.findOrCreate();
    const row = await prisma.ingestionSyncState.update({
      where: { id: SYNC_STATE_ID },
      data: {
        nextScheduledSyncAt: value,
      },
    });
    return mapRecord(row);
  }

  async updateBackgroundJobsPending(count: number): Promise<void> {
    await this.findOrCreate();
    await prisma.ingestionSyncState.update({
      where: { id: SYNC_STATE_ID },
      data: { backgroundJobsPending: count },
    });
  }

  async clearStaleRunning(maxAgeMs = 30 * 60_000): Promise<void> {
    const row = await prisma.ingestionSyncState.findUnique({
      where: { id: SYNC_STATE_ID },
    });
    if (!row?.isRunning || !row.lastSyncStartedAt) return;

    const age = Date.now() - row.lastSyncStartedAt.getTime();
    if (age <= maxAgeMs) return;

    await prisma.ingestionSyncState.update({
      where: { id: SYNC_STATE_ID },
      data: {
        isRunning: false,
        lastError: row.lastError ?? "Previous sync was interrupted",
        lastSyncCompletedAt: row.lastSyncCompletedAt ?? new Date(),
      },
    });
  }
}

export const ingestionSyncStateRepository = new IngestionSyncStateRepository();
