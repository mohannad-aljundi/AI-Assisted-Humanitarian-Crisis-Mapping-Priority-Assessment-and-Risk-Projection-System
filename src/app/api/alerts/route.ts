import { NextRequest, NextResponse } from "next/server";
import { alertService } from "@/services/alertService";

export const dynamic = "force-dynamic";

function parseNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parseNumber(params.get("page"), 1);
  const limit = parseNumber(params.get("limit"), 25);

  const result = await alertService.listAlerts({ page, limit });
  return NextResponse.json(result);
}
