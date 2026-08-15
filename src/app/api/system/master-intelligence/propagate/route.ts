import { NextResponse } from "next/server";
import { masterIncidentPropagationService } from "@/services/masterIncidentPropagationService";

export const dynamic = "force-dynamic";

let running = false;

export async function POST() {
  if (running) {
    return NextResponse.json(
      { error: "Master incident propagation already in progress" },
      { status: 409 }
    );
  }

  running = true;
  try {
    const result = await masterIncidentPropagationService.propagateAllLinkedReports();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Master incident propagation failed",
      },
      { status: 500 }
    );
  } finally {
    running = false;
  }
}

export async function GET() {
  return NextResponse.json({ running });
}
