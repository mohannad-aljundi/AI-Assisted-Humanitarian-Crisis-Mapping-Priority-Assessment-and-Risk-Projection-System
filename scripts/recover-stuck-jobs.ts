/**
 * Force-recover stuck RUNNING jobs and restart the worker.
 * Usage: npx tsx scripts/recover-stuck-jobs.ts
 */
import { backgroundJobWorkerService } from "../src/services/backgroundJobWorkerService";

async function main() {
  const recovery = await backgroundJobWorkerService.forceRecoverStuckWork({
    forceAll: true,
  });
  console.log("Recovery complete:", recovery);
  backgroundJobWorkerService.ensureRunning();
  console.log("Worker ensureRunning() called");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
