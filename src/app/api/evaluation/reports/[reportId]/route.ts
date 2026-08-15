import { NextResponse } from "next/server";
import { evaluationReportService } from "@/services/evaluationReportService";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ reportId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { reportId } = await params;

  try {
    const result = await evaluationReportService.getLiveListItem(reportId);
    if (!result.item) {
      console.error(
        `[EvaluationAPI] Live list item unavailable for ${reportId}: ${result.reason}`
      );
      return NextResponse.json(
        { item: null, listVisible: false, reason: result.reason },
        { status: 404 }
      );
    }

    if (!result.listVisible && result.reason) {
      console.warn(`[EvaluationAPI] ${result.reason}`);
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[EvaluationAPI] Failed to load live list item for ${reportId}:`,
      message
    );
    return NextResponse.json(
      { item: null, listVisible: false, reason: message },
      { status: 500 }
    );
  }
}
