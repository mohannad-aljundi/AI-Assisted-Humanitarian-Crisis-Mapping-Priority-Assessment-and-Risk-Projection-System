import { NextResponse } from "next/server";
import { resolvePendingLocations } from "@/services/locationResolver";

export async function POST() {
  try {
    const result = await resolvePendingLocations();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Location retry failed",
      },
      { status: 500 }
    );
  }
}
