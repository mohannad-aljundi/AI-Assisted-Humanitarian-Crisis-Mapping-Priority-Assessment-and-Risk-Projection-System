import { NextResponse } from "next/server";
import { analysisService } from "@/services/analysisService";
import { continuousHumanitarianLearningEngine } from "@/services/continuousHumanitarianLearningEngine";
import { createPerfTrace, endPerfTrace, perfStageTimed } from "@/lib/perfTrace";

interface RouteParams {
  params: Promise<{ reportId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { reportId } = await params;
  const traceId = createPerfTrace("/api/reports/learning/similar", reportId);

  try {
    const analysis = await perfStageTimed(traceId, "server:getByReportIdForView", () =>
      analysisService.getByReportIdForView(reportId)
    );
    if (!analysis) {
      endPerfTrace(traceId, "/api/reports/learning/similar", { found: false });
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const reasoning = analysis.insight?.humanitarianReasoning;
    const similar = await perfStageTimed(traceId, "server:findSimilarIncidents", () =>
      continuousHumanitarianLearningEngine.findSimilarIncidents({
        reportId,
        title: analysis.report.title,
        content: analysis.report.content,
        crisisType: analysis.nlp?.crisisType ?? null,
        country: analysis.locations[0]?.name?.split(",").pop()?.trim() ?? null,
        city: analysis.locations[0]?.name?.split(",")[0]?.trim() ?? null,
        reportPurpose: reasoning?.reportPurpose ?? null,
        crisisPhase: reasoning?.crisisPhase ?? null,
        priorityLevel: analysis.priorityAssessment.priorityLevel,
        limit: 6,
      })
    );

    const learningContext = await perfStageTimed(traceId, "server:buildLearningContext", () =>
      continuousHumanitarianLearningEngine.buildLearningContext({
        reportId,
        title: analysis.report.title,
        content: analysis.report.content,
        crisisType: analysis.nlp?.crisisType ?? null,
        reportPurpose: reasoning?.reportPurpose ?? null,
        crisisPhase: reasoning?.crisisPhase ?? null,
        priorityLevel: analysis.priorityAssessment.priorityLevel,
        needs: analysis.nlp?.humanitarianNeeds,
      })
    );

    endPerfTrace(traceId, "/api/reports/learning/similar", {
      similarCount: similar.length,
    });

    return NextResponse.json({
      reportId,
      similarIncidents: similar,
      learningInfluence: continuousHumanitarianLearningEngine.buildInfluenceTrace(learningContext),
    });
  } catch (error) {
    endPerfTrace(traceId, "/api/reports/learning/similar", {
      error: error instanceof Error ? error.message : "unknown",
    });
    const message = error instanceof Error ? error.message : "Failed to find similar incidents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
