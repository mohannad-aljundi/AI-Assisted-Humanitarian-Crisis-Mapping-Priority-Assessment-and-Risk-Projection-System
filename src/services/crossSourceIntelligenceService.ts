import { roundTo } from "@/lib/utils";
import {
  assessEvidenceVerification,
} from "@/lib/evidenceVerificationStatus";
import type { CrossSourceAnalysis, SourceVerificationSummary } from "@/types";

export interface CrossSourceInput {
  primarySourceName: string;
  primaryReliability: number;
  verification: SourceVerificationSummary | null;
  fusedSourceCount?: number;
  contradictions?: string[];
}

const METHOD_LABELS: Record<string, string> = {
  AI: "AI extraction",
  GEONAMES: "GeoNames",
  NOMINATIM: "Nominatim",
  DATABASE: "database cache",
  COUNTRY_CENTROID: "country centroid",
};

export function buildLocationReasoningFromResolution(params: {
  displayName: string;
  resolutionSource: string;
  confidenceScore: number;
  locationPending: boolean;
  locationApproximate: boolean;
  rawLocationText?: string;
}): import("@/types").LocationReasoning {
  const confidencePercent = Math.round(params.confidenceScore * 100);
  const methodLabel =
    METHOD_LABELS[params.resolutionSource.toUpperCase()] ??
    params.resolutionSource;

  if (params.locationPending) {
    return {
      status: "pending",
      method: null,
      confidencePercent,
      narrative:
        `Location "${params.displayName}" remains ambiguous. ` +
        `The place name may refer to multiple jurisdictions or the source lacks sufficient geographic detail for confident geocoding.`,
      steps: [
        `Extracted location candidate: "${params.rawLocationText ?? params.displayName}"`,
        "Geocoding did not return a unique high-confidence match",
        "Coordinates withheld pending verification to avoid map misplacement",
      ],
    };
  }

  if (params.locationApproximate) {
    return {
      status: "approximate",
      method: methodLabel,
      confidencePercent,
      narrative:
        `Coordinates resolved at approximate precision (${confidencePercent}% confidence) via ${methodLabel}. ` +
        `Country-level or regional centroid used when city-level geocoding was insufficient.`,
      steps: [
        `Location text: "${params.rawLocationText ?? params.displayName}"`,
        `Resolution method: ${methodLabel}`,
        `Country validation applied — confidence ${confidencePercent}%`,
      ],
    };
  }

  return {
    status: "resolved",
    method: methodLabel,
    confidencePercent,
    narrative:
      `Location "${params.displayName}" resolved with ${confidencePercent}% confidence via ${methodLabel}. ` +
      `Coordinates validated against country context and geocoding consensus.`,
    steps: [
      `AI/text extraction identified: "${params.rawLocationText ?? params.displayName}"`,
      `${methodLabel} returned coordinates`,
      `Country validation passed — confidence ${confidencePercent}%`,
    ],
  };
}

export class CrossSourceIntelligenceService {
  analyze(input: CrossSourceInput): CrossSourceAnalysis {
    const sources = input.verification?.sourceNames?.length
      ? [...new Set(input.verification.sourceNames)]
      : [input.primarySourceName];

    const agreementPercent = input.verification
      ? Math.max(
          input.verification.sourceConsensusPercentage,
          input.verification.consensusScore
        )
      : 0;

    const comparedSources = input.verification?.comparedSources ?? 1;
    const contradictions =
      input.contradictions ??
      (input.verification?.verificationStatus === "Conflicting Sources"
        ? ["Sources report inconsistent casualty figures or event details"]
        : []);

    const evidence = assessEvidenceVerification({
      independentSourceCount: comparedSources,
      agreementPercent,
      primarySourceName: input.primarySourceName,
      primaryCredibility: input.primaryReliability,
      corroboratingSourceNames: sources,
      contradictions,
    });
    const status = evidence.status;

    let reliabilityDelta: CrossSourceAnalysis["reliabilityDelta"] = null;
    if (comparedSources >= 2 && input.verification) {
      const boost = roundTo(
        (input.verification.finalConfidenceScore / 100) * 0.15
      );
      const before = roundTo(input.primaryReliability);
      const after = roundTo(Math.min(1, before + boost));
      if (after > before) {
        reliabilityDelta = {
          before: Math.round(before * 100),
          after: Math.round(after * 100),
        };
      }
    }

    const narrative = this.buildNarrative({
      sources,
      agreementPercent,
      comparedSources,
      status,
      reliabilityDelta,
      contradictions,
      fusedSourceCount: input.fusedSourceCount ?? comparedSources,
    });

    return {
      sources,
      agreementPercent,
      reliabilityDelta,
      narrative,
      contradictions,
      status,
    };
  }

  private buildNarrative(params: {
    sources: string[];
    agreementPercent: number;
    comparedSources: number;
    status: string;
    reliabilityDelta: CrossSourceAnalysis["reliabilityDelta"];
    contradictions: string[];
    fusedSourceCount: number;
  }): string {
    if (params.comparedSources < 2) {
      return (
        `Single-source assessment from ${params.sources[0]}. ` +
        `Cross-source corroboration not yet available — reliability reflects source credibility and internal consistency only. ` +
        `Additional independent reports (e.g. UN OCHA, ReliefWeb, Reuters) would strengthen confidence.`
      );
    }

    const sourceList = params.sources.slice(0, 5).join(", ");
    let narrative =
      `${params.comparedSources} sources analysed (${sourceList}) with ${params.agreementPercent}% narrative agreement. `;

    if (params.reliabilityDelta) {
      narrative +=
        `Multi-source corroboration increased reliability from ${params.reliabilityDelta.before}% to ${params.reliabilityDelta.after}%. `;
    }

    if (params.status === "Conflicting Sources") {
      narrative +=
        `However, sources contradict on key facts — ${params.contradictions[0] ?? "casualty or event details conflict"}. ` +
        `Confidence is discounted until reconciliation.`;
    } else if (params.agreementPercent >= 75) {
      narrative += `Strong cross-source alignment supports the assessed severity and location.`;
    } else if (params.agreementPercent >= 50) {
      narrative += `Partial agreement — some details differ between sources but core event is corroborated.`;
    } else {
      narrative += `Limited agreement between sources — treat details with caution.`;
    }

    if (params.fusedSourceCount > params.comparedSources) {
      narrative += ` ${params.fusedSourceCount} reports merged into this crisis incident.`;
    }

    return narrative.trim();
  }
}

export const crossSourceIntelligenceService = new CrossSourceIntelligenceService();
