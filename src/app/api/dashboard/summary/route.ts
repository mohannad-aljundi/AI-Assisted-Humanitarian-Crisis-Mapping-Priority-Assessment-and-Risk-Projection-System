import { NextResponse } from "next/server";
import { dashboardService } from "@/services/dashboardService";
import {
  invalidateDashboardCache,
  shouldBypassDashboardCache,
} from "@/services/dashboardRefreshService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const bust = shouldBypassDashboardCache(new URL(request.url).searchParams);
  if (bust) {
    invalidateDashboardCache("api summary bust cache");
  }

  const dashboard = await dashboardService.getDashboardData(
    bust ? { bypassCache: true } : undefined
  );

  return NextResponse.json(
    { dashboard, cached: !bust },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}