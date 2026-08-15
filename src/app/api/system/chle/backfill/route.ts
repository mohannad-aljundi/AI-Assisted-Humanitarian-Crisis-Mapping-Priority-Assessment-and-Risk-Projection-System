import { NextResponse } from "next/server";
import { chleBackfillService } from "@/services/chleBackfillService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  if (chleBackfillService.isRunning()) {
    return NextResponse.json(
      { error: "CHLE backfill already in progress" },
      { status: 409 }
    );
  }

  try {
    const result = await chleBackfillService.backfillLearningCases();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "CHLE backfill failed",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    running: chleBackfillService.isRunning(),
  });
}
