import { correlationBackfillService } from "../src/services/correlationBackfillService";

async function main() {
  console.log("[Correlation backfill] Starting…");
  const result = await correlationBackfillService.backfillAllReports({ reset: true });
  console.log(
    `[Correlation backfill] Done: ${result.clustersCreated} clusters from ${result.correlated}/${result.total} reports` +
      (result.failed > 0 ? ` (${result.failed} failed)` : "")
  );
  if (result.errors.length > 0) {
    console.error("[Correlation backfill] Errors:", result.errors.slice(0, 10));
  }
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[Correlation backfill] Fatal:", error);
  process.exit(1);
});
