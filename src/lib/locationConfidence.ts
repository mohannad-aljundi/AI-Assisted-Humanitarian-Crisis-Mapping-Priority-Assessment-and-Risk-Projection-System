export type LocationValidationStatus =
  | "verified"
  | "geocoded"
  | "unverified"
  | "rejected"
  | "pending";

export interface ValidatedLocation {
  name: string;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
  validationStatus: LocationValidationStatus;
}

export function encodeLocationMeta(
  confidence: number,
  status: LocationValidationStatus
): string {
  return JSON.stringify({ confidence: Math.round(confidence * 100) / 100, status });
}

export function decodeLocationMeta(
  severity: string | null | undefined
): { confidence: number; validationStatus: LocationValidationStatus } | null {
  if (!severity) return null;
  try {
    const parsed = JSON.parse(severity) as {
      confidence?: number;
      status?: LocationValidationStatus;
    };
    if (typeof parsed.confidence === "number" && parsed.status) {
      return {
        confidence: parsed.confidence,
        validationStatus: parsed.status,
      };
    }
  } catch {
    // Legacy plain severity values
  }
  return null;
}

export function isLowConfidenceLocation(confidence: number): boolean {
  return confidence < 0.5;
}
