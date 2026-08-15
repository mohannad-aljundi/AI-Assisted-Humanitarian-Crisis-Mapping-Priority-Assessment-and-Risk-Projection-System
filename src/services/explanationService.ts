import { clamp, roundTo } from "@/lib/utils";
import { hasSafeCoordinates } from "@/lib/coordinates";
import type {
  AssessmentExplanation,
  ExtendedAnalysisInsight,
  NLPAnalysisResult,
  PriorityResult,
  ReliabilityResult,
  RiskProjectionResult,
} from "@/types";

const SENTIMENT_POSITIVE = ["recovery", "improved", "stabilised", "stabilized", "aid delivered", "ceasefire"];
const SENTIMENT_NEGATIVE = ["devastating", "catastrophic", "critical", "urgent", "escalat", "worsen", "severe"];
const URGENCY_KEYWORDS = ["urgent", "immediate", "emergency", "critical", "now", "rapidly"];
const THREAT_KEYWORDS = ["attack", "shelling", "airstrike", "violence", "armed", "bombing", "threat"];
const INFRA_KEYWORDS = ["destroyed", "damaged", "collapsed", "infrastructure", "hospital destroyed", "bridge", "power outage"];
const DISPLACEMENT_KEYWORDS = ["displaced", "refugee", "evacuat", "fled", "idp", "displacement"];
const FOOD_KEYWORDS = ["famine", "food shortage", "malnutrition", "hunger", "starvation", "crop failure"];
const MEDICAL_KEYWORDS = ["medical", "hospital", "injured", "casualties", "outbreak", "epidemic", "healthcare"];

export class ExtendedNlpService {
  analyseExtended(content: string, nlp: NLPAnalysisResult): Omit<ExtendedAnalysisInsight, "priorityExplanation" | "riskExplanation" | "reliabilityExplanation"> {
    const normalised = content.toLowerCase();

    const sentiment = this.detectSentiment(normalised);
    const urgencyLevel = this.detectUrgency(normalised);
    const threatDetected = THREAT_KEYWORDS.some((k) => normalised.includes(k));
    const infrastructureDamage = INFRA_KEYWORDS.some((k) => normalised.includes(k));

    const displacementRisk = this.scoreKeywords(normalised, DISPLACEMENT_KEYWORDS, nlp.crisisType === "Displacement" ? 0.3 : 0);
    const foodInsecurityRisk = this.scoreKeywords(normalised, FOOD_KEYWORDS, nlp.humanitarianNeeds.some((n) => n.needType === "Food") ? 0.25 : 0);
    const medicalDemand = this.scoreKeywords(normalised, MEDICAL_KEYWORDS, nlp.humanitarianNeeds.some((n) => n.needType === "Medical") ? 0.25 : 0);

    const fieldConfidences = this.buildFieldConfidences(content, nlp);

    return {
      sentiment,
      urgencyLevel,
      threatDetected,
      infrastructureDamage,
      displacementRisk: roundTo(displacementRisk),
      foodInsecurityRisk: roundTo(foodInsecurityRisk),
      medicalDemand: roundTo(medicalDemand),
      fieldConfidences,
    };
  }

  private detectSentiment(normalised: string): string {
    const neg = SENTIMENT_NEGATIVE.filter((k) => normalised.includes(k)).length;
    const pos = SENTIMENT_POSITIVE.filter((k) => normalised.includes(k)).length;
    if (neg > pos + 1) return "Negative";
    if (pos > neg + 1) return "Positive";
    return "Neutral";
  }

  private detectUrgency(normalised: string): string {
    const matches = URGENCY_KEYWORDS.filter((k) => normalised.includes(k)).length;
    if (matches >= 2) return "Critical";
    if (matches === 1) return "High";
    if (normalised.includes("monitor") || normalised.includes("ongoing")) return "Medium";
    return "Low";
  }

  private scoreKeywords(normalised: string, keywords: string[], bonus: number): number {
    const hits = keywords.filter((k) => normalised.includes(k)).length;
    return clamp(0.1 + hits * 0.2 + bonus, 0, 1);
  }

  private buildFieldConfidences(content: string, nlp: NLPAnalysisResult): Record<string, number> {
    const lengthFactor = clamp(content.length / 500, 0.3, 1);
    const locationConf = nlp.locations.length > 0
      ? clamp(0.5 + nlp.locations.filter((l) => hasSafeCoordinates(l)).length * 0.15, 0, 1)
      : 0.2;
    const crisisConf = nlp.crisisType ? 0.7 * lengthFactor : 0.25;
    const needsConf = nlp.humanitarianNeeds.length > 0
      ? clamp(0.5 + nlp.humanitarianNeeds.length * 0.1, 0, 1) * lengthFactor
      : 0.2;
    const popConf = nlp.affectedPopulation !== null ? 0.75 : 0.15;

    return {
      location: roundTo(locationConf),
      crisisType: roundTo(crisisConf),
      humanitarianNeeds: roundTo(needsConf),
      affectedPopulation: roundTo(popConf),
    };
  }
}

export class ExplanationService {
  explainPriority(
    nlp: NLPAnalysisResult,
    priority: PriorityResult,
    reliability: ReliabilityResult,
    risk?: RiskProjectionResult
  ): AssessmentExplanation {
    const reasons = [...priority.reasons];

    if (risk) {
      reasons.push(`Risk level: ${risk.riskLevel} (${risk.trend} trend)`);
    }

    if (reliability.finalScore >= 0.8 && !reasons.some((r) => r.includes("reliability"))) {
      reasons.push(`High source reliability (${Math.round(reliability.finalScore * 100)}%)`);
    }

    if (nlp.crisisType === "Conflict" && !reasons.some((r) => r.includes("Conflict"))) {
      reasons.push("Active conflict zone indicators detected");
    }

    return {
      conclusion: `Priority = ${priority.priorityLevel} (Score: ${priority.priorityScore})`,
      reasons,
    };
  }

  explainRisk(
    nlp: NLPAnalysisResult,
    priority: PriorityResult,
    risk: RiskProjectionResult,
    content: string
  ): AssessmentExplanation {
    const reasons: string[] = [];
    const normalised = content.toLowerCase();

    reasons.push(`Current risk level assessed as ${risk.riskLevel}`);
    reasons.push(`Trend: ${risk.trend}`);

    if (risk.trend === "Increasing") {
      reasons.push("Escalation keywords detected in report text");
    }

    if (priority.priorityLevel === "Critical" || priority.priorityLevel === "High") {
      reasons.push(`Elevated priority (${priority.priorityLevel}) increases projected risk`);
    }

    if (nlp.crisisType) {
      reasons.push(`Crisis type: ${nlp.crisisType}`);
    }

    const escalationTerms = ["escalat", "spread", "worsen", "intensif"];
    if (escalationTerms.some((t) => normalised.includes(t))) {
      reasons.push("Situation deterioration language identified");
    }

    return {
      conclusion: `Risk = ${risk.riskLevel} (${risk.trend})`,
      reasons,
    };
  }

  explainReliability(
    reliability: ReliabilityResult,
    content: string,
    sourceName?: string
  ): AssessmentExplanation {
    const reasons: string[] = [];

    reasons.push(`Source credibility score: ${Math.round(reliability.sourceScore * 100)}%`);
    reasons.push(`Content consistency: ${Math.round(reliability.consistencyScore * 100)}%`);
    reasons.push(`Recency factor: ${Math.round(reliability.recencyScore * 100)}%`);

    if (sourceName) {
      reasons.push(`Source: ${sourceName}`);
    }

    const normalised = content.toLowerCase();
    if (normalised.includes("unconfirmed") || normalised.includes("allegedly")) {
      reasons.push("Uncertainty language reduces confidence");
    }
    if (normalised.includes("verified") || normalised.includes("confirmed")) {
      reasons.push("Verification language increases confidence");
    }

    return {
      conclusion: `Reliability = ${Math.round(reliability.finalScore * 100)}%`,
      reasons,
    };
  }
}

export const extendedNlpService = new ExtendedNlpService();
export const explanationService = new ExplanationService();
