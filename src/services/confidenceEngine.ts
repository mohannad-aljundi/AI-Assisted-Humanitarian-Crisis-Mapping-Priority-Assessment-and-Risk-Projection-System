import { clamp, roundTo } from "@/lib/utils";
import { hasSafeCoordinates } from "@/lib/coordinates";
import type { NLPAnalysisResult, ReliabilityResult, SourceVerificationSummary } from "@/types";

export interface ConfidenceFactor {
  id: string;
  label: string;
  score: number;
  weight: number;
  weightedScore: number;
  detail: string;
}

export interface ConfidenceAssessment {
  overallScore: number;
  level: string;
  factors: ConfidenceFactor[];
  breakdown: Record<string, number>;
  missingFields: string[];
  conflicts: string[];
}

const FACTOR_WEIGHTS = {
  sourceCredibility: 0.2,
  entityExtraction: 0.12,
  locationConfidence: 0.15,
  crossSourceAgreement: 0.15,
  aiConfidence: 0.1,
  completeness: 0.13,
  reliability: 0.15,
} as const;

export class ConfidenceEngine {
  assess(params: {
    nlp: NLPAnalysisResult;
    reliability: ReliabilityResult;
    content: string;
    extractionMethod?: string | null;
    fieldConfidences?: Record<string, number>;
    verification?: SourceVerificationSummary | null;
    entityCount?: number;
  }): ConfidenceAssessment {
    const missingFields: string[] = [];
    const conflicts: string[] = [];

    if (!params.nlp.crisisType) missingFields.push("crisis type");
    if (params.nlp.locations.length === 0) missingFields.push("location");
    if (params.nlp.humanitarianNeeds.length === 0) missingFields.push("humanitarian needs");
    if (params.nlp.affectedPopulation === null) missingFields.push("affected population");

    if (params.verification?.verificationStatus === "Conflicting Sources") {
      conflicts.push("Multiple sources report inconsistent details");
    }

    const normalised = params.content.toLowerCase();
    if (
      (normalised.includes("unconfirmed") || normalised.includes("allegedly")) &&
      normalised.includes("confirmed")
    ) {
      conflicts.push("Mixed certainty language in source text");
    }

    const sourceScore = params.reliability.sourceScore;
    const entityScore = this.scoreEntityExtraction(params.nlp, params.entityCount ?? 0);
    const locationScore = this.scoreLocation(params.nlp);
    const crossSourceScore = params.verification
      ? clamp(params.verification.finalConfidenceScore / 100, 0, 1)
      : params.reliability.finalScore * 0.6;
    const aiScore =
      params.extractionMethod === "ai" || params.extractionMethod === "hybrid"
        ? 0.75
        : params.extractionMethod === "rules"
          ? 0.55
          : 0.45;
    const completenessScore = clamp(1 - missingFields.length * 0.15, 0.2, 1);
    const reliabilityScore = params.reliability.finalScore;

    const factors: ConfidenceFactor[] = [
      {
        id: "sourceCredibility",
        label: "Source credibility",
        score: sourceScore,
        weight: FACTOR_WEIGHTS.sourceCredibility,
        weightedScore: sourceScore * FACTOR_WEIGHTS.sourceCredibility,
        detail:
          sourceScore >= 0.75
            ? "Credible source material supports the assessment"
            : sourceScore >= 0.5
              ? "Source credibility is moderate"
              : "Limited source credibility",
      },
      {
        id: "entityExtraction",
        label: "Entity extraction",
        score: entityScore,
        weight: FACTOR_WEIGHTS.entityExtraction,
        weightedScore: entityScore * FACTOR_WEIGHTS.entityExtraction,
        detail:
          params.entityCount && params.entityCount >= 3
            ? "Multiple humanitarian indicators identified"
            : "Limited structured information extracted",
      },
      {
        id: "locationConfidence",
        label: "Location confidence",
        score: locationScore,
        weight: FACTOR_WEIGHTS.locationConfidence,
        weightedScore: locationScore * FACTOR_WEIGHTS.locationConfidence,
        detail:
          params.nlp.locations[0]?.validationStatus === "verified"
            ? "Location verified"
            : params.nlp.locations[0]?.validationStatus === "pending"
              ? "Location pending verification"
              : "Location confidence is moderate",
      },
      {
        id: "crossSourceAgreement",
        label: "Cross-source agreement",
        score: crossSourceScore,
        weight: FACTOR_WEIGHTS.crossSourceAgreement,
        weightedScore: crossSourceScore * FACTOR_WEIGHTS.crossSourceAgreement,
        detail: params.verification
          ? params.verification.comparedSources >= 2
            ? "Cross-source agreement supports confidence"
            : "Limited cross-source corroboration"
          : "Single source — awaiting corroboration",
      },
      {
        id: "aiConfidence",
        label: "AI extraction confidence",
        score: aiScore,
        weight: FACTOR_WEIGHTS.aiConfidence,
        weightedScore: aiScore * FACTOR_WEIGHTS.aiConfidence,
        detail:
          params.extractionMethod === "ai" || params.extractionMethod === "hybrid"
            ? "AI confidence is high"
            : "Rule-based extraction used",
      },
      {
        id: "completeness",
        label: "Data completeness",
        score: completenessScore,
        weight: FACTOR_WEIGHTS.completeness,
        weightedScore: completenessScore * FACTOR_WEIGHTS.completeness,
        detail: missingFields.length === 0 ? "All key fields present" : `Missing: ${missingFields.join(", ")}`,
      },
      {
        id: "reliability",
        label: "Overall reliability",
        score: reliabilityScore,
        weight: FACTOR_WEIGHTS.reliability,
        weightedScore: reliabilityScore * FACTOR_WEIGHTS.reliability,
        detail:
          reliabilityScore >= 0.75
            ? "Overall reliability supports operational use"
            : "Reliability should be treated with caution",
      },
    ];

    let overallScore = factors.reduce((sum, f) => sum + f.weightedScore, 0);
    overallScore = clamp(overallScore - conflicts.length * 0.08, 0, 1);

    const breakdown: Record<string, number> = {};
    for (const factor of factors) {
      breakdown[factor.id] = roundTo(factor.weightedScore, 3);
    }

    return {
      overallScore: roundTo(overallScore),
      level: this.labelFromScore(overallScore),
      factors,
      breakdown,
      missingFields,
      conflicts,
    };
  }

  private scoreEntityExtraction(nlp: NLPAnalysisResult, entityCount: number): number {
    const entities = nlp.entities?.length ?? entityCount;
    if (entities >= 5) return 0.9;
    if (entities >= 2) return 0.7;
    if (entities >= 1) return 0.55;
    return 0.3;
  }

  private scoreLocation(nlp: NLPAnalysisResult): number {
    const loc = nlp.locations[0];
    if (!loc) return 0.15;
    if (loc.validationStatus === "verified" && hasSafeCoordinates(loc)) return 0.95;
    if (loc.validationStatus === "geocoded" && hasSafeCoordinates(loc)) return 0.75;
    if (loc.validationStatus === "pending") return 0.35;
    return loc.confidence ?? 0.5;
  }

  private labelFromScore(score: number): string {
    if (score >= 0.85) return "Very High";
    if (score >= 0.7) return "High";
    if (score >= 0.5) return "Medium";
    return "Low";
  }
}

export const confidenceEngine = new ConfidenceEngine();
