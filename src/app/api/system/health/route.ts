import { NextResponse } from "next/server";
import { systemHealthService } from "@/services/systemHealthService";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await systemHealthService.getHealth();
  return NextResponse.json(health);
}
