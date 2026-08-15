import {
  isDedicatedWorkerProcess,
  shouldRunBackgroundWorker,
} from "@/lib/workerRuntime";

/**
 * Start the background job loop only when worker runtime rules allow it.
 * The Next.js web process does not run analysis jobs by default; use `npm run worker`.
 */
export async function requestWorkerStart(context: string): Promise<void> {
  if (!shouldRunBackgroundWorker()) {
    if (!isDedicatedWorkerProcess()) {
      console.info(
        `[Worker] Skipping in-process worker (${context}) — start a separate worker: npm run worker`
      );
    }
    return;
  }

  const { backgroundJobWorkerService } = await import(
    "@/services/backgroundJobWorkerService"
  );
  backgroundJobWorkerService.ensureRunning();
}
