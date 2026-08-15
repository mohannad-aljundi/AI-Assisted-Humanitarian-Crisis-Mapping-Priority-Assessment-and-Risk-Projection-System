export const ANALYSIS_UNAVAILABLE_MSG =
  "Analysis not available. Run Re-analyze All Data.";

function isDevLoggingEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function logViewReadOnlyStart(reportId: string): void {
  if (!isDevLoggingEnabled()) return;
  console.info("[View] Loading incident in read-only mode", reportId);
}

export function logViewReadOnlyComplete(
  reportId: string,
  fromCache: boolean
): void {
  if (!isDevLoggingEnabled()) return;
  console.info("[View] Incident loaded", {
    reportId,
    source: fromCache ? "cache" : "database",
  });
}
