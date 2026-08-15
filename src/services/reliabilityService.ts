import { clamp, roundTo } from "@/lib/utils";
import type { ReliabilityResult } from "@/types";

const DEFAULT_SOURCE_SCORE = 0.5;

export class ReliabilityService {
  assess(
    content: string,
    reportDate: Date,
    sourceCredibilityScore?: number
  ): ReliabilityResult {
    const sourceScore = clamp(
      sourceCredibilityScore ?? DEFAULT_SOURCE_SCORE,
      0,
      1
    );
    const recencyScore = this.calculateRecencyScore(reportDate);
    const consistencyScore = this.calculateConsistencyScore(content);

    const finalScore = roundTo(
      sourceScore * 0.4 + recencyScore * 0.3 + consistencyScore * 0.3
    );

    return {
      sourceScore: roundTo(sourceScore),
      consistencyScore: roundTo(consistencyScore),
      recencyScore: roundTo(recencyScore),
      finalScore,
    };
  }

  private calculateRecencyScore(reportDate: Date): number {
    const now = Date.now();
    const ageMs = now - reportDate.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays <= 1) return 1;
    if (ageDays <= 7) return 0.85;
    if (ageDays <= 30) return 0.65;
    if (ageDays <= 90) return 0.45;
    if (ageDays <= 180) return 0.3;
    return 0.15;
  }

  private calculateConsistencyScore(content: string): number {
    let score = 0.5;
    const normalised = content.toLowerCase();

    const specificityIndicators = [
      /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/,
      /\d+(\.\d+)?\s*(km|kilometres|kilometers|miles)/,
      /according to/,
      /verified/,
      /confirmed/,
      /witness/,
    ];

    for (const pattern of specificityIndicators) {
      if (pattern.test(normalised)) {
        score += 0.08;
      }
    }

    const uncertaintyIndicators = [
      "unconfirmed",
      "rumour",
      "rumor",
      "allegedly",
      "possibly",
      "might",
      "unclear",
      "unknown",
    ];

    for (const indicator of uncertaintyIndicators) {
      if (normalised.includes(indicator)) {
        score -= 0.1;
      }
    }

    if (content.length >= 200) score += 0.05;
    if (content.length >= 500) score += 0.05;

    return clamp(score, 0, 1);
  }
}

export const reliabilityService = new ReliabilityService();
