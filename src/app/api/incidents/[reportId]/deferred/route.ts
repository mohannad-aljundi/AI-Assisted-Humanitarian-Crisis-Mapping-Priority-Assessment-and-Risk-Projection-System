import { NextResponse } from "next/server";
import { incidentService } from "@/services/incidentService";
import { createPerfTrace, endPerfTrace, perfStageTimed } from "@/lib/perfTrace";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ reportId: string }>;
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { reportId } = await params;
  const traceId = createPerfTrace("/api/incidents/deferred", reportId);

  const core = await perfStageTimed(traceId, "server:getIncidentCore", () =>
    incidentService.getIncidentCoreByReportId(reportId)
  );
  if (!core) {
    endPerfTrace(traceId, "/api/incidents/deferred", { found: false });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deferred = await perfStageTimed(traceId, "server:getIncidentDeferred", () =>
    incidentService.getIncidentDeferredByReportId(reportId, core)
  );

  endPerfTrace(traceId, "/api/incidents/deferred", {
    timelineEvents: deferred.timeline.length,
  });

  return NextResponse.json(deferred);
}
