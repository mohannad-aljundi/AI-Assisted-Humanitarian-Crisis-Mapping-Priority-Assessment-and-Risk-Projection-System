import type { PriorityLevel } from "@prisma/client";

export type CorrelationVerificationStatus =
  | "Pending Review"
  | "Partially Verified"
  | "Multi-source Verified"
  | "Independently Confirmed"
  | "High Confidence";

const VERIFIED_CORRELATION_STATUSES = new Set<CorrelationVerificationStatus>([
  "Partially Verified",
  "Multi-source Verified",
  "Independently Confirmed",
  "High Confidence",
]);

export function isVerifiedCorrelationStatus(
  status: string | null | undefined
): status is CorrelationVerificationStatus {
  return (
    typeof status === "string" &&
    VERIFIED_CORRELATION_STATUSES.has(status as CorrelationVerificationStatus)
  );
}

const TRUSTED_SOURCE_MIN_CREDIBILITY = 0.55;

export function isTrustedSource(name: string, credibility: number): boolean {
  const lower = name.toLowerCase();
  if (
    lower.includes("un ocha") ||
    lower.includes("reliefweb") ||
    lower.includes("reuters") ||
    lower.includes("who") ||
    lower.includes("unicef") ||
    lower.includes("wfp") ||
    lower.includes("icrc")
  ) {
    return true;
  }
  return credibility >= TRUSTED_SOURCE_MIN_CREDIBILITY;
}

export function resolveCorrelationVerificationStatus(params: {
  independentSourceCount: number;
  trustedIndependentCount: number;
  sourceAgreementPercent: number;
  evidenceStrength: number;
}): CorrelationVerificationStatus {
  const {
    independentSourceCount,
    trustedIndependentCount,
    sourceAgreementPercent,
    evidenceStrength,
  } = params;

  if (independentSourceCount <= 1) {
    return "Pending Review";
  }

  if (
    trustedIndependentCount >= 5 &&
    sourceAgreementPercent >= 80 &&
    evidenceStrength >= 0.75
  ) {
    return "High Confidence";
  }

  if (
    trustedIndependentCount >= 5 &&
    sourceAgreementPercent >= 70
  ) {
    return "Independently Confirmed";
  }

  if (trustedIndependentCount >= 3 && sourceAgreementPercent >= 60) {
    return "Multi-source Verified";
  }

  if (independentSourceCount >= 2 && sourceAgreementPercent >= 50) {
    return "Partially Verified";
  }

  return "Pending Review";
}

export function scoreToPriorityLevel(score: number): PriorityLevel {
  if (score >= 0.82) return "Critical";
  if (score >= 0.62) return "High";
  if (score >= 0.38) return "Medium";
  return "Low";
}

export const CORRELATION_STATUS_STYLES: Record<CorrelationVerificationStatus, string> = {
  "Pending Review": "border-slate-500/30 bg-slate-500/10 text-slate-300",
  "Partially Verified": "border-amber-500/30 bg-amber-500/10 text-amber-200",
  "Multi-source Verified": "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  "Independently Confirmed": "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "High Confidence": "border-violet-500/30 bg-violet-500/10 text-violet-200",
};
