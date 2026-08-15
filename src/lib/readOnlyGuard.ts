const VIEW_PATH_PATTERNS = [
  /^\/incidents\/[^/]+$/,
  /^\/analysis\/[^/]+$/,
  /^\/evaluation$/,
  /^\/dashboard$/,
  /^\/alerts$/,
  /^\/analysis$/,
];

const BLOCKED_OPERATIONS = new Set([
  "analyseAndPersist",
  "reanalyzeExisting",
  "reanalyzeAll",
  // callAiJson must NEVER be blocked — background workers share this process.
  "analyse",
  "generateFinalReasoning",
  "validateLocations",
  "resolve",
  "runFusion",
  "inferWithAi",
]);

let readOnlyMode = false;
let activeRoute: string | null = null;

export function setReadOnlyRouteContext(route: string | null): void {
  activeRoute = route;
  readOnlyMode = route !== null && VIEW_PATH_PATTERNS.some((pattern) => pattern.test(route));
}

export function isReadOnlyViewPath(): boolean {
  return readOnlyMode;
}

export function assertWritePathAllowed(
  service: string,
  operation: string,
  detail?: string
): void {
  if (!readOnlyMode) return;

  if (BLOCKED_OPERATIONS.has(operation)) {
    console.warn("[READ-ONLY] Blocked write/analysis operation during view", {
      route: activeRoute,
      service,
      operation,
      detail,
    });
    throw new Error(
      `Read-only view path blocked ${service}.${operation}. Analysis must run only during ingestion or explicit re-analyze.`
    );
  }
}

export function warnIfWriteOnView(service: string, operation: string): void {
  if (!readOnlyMode) return;
  console.warn("[READ-ONLY] Unexpected operation on view path", {
    route: activeRoute,
    service,
    operation,
  });
}
