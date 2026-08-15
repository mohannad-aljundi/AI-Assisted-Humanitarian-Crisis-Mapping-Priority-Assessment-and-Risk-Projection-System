import { NextResponse } from "next/server";
import { masterIncidentIntelligenceMigrationService } from "@/services/masterIncidentIntelligenceMigrationService";

export const dynamic = "force-dynamic";

export async function POST() {
  if (masterIncidentIntelligenceMigrationService.isRunning()) {
    return NextResponse.json(
      { error: "Master incident intelligence migration already in progress" },
      { status: 409 }
    );
  }

  try {
    const result = await masterIncidentIntelligenceMigrationService.runOneTimeMigration();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Master incident intelligence migration failed",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const status = await masterIncidentIntelligenceMigrationService.getStatus();
  return NextResponse.json({
    running: masterIncidentIntelligenceMigrationService.isRunning(),
    ...status,
  });
}
