import { NextResponse } from "next/server";
import { systemHealthService } from "@/services/systemHealthService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const report = await systemHealthService.runDiagnostics();
  return NextResponse.json(report);
}
