export type JobStage =
  | "claimed"
  | "analysis_started"
  | "ai_provider_selected"
  | "ai_request_started"
  | "ai_request_finished"
  | "db_save_started"
  | "db_save_completed"
  | "status_updated_INTELLIGENCE_READY"
  | "cache_invalidated"
  | "analysis_completed"
  | "analysis_failed"
  | "timed_out";

export interface JobStageState {
  jobId: string;
  reportId?: string;
  stage: JobStage;
  updatedAt: string;
  detail?: string;
}

const stages = new Map<string, JobStageState>();

export function setJobStage(
  jobId: string,
  stage: JobStage,
  detail?: { reportId?: string; detail?: string }
): void {
  const prev = stages.get(jobId);
  const state: JobStageState = {
    jobId,
    reportId: detail?.reportId ?? prev?.reportId,
    stage,
    updatedAt: new Date().toISOString(),
    detail: detail?.detail,
  };
  stages.set(jobId, state);
  console.info(
    `[JobStage] ${jobId}${state.reportId ? ` report=${state.reportId}` : ""} → ${stage}` +
      (detail?.detail ? ` (${detail.detail})` : "")
  );
}

export function clearJobStage(jobId: string): void {
  stages.delete(jobId);
}

export function getJobStage(jobId: string): JobStageState | null {
  return stages.get(jobId) ?? null;
}

export function getAllJobStages(): JobStageState[] {
  return [...stages.values()];
}

/** Bind the current async analysis to a job id for stage logging. */
let activeJobId: string | null = null;

export function runWithJobContext<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
  const previous = activeJobId;
  activeJobId = jobId;
  return fn().finally(() => {
    activeJobId = previous;
  });
}

export function getActiveJobId(): string | null {
  return activeJobId;
}

export function logAnalysisStage(
  stage: JobStage,
  reportId: string,
  detail?: string
): void {
  const jobId = activeJobId ?? `report:${reportId}`;
  setJobStage(jobId, stage, { reportId, detail });
}
