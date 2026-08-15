import { recoverAnalysisWorkerQueue } from "../src/services/workerRecoveryService";
import { backgroundJobWorkerService } from "../src/services/backgroundJobWorkerService";

async function main() {
  console.log("[Worker recovery] Retrying failed analysis jobs…");
  const result = await recoverAnalysisWorkerQueue();
  backgroundJobWorkerService.ensureRunning();
  console.log(
    `[Worker recovery] Done — retried ${result.retriedJobs} job(s), requeued ${result.requeuedReports} report(s)`
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("[Worker recovery] Fatal:", error);
  process.exit(1);
});
