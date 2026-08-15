import { NextResponse } from "next/server";
import { syncMonitoringService } from "@/services/syncMonitoringService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await syncMonitoringService.getSettings();
  if (!settings.autoSyncEnabled) {
    return NextResponse.json({ skipped: true, reason: "Auto sync disabled" });
  }

  const result = await syncMonitoringService.runSync();
  const status = await syncMonitoringService.getStatusAsync();

  return NextResponse.json({ result, status });
}
