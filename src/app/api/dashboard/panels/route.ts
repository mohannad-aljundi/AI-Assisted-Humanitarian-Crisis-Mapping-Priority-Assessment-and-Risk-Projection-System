import { NextResponse } from "next/server";
import { dashboardService } from "@/services/dashboardService";
import {
  invalidateDashboardCache,
  shouldBypassDashboardCache,
} from "@/services/dashboardRefreshService";
import { createPerfTrace, endPerfTrace, perfStageTimed } from "@/lib/perfTrace";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = createPerfTrace("/api/dashboard/panels");
  const bust = shouldBypassDashboardCache(new URL(request.url).searchParams);
  if (bust) {
    invalidateDashboardCache("api panels bust cache");
  }

  const panels = await perfStageTimed(traceId, "server:getDashboardPanelsData", () =>
    dashboardService.getDashboardPanelsData({ bypassCache: bust })
  );

  endPerfTrace(traceId, "/api/dashboard/panels", {
    latestIncidents: panels.latestIncidents.length,
    payloadBytes: JSON.stringify(panels).length,
  });

  return NextResponse.json(panels, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
