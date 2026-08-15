import type { IngestionRunResult } from "@/types";

export function buildIngestionResultMessage(result: IngestionRunResult): string {
  const pending = result.locationPendingCount ?? 0;
  const approximate = result.locationApproximateCount ?? 0;
  const verified = result.locationVerifiedCount ?? 0;

  if (result.savedCount > 0) {
    const parts: string[] = [
      `${result.analysedCount} reports analysed`,
      `${result.savedCount} saved`,
    ];

    const locationParts: string[] = [];
    if (verified > 0) locationParts.push(`${verified} with verified location`);
    if (approximate > 0) {
      locationParts.push(`${approximate} with approximate location`);
    }
    if (pending > 0) locationParts.push(`${pending} pending location`);

    if (locationParts.length > 0) {
      parts.push(`(${locationParts.join(", ")})`);
    }

    return parts.join(", ");
  }

  if (result.analysedCount > 0 && result.savedCount === 0) {
    const missingCoordsFailures = result.failedMissingCoordsCount ?? 0;
    if (missingCoordsFailures > 0) {
      return `${result.analysedCount} reports analysed, ${result.savedCount} saved because location coordinates were missing`;
    }

    const dbFailures = result.failedDbErrorCount ?? 0;
    if (dbFailures > 0) {
      return `${result.analysedCount} reports analysed, ${result.savedCount} saved due to database errors`;
    }

    const aiFailures = result.failedAiInvalidJsonCount ?? 0;
    if (aiFailures > 0) {
      return `${result.analysedCount} reports analysed, ${result.savedCount} saved due to invalid AI responses`;
    }

    if (result.errors.length > 0) {
      return `${result.analysedCount} reports analysed, ${result.savedCount} saved — see warnings for details`;
    }
  }

  if (result.fetchedCount === 0) {
    return "No new articles fetched";
  }

  const queued = result.analysedCount ?? result.queuedCount ?? 0;
  const previouslyAnalysed = result.previouslyAnalysedCount ?? 0;

  if (queued > 0) {
    return `Fetched ${result.fetchedCount}, queued ${queued} for analysis, ${previouslyAnalysed} already analysed`;
  }

  if (previouslyAnalysed > 0) {
    return `Fetched ${result.fetchedCount} — all ${previouslyAnalysed} already analysed`;
  }

  return `Sync complete — fetched ${result.fetchedCount}, saved ${result.savedCount}`;
}
