export type ImportPipelineStage =
  | "fetched"
  | "duplicate_detected"
  | "previously_analysed"
  | "queued_for_analysis"
  | "imported"
  | "analysis_started"
  | "analysis_completed"
  | "analysis_skipped"
  | "worker_claimed"
  | "worker_idle"
  | "reconcile_pending";

export function logImportPipeline(
  stage: ImportPipelineStage,
  details: Record<string, unknown>
): void {
  console.info(`[ImportPipeline] ${stage}`, details);
}
