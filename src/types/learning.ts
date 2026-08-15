import type { CorrectionField, PriorityLevel, RiskLevel } from "@prisma/client";

export interface LearningNeedSnapshot {
  needType: string;
  severity: string;
  source?: string | null;
  evidence?: string | null;
  reasoning?: string | null;
  confidence?: number | null;
}

export interface SubmitCorrectionInput {
  field: CorrectionField;
  originalValue: unknown;
  correctedValue: unknown;
  reason?: string;
  evidence?: string;
  analystId?: string;
}

export interface SubmitFeedbackInput {
  reportId: string;
  analystId?: string;
  summary?: string;
  corrections: SubmitCorrectionInput[];
}

export interface SimilarIncidentMatch {
  reportId: string;
  title: string;
  crisisType: string | null;
  country: string | null;
  city: string | null;
  reportPurpose: string | null;
  crisisPhase: string | null;
  priorityLevel: PriorityLevel | null;
  riskLevel: RiskLevel | null;
  similarityScore: number;
  similarityReasons: string[];
  humanitarianNeeds: LearningNeedSnapshot[];
  analystValidated: boolean;
  assessmentDifference: string;
}

export interface ChleLearningContext {
  similarCases: SimilarIncidentMatch[];
  relevantPatterns: Array<{
    evidencePattern: string;
    inferredOutcome: string;
    confidenceBoost: number;
    occurrenceCount: number;
  }>;
  mistakeWarnings: Array<{
    contextPattern: string;
    incorrectConclusion: string;
    correctConclusion: string;
    reason: string;
  }>;
  confidenceAdjustments: Record<string, number>;
  learningInfluenceSummary: string;
  influencedByReportIds: string[];
  influencedByExampleIds: string[];
}

export interface LearningInfluenceTrace {
  summary: string;
  similarReportIds: string[];
  exampleIds: string[];
  patternKeys: string[];
  memoryKeys: string[];
  calibrationKeys: string[];
}
