export type EvidenceVerificationStatus =
  | "Verified"
  | "Partially Corroborated"
  | "Single Source"
  | "Conflicting Sources"
  | "Insufficient Evidence";

export interface EvidenceVerificationAssessment {
  status: EvidenceVerificationStatus;
  reason: string;
}

const TRUSTED_ORG_EXAMPLES = "Reuters, UN OCHA, ReliefWeb";

export function normalizeLegacyVerificationStatus(
  status: string | undefined | null
): EvidenceVerificationStatus {
  switch (status) {
    case "Verified":
      return "Verified";
    case "Partially Verified":
    case "Partially Corroborated":
      return "Partially Corroborated";
    case "Conflicting Sources":
      return "Conflicting Sources";
    case "Insufficient Evidence":
      return "Insufficient Evidence";
    case "Single Source":
      return "Single Source";
    case "Pending Verification":
    default:
      return "Single Source";
  }
}

export function assessEvidenceVerification(params: {
  independentSourceCount: number;
  agreementPercent: number;
  primarySourceName: string;
  primaryCredibility: number;
  corroboratingSourceNames?: string[];
  contradictions?: string[];
}): EvidenceVerificationAssessment {
  const {
    independentSourceCount,
    agreementPercent,
    primarySourceName,
    primaryCredibility,
    corroboratingSourceNames = [],
    contradictions = [],
  } = params;

  const credibilityPct = Math.round(primaryCredibility * 100);
  const others = corroboratingSourceNames.filter((name) => name !== primarySourceName);

  if (
    contradictions.length > 0 ||
    (independentSourceCount >= 2 && agreementPercent < 50)
  ) {
    const detail =
      contradictions.length > 0
        ? ` Notable inconsistencies: ${contradictions.slice(0, 2).join("; ")}.`
        : "";
    return {
      status: "Conflicting Sources",
      reason:
        `Independent reports disagree on important details.${detail} ` +
        `Cross-source agreement is ${agreementPercent}%. Treat casualty figures, location, and severity as provisional until corroborated.`,
    };
  }

  if (independentSourceCount >= 2 && agreementPercent >= 75) {
    const corroboration =
      others.length > 0
        ? ` Corroborating outlets include ${others.slice(0, 3).join(", ")}.`
        : "";
    return {
      status: "Verified",
      reason:
        `Multiple independent trusted sources (${independentSourceCount} compared) show strong agreement (${agreementPercent}%).${corroboration} ` +
        `Core event details are supported by cross-source consistency, not a single narrative alone.`,
    };
  }

  if (independentSourceCount >= 2 && agreementPercent >= 50) {
    return {
      status: "Partially Corroborated",
      reason:
        `Some supporting evidence exists from ${independentSourceCount} sources with ${agreementPercent}% agreement, but not all details align. ` +
        `Additional confirmation from independent organisations is recommended before high-stakes operational decisions.`,
    };
  }

  if (primaryCredibility < 0.3 && independentSourceCount <= 1) {
    return {
      status: "Insufficient Evidence",
      reason:
        `There is currently not enough independent evidence to validate this incident. ` +
        `Only "${primarySourceName}" contributes usable reporting and its credibility is low (${credibilityPct}%). ` +
        `No corroborating reports from additional trusted organisations have been identified.`,
    };
  }

  return {
    status: "Single Source",
    reason:
      `This assessment is currently based on one independent source only ("${primarySourceName}"). ` +
      `No corroborating reports from additional trusted organisations (${TRUSTED_ORG_EXAMPLES}, etc.) have been identified yet. ` +
      `Reliability is therefore based mainly on source credibility (${credibilityPct}%) rather than cross-source agreement.`,
  };
}

export const EVIDENCE_STATUS_STYLES: Record<EvidenceVerificationStatus, string> = {
  Verified: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "Partially Corroborated": "border-amber-500/30 bg-amber-500/10 text-amber-200",
  "Single Source": "border-slate-500/30 bg-slate-500/10 text-slate-200",
  "Conflicting Sources": "border-red-500/30 bg-red-500/10 text-red-300",
  "Insufficient Evidence": "border-orange-500/30 bg-orange-500/10 text-orange-200",
};
