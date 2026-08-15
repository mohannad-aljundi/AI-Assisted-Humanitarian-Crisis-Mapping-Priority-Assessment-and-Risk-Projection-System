import { OFFICIAL_SOURCE_PATTERNS } from "@/lib/intelligenceConstants";
import { clamp, roundTo } from "@/lib/utils";
import type { ReliabilityResult, SourceVerificationSummary } from "@/types";
import { reliabilityService } from "@/services/reliabilityService";

export interface ReliabilityFactor {
  id: string;
  label: string;
  score: number;
  weight: number;
  weightedScore: number;
  evidence: string;
}

export interface ReliabilityAssessmentOutput extends ReliabilityResult {
  factors: ReliabilityFactor[];
  breakdown: Record<string, number>;
  evidence: string[];
}

export class ReliabilityEngine {
  assess(params: {
    content: string;
    reportDate: Date;
    sourceCredibility?: number;
    sourceName?: string;
    verification?: SourceVerificationSummary | null;
    duplicateConfirmed?: boolean;
    locationVerified?: boolean;
  }): ReliabilityAssessmentOutput {
    const base = reliabilityService.assess(
      params.content,
      params.reportDate,
      params.sourceCredibility
    );

    const officialBoost = OFFICIAL_SOURCE_PATTERNS.some((pattern) =>
      pattern.test(`${params.sourceName ?? ""} ${params.content}`)
    )
      ? 0.1
      : 0;

    const crossSourceScore = params.verification
      ? clamp(params.verification.finalConfidenceScore / 100, 0, 1)
      : 0.4;

    const duplicateBoost = params.duplicateConfirmed ? 0.08 : 0;
    const locationBoost = params.locationVerified ? 0.06 : 0;
    const completenessScore = this.scoreCompleteness(params.content);

    const factors: ReliabilityFactor[] = [
      {
        id: "sourceCredibility",
        label: "Source credibility",
        score: base.sourceScore,
        weight: 0.25,
        weightedScore: base.sourceScore * 0.25,
        evidence: params.sourceName ? `Source: ${params.sourceName}` : "Unknown source",
      },
      {
        id: "recency",
        label: "Publication recency",
        score: base.recencyScore,
        weight: 0.15,
        weightedScore: base.recencyScore * 0.15,
        evidence:
          base.recencyScore >= 0.7
            ? "Recent publication strengthens reliability"
            : "Older publication reduces recency weight",
      },
      {
        id: "consistency",
        label: "Fact consistency",
        score: base.consistencyScore,
        weight: 0.15,
        weightedScore: base.consistencyScore * 0.15,
        evidence:
          base.consistencyScore >= 0.7
            ? "Strong semantic consistency in the report"
            : "Some internal inconsistency detected",
      },
      {
        id: "crossSource",
        label: "Cross-source agreement",
        score: crossSourceScore,
        weight: 0.2,
        weightedScore: crossSourceScore * 0.2,
        evidence: params.verification
          ? crossSourceScore >= 0.75
            ? `Cross-source agreement is high among ${params.verification.sourceNames.slice(0, 3).join(", ")}`
            : `Limited agreement across ${params.verification.comparedSources} sources`
          : "Awaiting corroboration from additional sources",
      },
      {
        id: "officialSource",
        label: "Official source weighting",
        score: officialBoost > 0 ? 0.9 : 0.3,
        weight: 0.1,
        weightedScore: (officialBoost > 0 ? 0.9 : 0.3) * 0.1,
        evidence: officialBoost > 0 ? "Official/UN agency indicators detected" : "No official source markers",
      },
      {
        id: "duplicateConfirmation",
        label: "Duplicate confirmation",
        score: params.duplicateConfirmed ? 0.85 : 0.4,
        weight: 0.05,
        weightedScore: (params.duplicateConfirmed ? 0.85 : 0.4) * 0.05,
        evidence: params.duplicateConfirmed
          ? "Corroborated by similar reports"
          : "Single-report assessment",
      },
      {
        id: "locationVerification",
        label: "Location verification",
        score: params.locationVerified ? 0.9 : 0.45,
        weight: 0.05,
        weightedScore: (params.locationVerified ? 0.9 : 0.45) * 0.05,
        evidence: params.locationVerified ? "Location geocoded/verified" : "Location pending verification",
      },
      {
        id: "completeness",
        label: "Fact completeness",
        score: completenessScore,
        weight: 0.05,
        weightedScore: completenessScore * 0.05,
        evidence: `Detail density score: ${Math.round(completenessScore * 100)}%`,
      },
    ];

    let finalScore = factors.reduce((sum, f) => sum + f.weightedScore, 0);
    if (params.verification?.verificationStatus === "Conflicting Sources") {
      finalScore = clamp(finalScore - 0.12, 0, 1);
    }

    const breakdown: Record<string, number> = {};
    const evidence: string[] = [];
    for (const factor of factors) {
      breakdown[factor.id] = roundTo(factor.weightedScore, 3);
      if (factor.evidence) evidence.push(`${factor.label}: ${factor.evidence}`);
    }

    return {
      sourceScore: base.sourceScore,
      consistencyScore: base.consistencyScore,
      recencyScore: base.recencyScore,
      finalScore: roundTo(clamp(finalScore, 0, 1)),
      factors,
      breakdown,
      evidence,
    };
  }

  private scoreCompleteness(content: string): number {
    let score = 0.4;
    if (content.length >= 200) score += 0.15;
    if (content.length >= 500) score += 0.1;
    if (/\d+/.test(content)) score += 0.1;
    if (/\b(according to|reported|confirmed)\b/i.test(content)) score += 0.1;
    return clamp(score, 0, 1);
  }
}

export const reliabilityEngine = new ReliabilityEngine();
