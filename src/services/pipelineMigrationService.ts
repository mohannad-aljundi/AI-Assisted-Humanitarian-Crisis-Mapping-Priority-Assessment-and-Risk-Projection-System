import { prisma } from "@/lib/prisma";

import { INTELLIGENCE_PIPELINE_VERSION } from "@/lib/explainabilityPresentation";

import { reanalysisService } from "@/services/reanalysisService";



let migrationQueued = false;



/** Only runs when PIPELINE_AUTO_MIGRATE=true — never by default on server boot. */
const AUTO_MIGRATE_ENABLED = process.env.PIPELINE_AUTO_MIGRATE === "true";



const AUTO_MIGRATE_DELAY_MS = Number(process.env.PIPELINE_AUTO_MIGRATE_DELAY_MS ?? 120_000);



/**

 * When the intelligence pipeline version changes, re-run full analysis on outdated reports.

 * Deferred and opt-in during development so navigation is not blocked on server boot.

 */

export async function ensurePipelineVersionCurrent(): Promise<void> {

  if (migrationQueued || reanalysisService.isRunning()) return;

  let outdated: number;
  try {
    outdated = await prisma.report.count({
      where: {
        duplicateOfReportId: null,
        OR: [
          { insight: null },
          { insight: { is: { pipelineVersion: null } } },
          { insight: { is: { pipelineVersion: { not: INTELLIGENCE_PIPELINE_VERSION } } } },
        ],
      },
    });
  } catch (error) {
    console.warn(
      "[PipelineMigration] Database unreachable — migration check skipped:",
      error instanceof Error ? error.message : error
    );
    return;
  }




  if (outdated === 0) return;



  if (!AUTO_MIGRATE_ENABLED) {

    console.info(

      `[PipelineMigration] ${outdated} report(s) on legacy pipeline — auto-migration skipped (use System Health → Run OpenAI Upgrade Reanalysis, or set PIPELINE_AUTO_MIGRATE=true)`

    );

    return;

  }



  migrationQueued = true;

  console.info(

    `[PipelineMigration] ${outdated} report(s) on legacy pipeline — scheduled background reanalysis in ${AUTO_MIGRATE_DELAY_MS}ms (target: ${INTELLIGENCE_PIPELINE_VERSION})`

  );



  setTimeout(() => {

    void runPipelineMigration(outdated);

  }, AUTO_MIGRATE_DELAY_MS);

}



async function runPipelineMigration(outdated: number): Promise<void> {

  if (reanalysisService.isRunning()) {

    migrationQueued = false;

    return;

  }



  try {

    console.info(

      `[PipelineMigration] Starting background reanalysis for ${outdated} report(s)`

    );

    const result = await reanalysisService.reanalyzeAll();

    console.info(

      `[PipelineMigration] Complete — ${result.succeeded}/${result.total} succeeded, ${result.failed} failed`

    );

  } catch (error) {

    console.error("[PipelineMigration] Reanalysis failed:", error);

  } finally {

    migrationQueued = false;

  }

}



export function getIntelligencePipelineVersion(): string {

  return INTELLIGENCE_PIPELINE_VERSION;

}

