import { NextResponse } from "next/server";
import { correlationBackfillService } from "@/services/correlationBackfillService";

export const dynamic = "force-dynamic";

export async function POST() {
  if (correlationBackfillService.isRunning()) {
    return NextResponse.json(
      { error: "Correlation backfill already in progress" },
      { status: 409 }
    );
  }

  try {
    const result = await correlationBackfillService.backfillAllReports({ reset: true });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Correlation backfill failed",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    running: correlationBackfillService.isRunning(),
  });
}
