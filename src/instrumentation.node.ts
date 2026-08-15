/**

 * Node.js-only startup. Imported exclusively when NEXT_RUNTIME === "nodejs"

 * so Edge instrumentation never loads crypto/Prisma/worker modules.

 */



function formatStartupError(error: unknown): string {

  if (error instanceof Error) return error.message;

  return String(error);

}



export async function registerNodeInstrumentation(): Promise<void> {

  const { validateAiOnStartup } = await import("@/lib/aiStartup");

  await validateAiOnStartup();



  // Pipeline migration only — background AI jobs run in `npm run worker`, not here.

  setTimeout(() => {

    void (async () => {

      try {

        const { ensurePipelineVersionCurrent } = await import(

          "@/services/pipelineMigrationService"

        );

        await ensurePipelineVersionCurrent();

      } catch (error) {

        console.warn(

          `[Startup] Pipeline migration check deferred — ${formatStartupError(error)}`

        );

      }



      const { shouldRunBackgroundWorker } = await import("@/lib/workerRuntime");

      if (shouldRunBackgroundWorker()) {

        const { requestWorkerStart } = await import("@/lib/workerLauncher");

        await requestWorkerStart("instrumentation");

      } else {

        console.info(

          "[Startup] Web server only — background jobs run in separate worker (`npm run worker`)"

        );

      }

    })();

  }, 0);

}

