import { GDELT_RATE_LIMIT_MESSAGE } from "@/lib/gdeltRequestQueue";

export class IngestionValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "IngestionValidationError";
  }
}

export class GdeltRateLimitError extends Error {
  readonly statusCode = 429;

  constructor(message: string = GDELT_RATE_LIMIT_MESSAGE) {
    super(message);
    this.name = "GdeltRateLimitError";
  }
}

export function getIngestionErrorStatus(error: unknown): number {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return 500;
}

export function normalizeIngestionError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("Failed to run ingestion");
}
