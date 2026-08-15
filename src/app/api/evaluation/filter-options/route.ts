import { NextResponse } from "next/server";
import { evaluationReportService } from "@/services/evaluationReportService";

export const dynamic = "force-dynamic";

export async function GET() {
  const options = await evaluationReportService.getFilterOptions();
  return NextResponse.json(options);
}
