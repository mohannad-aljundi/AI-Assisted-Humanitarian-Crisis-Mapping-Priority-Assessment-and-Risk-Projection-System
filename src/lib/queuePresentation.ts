import type { ProcessingQueueSnapshot } from "@/lib/analysisEventBus";

/** User-facing summary — same fields as Processing Queue card. */
export function formatQueueSummary(queue: ProcessingQueueSnapshot): string {
  if (!queue.active && queue.analysing === 0 && queue.waiting === 0) {
    return "Queue empty";
  }

  const parts: string[] = [];
  if (queue.analysing > 0) parts.push(`${queue.analysing} analysing`);
  if (queue.waiting > 0) parts.push(`${queue.waiting} waiting`);
  if (queue.failed > 0) parts.push(`${queue.failed} failed`);
  if (
    parts.length === 0 &&
    queue.completedToday > 0
  ) {
    parts.push(`${queue.completedToday} completed today`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Processing…";
}

export function formatAverageAnalysisTime(seconds: number | null): string {
  if (seconds == null) return "No completed analyses yet";
  if (seconds < 60) {
    const label = seconds === 1 ? "second" : "seconds";
    return `${seconds} ${label}`;
  }
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  if (rem === 0) return `${minutes} min`;
  return `${minutes} min ${rem} sec`;
}
