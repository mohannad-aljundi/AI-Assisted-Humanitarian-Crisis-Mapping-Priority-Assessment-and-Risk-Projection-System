import { NextResponse } from "next/server";
import { analysisService } from "@/services/analysisService";

interface RouteParams {
  params: Promise<{ reportId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { reportId } = await params;
    const analysis = await analysisService.getByReportId(reportId);

    if (!analysis) {
      return NextResponse.json(
        { error: "Analysis results not found for this report" },
        { status: 404 }
      );
    }

    return NextResponse.json(analysis, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load analysis results";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
