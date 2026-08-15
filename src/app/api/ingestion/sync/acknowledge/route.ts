import { NextResponse } from "next/server";
import { syncMonitoringService } from "@/services/syncMonitoringService";

export const dynamic = "force-dynamic";

export async function POST() {
  syncMonitoringService.acknowledgeNewIncidents();
  const status = await syncMonitoringService.getStatusAsync();
  return NextResponse.json(status);
}
