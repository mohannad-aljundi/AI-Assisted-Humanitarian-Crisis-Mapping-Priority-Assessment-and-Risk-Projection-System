import { NextResponse } from "next/server";
import { getIngestionSourcesStatus } from "@/lib/ingestionSourceRegistry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    sources: getIngestionSourcesStatus(),
  });
}
