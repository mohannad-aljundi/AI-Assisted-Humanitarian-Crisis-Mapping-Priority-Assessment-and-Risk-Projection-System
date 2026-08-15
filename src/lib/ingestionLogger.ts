import type { IngestionProviderId } from "@/types";

export interface IngestionSourceLogEntry {
  source: IngestionProviderId;
  phase: "started" | "completed" | "failed";
  requestUrl?: string;
  responseStatus?: number;
  rawFetchedCount?: number;
  afterDedupCount?: number;
  insertedCount?: number;
  durationMs?: number;
  error?: string;
}

export function logIngestionSource(entry: IngestionSourceLogEntry): void {
  const prefix = `[INGESTION:${entry.source}]`;
  const parts: string[] = [entry.phase.toUpperCase()];

  if (entry.requestUrl) parts.push(`url=${entry.requestUrl}`);
  if (entry.responseStatus !== undefined) parts.push(`status=${entry.responseStatus}`);
  if (entry.rawFetchedCount !== undefined) parts.push(`raw=${entry.rawFetchedCount}`);
  if (entry.afterDedupCount !== undefined) parts.push(`deduped=${entry.afterDedupCount}`);
  if (entry.insertedCount !== undefined) parts.push(`inserted=${entry.insertedCount}`);
  if (entry.durationMs !== undefined) parts.push(`ms=${entry.durationMs}`);
  if (entry.error) parts.push(`error=${entry.error}`);

  const message = `${prefix} ${parts.join(" | ")}`;

  if (entry.phase === "failed") {
    console.error(message);
  } else {
    console.info(message);
  }
}

export function logIngestionSummary(
  summary: {
    totalSources: number;
    successfulSources: number;
    failedSources: number;
    fetchedArticles: number;
    insertedIncidents: number;
    duplicatesRemoved: number;
    durationMs: number;
  },
  result?: {
    analysedCount: number;
    savedCount: number;
    skippedCount: number;
    failedDuplicateCount?: number;
    failedMissingCoordsCount?: number;
    failedDbErrorCount?: number;
    failedAiInvalidJsonCount?: number;
    locationPendingCount?: number;
    locationVerifiedCount?: number;
    locationApproximateCount?: number;
  }
): void {
  const counters = result
    ? ` analysed=${result.analysedCount} saved=${result.savedCount} skipped=${result.skippedCount}` +
      ` dup=${result.failedDuplicateCount ?? 0} verified=${result.locationVerifiedCount ?? 0}` +
      ` approx=${result.locationApproximateCount ?? 0} pending=${result.locationPendingCount ?? 0}` +
      ` coordFail=${result.failedMissingCoordsCount ?? 0} dbFail=${result.failedDbErrorCount ?? 0}` +
      ` aiFail=${result.failedAiInvalidJsonCount ?? 0}`
    : "";

  console.info(
    `[INGESTION:SUMMARY] sources=${summary.totalSources} ok=${summary.successfulSources} failed=${summary.failedSources} ` +
      `fetched=${summary.fetchedArticles} inserted=${summary.insertedIncidents} duplicates=${summary.duplicatesRemoved} ms=${summary.durationMs}` +
      counters
  );
}
