import { NextRequest, NextResponse } from "next/server";
import { mapService } from "@/services/mapService";
import { invalidateDashboardCache, shouldBypassDashboardCache } from "@/services/dashboardRefreshService";
import { logPerfCache, logPerfRouteLoaded } from "@/lib/perfLogs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const readOnly = request.nextUrl.searchParams.get("readOnly") === "true";
  const bust = shouldBypassDashboardCache(request.nextUrl.searchParams);
  if (bust) {
    invalidateDashboardCache("api map summary bust cache");
  }

  logPerfRouteLoaded("/api/map/summary", { readOnly, bust });
  const data = await mapService.getMapPageData({ readOnly });
  logPerfCache("/api/map/summary", false);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}