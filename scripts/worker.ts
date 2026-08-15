/**
 * Dedicated background worker process.
 * Polls the job queue for report analysis, master-incident intelligence, and
 * related tasks so long-running LLM work stays outside the Next.js web process.
 *
 * Usage: npm run worker
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main(): Promise<void> {
  process.env.WORKER_PROCESS = "true";
  loadDotEnv();

  const { getWorkerRuntimeSummary } = await import("../src/lib/workerRuntime");
  const { recoverAnalysisWorkerQueue } = await import(
    "../src/services/workerRecoveryService"
  );
  const { backgroundJobWorkerService } = await import(
    "../src/services/backgroundJobWorkerService"
  );
  const { logAiProviderStartup } = await import("../src/lib/aiProvider");

  const runtime = getWorkerRuntimeSummary();
  console.info("[Worker] Dedicated background worker starting", runtime);
  logAiProviderStartup();

  await recoverAnalysisWorkerQueue();
  backgroundJobWorkerService.ensureRunning();

  const shutdown = (signal: string) => {
    console.info(`[Worker] Received ${signal} — exiting`);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.info(
    "[Worker] Polling job queue — keep this process running alongside `npm run dev`"
  );
}

main().catch((error) => {
  console.error("[Worker] Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
