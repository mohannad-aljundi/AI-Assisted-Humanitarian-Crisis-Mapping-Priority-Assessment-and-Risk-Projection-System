import { incidentLabelBackfillService } from "../src/services/incidentLabelBackfillService";

async function main() {
  const limit = Number(process.env.LIMIT ?? "500");
  console.log(`[Incident labels] Backfilling up to ${limit} reports…`);
  const result = await incidentLabelBackfillService.backfillMissingLabels({ limit });
  console.log(
    `[Incident labels] Done: ${result.updated}/${result.total} updated` +
      (result.failed > 0 ? ` (${result.failed} failed)` : "")
  );
  if (result.errors.length > 0) {
    console.error("[Incident labels] Errors:", result.errors.slice(0, 10));
  }
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[Incident labels] Fatal:", error);
  process.exit(1);
});
