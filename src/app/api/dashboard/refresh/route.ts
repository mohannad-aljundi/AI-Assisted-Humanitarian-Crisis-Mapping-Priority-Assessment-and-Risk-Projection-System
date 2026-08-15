import { NextResponse } from "next/server";
import { invalidateDashboardCache } from "@/services/dashboardRefreshService";
import { reconcileProcessingState } from "@/services/processingStateReconciler";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let reportId: string | undefined;
  let newestReportDate: string | null | undefined;

  try {
    const body = (await request.json()) as {
      reportId?: string;
      newestReportDate?: string | null;
      reason?: string;
    };
    reportId = body.reportId;
    newestReportDate = body.newestReportDate;
  } catch {
    // empty body is fine
  }

  invalidateDashboardCache("report completed -> invalidating dashboard", {
    reportId,
    newestReportDate,
  });

  const reconcile = await reconcileProcessingState().catch(() => null);

  return NextResponse.json({
    ok: true,
    reconcile,
  });
}
