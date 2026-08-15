import { NextResponse } from "next/server";
import { sourceHealthService } from "@/services/sourceHealthService";

export const dynamic = "force-dynamic";

export async function GET() {
  const statistics = await sourceHealthService.getStatistics();
  return NextResponse.json({ statistics });
}
