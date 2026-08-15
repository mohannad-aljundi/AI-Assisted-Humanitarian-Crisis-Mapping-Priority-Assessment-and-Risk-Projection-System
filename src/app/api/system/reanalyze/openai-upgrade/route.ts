import { NextResponse } from "next/server";
import { oneTimeReanalysisService } from "@/services/oneTimeReanalysisService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  if (oneTimeReanalysisService.isRunning()) {
    return NextResponse.json(
      { error: "OpenAI upgrade reanalysis already in progress" },
      { status: 409 }
    );
  }

  try {
    const result = await oneTimeReanalysisService.runOpenAiUpgradeReanalysis(
      (progress) => {
        console.log(
          `[OneTimeReanalysis] Progress: ${progress.processed}/${progress.total}` +
            ` (upgraded=${progress.upgraded}, skipped=${progress.skipped}, failed=${progress.failed})` +
            (progress.currentReportId ? ` — ${progress.currentReportId}` : "")
        );
      }
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "OpenAI upgrade reanalysis failed",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const [status, running] = await Promise.all([
    oneTimeReanalysisService.getUpgradeStatus(),
    Promise.resolve(oneTimeReanalysisService.isRunning()),
  ]);

  return NextResponse.json({
    running,
    ...status,
  });
}
