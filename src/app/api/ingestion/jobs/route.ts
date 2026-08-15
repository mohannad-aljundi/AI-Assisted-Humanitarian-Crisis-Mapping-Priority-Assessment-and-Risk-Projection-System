import { NextResponse } from "next/server";
import { backgroundJobWorkerService } from "@/services/backgroundJobWorkerService";
import { syncMonitoringService } from "@/services/syncMonitoringService";
import { recoverAnalysisWorkerQueue } from "@/services/workerRecoveryService";
import { getWorkerRuntimeSummary } from "@/lib/workerRuntime";

export const dynamic = "force-dynamic";

export async function POST() {
  const recovery = await recoverAnalysisWorkerQueue();
  const [status, worker] = await Promise.all([
    syncMonitoringService.getStatusAsync(),
    backgroundJobWorkerService.getWorkerSnapshot(),
  ]);

  return NextResponse.json({
    status,
    worker,
    recovery,
    workerRuntime: getWorkerRuntimeSummary(),
  });
}

export async function GET() {
  const worker = await backgroundJobWorkerService.getWorkerSnapshot();
  const status = await syncMonitoringService.getStatusAsync();
  return NextResponse.json({ status, worker });
}
