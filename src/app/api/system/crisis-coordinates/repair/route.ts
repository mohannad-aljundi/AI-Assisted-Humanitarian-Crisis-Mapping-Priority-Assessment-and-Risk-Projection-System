import { NextResponse } from "next/server";
import { crisisCoordinateRepairService } from "@/services/crisisCoordinateRepairService";
import { invalidateDashboardCache } from "@/services/dashboardRefreshService";

export const dynamic = "force-dynamic";

export async function POST() {
  if (crisisCoordinateRepairService.isRunning()) {
    return NextResponse.json(
      { error: "Crisis coordinate repair already in progress" },
      { status: 409 }
    );
  }

  try {
    const result = await crisisCoordinateRepairService.repairAll();
    invalidateDashboardCache("crisis coordinate repair complete");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Crisis coordinate repair failed",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    running: crisisCoordinateRepairService.isRunning(),
  });
}
