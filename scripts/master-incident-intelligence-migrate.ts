import { masterIncidentIntelligenceMigrationService } from "../src/services/masterIncidentIntelligenceMigrationService";

async function main() {
  console.log("[Master incident intelligence] One-time migration starting…");
  const result = await masterIncidentIntelligenceMigrationService.runOneTimeMigration();

  if (result.alreadyComplete) {
    console.log("[Master incident intelligence] Already complete — nothing to migrate.");
    process.exit(0);
  }

  console.log(
    `[Master incident intelligence] Done: ${result.synthesised}/${result.total} synthesised` +
      (result.skipped > 0 ? `, ${result.skipped} skipped` : "") +
      (result.failed > 0 ? `, ${result.failed} failed` : "") +
      ` in ${Math.round(result.durationMs / 1000)}s`
  );

  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[Master incident intelligence] Fatal:", error);
  process.exit(1);
});
