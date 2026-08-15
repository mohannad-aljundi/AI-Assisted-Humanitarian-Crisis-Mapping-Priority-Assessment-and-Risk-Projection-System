import { NextResponse } from "next/server";
import { analysisLiveService } from "@/services/analysisLiveService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [items, queue] = await Promise.all([
      analysisLiveService.getRecentlyCompleted(10),
      analysisLiveService.getQueueSnapshot(),
    ]);
    return NextResponse.json({ items, queue });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load recent analyses",
        items: [],
        queue: null,
      },
      { status: 500 }
    );
  }
}
