/**
 * Populates LearningCase snapshots from persisted analysis — no AI calls.
 * Use after CHLE migration or when cases are missing without full re-analysis.
 */
import { chleBackfillService } from "../src/services/chleBackfillService";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await chleBackfillService.backfillLearningCases();
  const learningCases = await prisma.learningCase.count();

  console.log(JSON.stringify({ ...result, learningCases }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
