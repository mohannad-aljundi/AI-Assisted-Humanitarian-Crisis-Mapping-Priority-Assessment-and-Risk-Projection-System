import type { RiskLevel, RiskTrend } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clamp, roundTo } from "@/lib/utils";
import type { NLPAnalysisResult, PriorityResult, RiskProjectionResult } from "@/types";

export interface RiskHorizonProjection {
  label: string;
  hours: number;
  score: number;
  riskLevel: RiskLevel;
  trend: RiskTrend;
}

export interface RiskProjectionOutput extends RiskProjectionResult {
  currentScore: number;
  horizons: RiskHorizonProjection[];
  breakdown: Record<string, number>;
  reasoning: string[];
}

const RISK_LEVEL_SCORES: Record<RiskLevel, number> = {
  Low: 22,
  Medium: 42,
  High: 68,
  Critical: 88,
};

const ESCALATION_KEYWORDS = [
  "escalating",
  "worsening",
  "spreading",
  "increasing",
  "growing",
  "surge",
  "rising",
  "deteriorating",
];

const DEESCALATION_KEYWORDS = [
  "improving",
  "declining",
  "decreasing",
  "stabilising",
  "stabilizing",
  "recovering",
  "contained",
  "subsiding",
];

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "Critical";
  if (score >= 55) return "High";
  if (score >= 35) return "Medium";
  return "Low";
}

function determineTrend(content: string, historicalTrend?: RiskTrend | null): RiskTrend {
  const normalised = content.toLowerCase();
  const escalationHits = ESCALATION_KEYWORDS.filter((k) => normalised.includes(k)).length;
  const deescalationHits = DEESCALATION_KEYWORDS.filter((k) => normalised.includes(k)).length;

  if (escalationHits > deescalationHits + 1) return "Increasing";
  if (deescalationHits > escalationHits + 1) return "Decreasing";
  return historicalTrend ?? "Stable";
}

function projectHorizon(
  currentScore: number,
  trend: RiskTrend,
  hours: number,
  volatility: number
): number {
  const dailyFactor =
    trend === "Increasing" ? 1.06 + volatility * 0.04 : trend === "Decreasing" ? 0.96 - volatility * 0.02 : 1;
  const multiplier = Math.pow(dailyFactor, hours / 24);
  const noise = trend === "Stable" ? Math.sin(hours / 24) * 2 : 0;
  return clamp(Math.round(currentScore * multiplier + noise), 5, 98);
}

export class RiskProjectionEngine {
  project(
    nlp: NLPAnalysisResult,
    priority: PriorityResult,
    content: string,
    reliabilityScore = 0.5
  ): RiskProjectionOutput {
    const baseLevel = this.determineBaseRiskLevel(priority);
    let currentScore = RISK_LEVEL_SCORES[baseLevel];

    const casualtyBoost = /\b(\d[\d,]*)\s+(?:deaths?|killed|fatalities)\b/i.test(content)
      ? 12
      : 0;
    const escalationBoost = ESCALATION_KEYWORDS.some((k) => content.toLowerCase().includes(k)) ? 8 : 0;
    const needsBoost = nlp.humanitarianNeeds.filter((n) => n.severity === "Critical").length * 5;

    currentScore = clamp(currentScore + casualtyBoost + escalationBoost + needsBoost, 10, 95);

    const trend = determineTrend(content);
    const volatility = clamp(
      (priority.priorityScore / 100) * 0.5 + (nlp.humanitarianNeeds.length > 2 ? 0.2 : 0),
      0.1,
      0.8
    );

    const horizons: RiskHorizonProjection[] = [
      { label: "Current", hours: 0, score: currentScore, riskLevel: scoreToRiskLevel(currentScore), trend },
      {
        label: "24h",
        hours: 24,
        score: projectHorizon(currentScore, trend, 24, volatility),
        riskLevel: scoreToRiskLevel(projectHorizon(currentScore, trend, 24, volatility)),
        trend,
      },
      {
        label: "72h",
        hours: 72,
        score: projectHorizon(currentScore, trend, 72, volatility),
        riskLevel: scoreToRiskLevel(projectHorizon(currentScore, trend, 72, volatility)),
        trend,
      },
      {
        label: "7d",
        hours: 168,
        score: projectHorizon(currentScore, trend, 168, volatility),
        riskLevel: scoreToRiskLevel(projectHorizon(currentScore, trend, 168, volatility)),
        trend,
      },
    ];

    const confidenceScore = this.calculateConfidence(nlp, content, reliabilityScore);
    const reasoning = this.buildReasoning(nlp, priority, trend, currentScore, horizons);

    const breakdown: Record<string, number> = {
      baseFromPriority: RISK_LEVEL_SCORES[baseLevel],
      casualtyBoost,
      escalationBoost,
      needsBoost,
      volatility: roundTo(volatility, 2),
    };

    return {
      riskLevel: scoreToRiskLevel(currentScore),
      trend,
      confidenceScore,
      currentScore,
      horizons,
      breakdown,
      reasoning,
    };
  }

  async projectWithHistory(params: {
    nlp: NLPAnalysisResult;
    priority: PriorityResult;
    content: string;
    reliabilityScore?: number;
    crisisId?: string | null;
    locationId?: string | null;
    crisisType?: string | null;
  }): Promise<RiskProjectionOutput> {
    const base = this.project(
      params.nlp,
      params.priority,
      params.content,
      params.reliabilityScore ?? 0.5
    );

    let reportFrequencyBoost = 0;
    let historicalTrend: RiskTrend | null = null;

    if (params.crisisId) {
      const recentEvents = await prisma.crisisTimelineEvent.count({
        where: {
          crisisId: params.crisisId,
          occurredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      reportFrequencyBoost = Math.min(recentEvents * 3, 15);

      const priorRisk = await prisma.riskProjection.findFirst({
        where: { crisisId: params.crisisId },
        orderBy: { updatedAt: "desc" },
      });
      if (priorRisk) historicalTrend = priorRisk.trend;
    } else if (params.locationId && params.crisisType) {
      const recentReports = await prisma.report.count({
        where: {
          reportDate: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          crisis: { crisisType: params.crisisType, locationId: params.locationId },
        },
      });
      reportFrequencyBoost = Math.min(recentReports * 2, 12);
    }

    const trend = determineTrend(params.content, historicalTrend);
    const adjustedCurrent = clamp(base.currentScore + reportFrequencyBoost, 10, 98);
    const volatility = clamp(base.breakdown.volatility ?? 0.3 + reportFrequencyBoost / 50, 0.1, 0.9);

    const horizons: RiskHorizonProjection[] = [
      { label: "Current", hours: 0, score: adjustedCurrent, riskLevel: scoreToRiskLevel(adjustedCurrent), trend },
      {
        label: "24h",
        hours: 24,
        score: projectHorizon(adjustedCurrent, trend, 24, volatility),
        riskLevel: scoreToRiskLevel(projectHorizon(adjustedCurrent, trend, 24, volatility)),
        trend,
      },
      {
        label: "72h",
        hours: 72,
        score: projectHorizon(adjustedCurrent, trend, 72, volatility),
        riskLevel: scoreToRiskLevel(projectHorizon(adjustedCurrent, trend, 72, volatility)),
        trend,
      },
      {
        label: "7d",
        hours: 168,
        score: projectHorizon(adjustedCurrent, trend, 168, volatility),
        riskLevel: scoreToRiskLevel(projectHorizon(adjustedCurrent, trend, 168, volatility)),
        trend,
      },
    ];

    const reasoning = [
      ...base.reasoning,
      ...(reportFrequencyBoost > 0
        ? [`${reportFrequencyBoost > 6 ? "Elevated" : "Moderate"} report frequency in region (+${reportFrequencyBoost} risk points)`]
        : []),
    ];

    return {
      ...base,
      riskLevel: scoreToRiskLevel(adjustedCurrent),
      trend,
      currentScore: adjustedCurrent,
      horizons,
      breakdown: { ...base.breakdown, reportFrequencyBoost, historicalTrend: historicalTrend ? 1 : 0 },
      reasoning,
    };
  }

  private determineBaseRiskLevel(priority: PriorityResult): RiskLevel {
    return priority.priorityLevel;
  }

  private calculateConfidence(
    nlp: NLPAnalysisResult,
    content: string,
    reliabilityScore: number
  ): number {
    let confidence = 0.35 + reliabilityScore * 0.25;
    if (nlp.locations.length > 0) confidence += 0.12;
    if (nlp.crisisType) confidence += 0.1;
    if (nlp.humanitarianNeeds.length > 0) confidence += 0.08;
    if (nlp.affectedPopulation !== null) confidence += 0.08;
    if (content.length >= 200) confidence += 0.05;
    return roundTo(clamp(confidence, 0, 1));
  }

  private buildReasoning(
    nlp: NLPAnalysisResult,
    priority: PriorityResult,
    trend: RiskTrend,
    currentScore: number,
    horizons: RiskHorizonProjection[]
  ): string[] {
    const reasons: string[] = [
      `Base risk derived from ${priority.priorityLevel} priority (score ${currentScore}/100)`,
      `Trend assessment: ${trend}`,
    ];
    if (nlp.crisisType) reasons.push(`Crisis type: ${nlp.crisisType}`);
    const delta24 = horizons[1]!.score - horizons[0]!.score;
    if (Math.abs(delta24) >= 3) {
      reasons.push(
        `24h forecast ${delta24 > 0 ? "increases" : "decreases"} by ${Math.abs(delta24)} points`
      );
    }
    if (priority.reasons.length > 0) {
      reasons.push(`Key driver: ${priority.reasons[0]}`);
    }
    return reasons;
  }
}

export const riskProjectionEngine = new RiskProjectionEngine();
