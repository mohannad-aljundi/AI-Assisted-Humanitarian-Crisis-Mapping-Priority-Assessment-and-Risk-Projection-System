/**
 * Measures server response times for navigation-critical routes.
 * Run while dev server is up: node scripts/perf-measure-endpoints.mjs
 */
const BASE = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const REPORT_ID = process.env.PERF_REPORT_ID ?? "";

const ENDPOINTS = [
  "/dashboard",
  "/api/dashboard/panels",
  "/api/dashboard/summary",
  "/api/map/summary?readOnly=true",
  ...(REPORT_ID
    ? [
        `/incidents/${REPORT_ID}`,
        `/api/incidents/${REPORT_ID}/deferred`,
        `/api/reports/${REPORT_ID}/learning/similar`,
      ]
    : []),
];

async function measure(path) {
  const url = `${BASE}${path}`;
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: path.includes("/run") || path.includes("reanalyze") || path.includes("backfill") ? "GET" : "GET",
      signal: AbortSignal.timeout(120_000),
    });
    const body = await res.arrayBuffer();
    return {
      path,
      status: res.status,
      ms: Math.round(performance.now() - start),
      bytes: body.byteLength,
    };
  } catch (error) {
    return {
      path,
      status: "error",
      ms: Math.round(performance.now() - start),
      bytes: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const results = [];
for (const path of ENDPOINTS) {
  results.push(await measure(path));
}

console.log(JSON.stringify({ base: BASE, reportId: REPORT_ID, results }, null, 2));
