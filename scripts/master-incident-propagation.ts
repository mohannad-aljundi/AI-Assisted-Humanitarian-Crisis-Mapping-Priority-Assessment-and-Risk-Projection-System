import { masterIncidentPropagationService } from "@/services/masterIncidentPropagationService";

async function main() {
  console.log("[MasterIncidentPropagation] Starting one-time sync of linked reports…");
  const result = await masterIncidentPropagationService.propagateAllLinkedReports();
  console.log(
    `[MasterIncidentPropagation] Complete: ${result.propagated}/${result.total} clusters, ${result.reportsUpdated} reports updated, ${result.skipped} skipped, ${result.errors.length} errors (${result.durationMs}ms)`
  );
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`  - ${error.masterIncidentId}: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[MasterIncidentPropagation] Fatal error:", error);
  process.exitCode = 1;
});
