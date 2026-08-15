import { invalidateCache } from "@/lib/simpleCache";
import { revalidatePath } from "next/cache";

const DASHBOARD_CACHE_KEYS = [
  "dashboard:core",
  "dashboard:panels",
  "dashboard:page",
  "dashboard:summary",
] as const;

function getWebAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    `http://localhost:${process.env.PORT ?? "3000"}`
  );
}

export function invalidateDashboardCache(
  reason: string,
  meta?: { reportId?: string; newestReportDate?: string | null }
): void {
  invalidateCache("dashboard:");
  invalidateCache("map:");
  invalidateCache("evaluation:");

  try {
    revalidatePath("/dashboard");
    revalidatePath("/crisis-map");
    revalidatePath("/alerts");
    revalidatePath("/evaluation");
    revalidatePath("/analysis");
  } catch {
    // revalidatePath only works in server actions / route handlers — safe to ignore elsewhere.
  }

  console.info(
    `[DashboardRefresh] ${reason}` +
      (meta?.reportId ? ` reportId=${meta.reportId}` : "") +
      (meta?.newestReportDate ? ` newestReportDate=${meta.newestReportDate}` : "")
  );
}

/** Worker process cannot clear the Next.js dev server in-memory cache — ping refresh API. */
export function notifyWebDashboardRefresh(
  reason: string,
  meta?: { reportId?: string; newestReportDate?: string | null }
): void {
  invalidateDashboardCache(reason, meta);

  if (process.env.WORKER_PROCESS !== "true") return;

  const url = `${getWebAppBaseUrl()}/api/dashboard/refresh`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...meta, reason }),
  }).catch((error) => {
    console.warn(
      "[DashboardRefresh] Web refresh ping failed:",
      error instanceof Error ? error.message : error
    );
  });
}

export function logDashboardCacheLookup(
  key: string,
  hit: boolean,
  meta?: { count?: number; newestReportId?: string; newestReportDate?: string }
): void {
  console.info(
    `[DashboardRefresh] cache ${hit ? "hit" : "miss"} key=${key}` +
      (meta?.count != null ? ` count=${meta.count}` : "") +
      (meta?.newestReportId ? ` newestReportId=${meta.newestReportId}` : "") +
      (meta?.newestReportDate ? ` newestReportDate=${meta.newestReportDate}` : "")
  );
}

export function logRecentIncidents(
  hit: boolean,
  incidents: Array<{ title: string; analysedAt: string }>
): void {
  const newest = incidents[0];
  console.info(
    `[RecentIncidents] cache ${hit ? "hit" : "miss"}` +
      ` returned count=${incidents.length}` +
      (newest ? ` newest report date=${newest.analysedAt}` : "") +
      (incidents.length > 0
        ? ` latest labels=${incidents
            .slice(0, 3)
            .map((item) => item.title.slice(0, 40))
            .join(" | ")}`
        : "")
  );
}

export function shouldBypassDashboardCache(searchParams?: URLSearchParams | null): boolean {
  if (!searchParams) return false;
  return searchParams.has("bust") || searchParams.get("refresh") === "1";
}

export { DASHBOARD_CACHE_KEYS };
