import { NextResponse } from "next/server";
import { reanalysisService } from "@/services/reanalysisService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  if (reanalysisService.isRunning()) {
    return NextResponse.json(
      { error: "Reanalysis already in progress" },
      { status: 409 }
    );
  }

  try {
    const result = await reanalysisService.reanalyzeAll((progress) => {
      console.log(
        `[Reanalysis] Progress: ${progress.processed}/${progress.total}` +
          (progress.currentReportId ? ` (${progress.currentReportId})` : "")
      );
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Reanalysis failed",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    running: reanalysisService.isRunning(),
  });
}
