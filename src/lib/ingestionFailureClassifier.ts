export type IngestionFailureKind =
  | "duplicate"
  | "missing_coords"
  | "db_error"
  | "ai_invalid_json"
  | "unknown";

export interface ClassifiedIngestionFailure {
  kind: IngestionFailureKind;
  message: string;
}

function normalizeMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function classifyIngestionFailure(error: unknown): ClassifiedIngestionFailure {
  const message = normalizeMessage(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("valid json") ||
    lower.includes("ai output is not an object") ||
    lower.includes("invalid locations[") ||
    lower.includes("invalid incidents[")
  ) {
    return { kind: "ai_invalid_json", message };
  }

  if (
    lower.includes("prisma") ||
    lower.includes("database") ||
    lower.includes("postgres") ||
    lower.includes("foreign key") ||
    lower.includes("unique constraint")
  ) {
    return { kind: "db_error", message };
  }

  if (
    lower.includes("latitude") ||
    lower.includes("longitude") ||
    lower.includes("coordinates") ||
    lower.includes("no valid coordinates")
  ) {
    return { kind: "missing_coords", message };
  }

  return { kind: "unknown", message };
}
