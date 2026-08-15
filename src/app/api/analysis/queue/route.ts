import { NextResponse } from "next/server";
import { queueSnapshotService } from "@/services/queueSnapshotService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const queue = await queueSnapshotService.getSnapshot();
    return NextResponse.json(queue);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load queue snapshot",
      },
      { status: 500 }
    );
  }
}
