import type { PriorityLevel, RiskLevel } from "@prisma/client";
import type { AnalyticalRiskProjection } from "@/types";

export interface MasterSituationAssessment {
  whatHappened: string;
  severity: string;
  currentImpact: string;
  confirmed: string[];
  uncertain: string[];
}

export interface MasterHumanitarianNeed {
  needType: string;
  severity: string;
  priority: string;
  confidence: number;
  reasoning: string;
  observedBy: string[];
  supportingReportCount: number;
}

export interface MasterEvidenceMatrixEntry {
  conclusion: string;
  observedBy: string[];
  confidence: number;
  evidenceStrength: number;
  supportingReports: string[];
  contradictingReports: string[];
}

export interface MasterConsensusAnalysis {
  agreementPercent: number;
  conflictPercent: number;
  missingEvidence: string[];
  independentSourceCount: number;
  trustedSourceCount: number;
  timelineConsistency: number;
}

export interface MasterDynamicPriority {
  level: PriorityLevel;
  score: number;
  reasoning: string;
  factors: string[];
}

export interface MasterTimelineEvent {
  time: string;
  title: string;
  description: string;
  sources: string[];
}

export interface MasterSourceReliability {
  overallScore: number;
  narrative: string;
  sourceBreakdown: Array<{
    name: string;
    credibility: number;
    role: string;
  }>;
}

export interface MasterIncidentIntelligenceView {
  id: string;
  masterIncidentId: string;
  executiveSummary: string;
  situationAssessment: MasterSituationAssessment;
  humanitarianNeeds: MasterHumanitarianNeed[];
  evidenceMatrix: MasterEvidenceMatrixEntry[];
  consensus: MasterConsensusAnalysis;
  dynamicPriority: MasterDynamicPriority;
  priorityReasoning: string | null;
  riskProjection: AnalyticalRiskProjection;
  analystNarrative: string;
  timeline: MasterTimelineEvent[];
  sourceReliability: MasterSourceReliability;
  confidence: number;
  verification: string;
  pipelineVersion: string;
  sourceReportIds: string[];
  memberCountAtAnalysis: number;
  aiModel: string | null;
  lastAnalysed: string;
}

export interface ClusterReportInput {
  reportId: string;
  title: string;
  sourceName: string;
  sourceCredibility: number;
  reportDate: string;
  contentExcerpt: string;
  crisisType: string | null;
  location: string | null;
  situationSummary: string | null;
  priorityLevel: PriorityLevel | null;
  severityScore: number | null;
  reliabilityScore: number | null;
  riskLevel: RiskLevel | null;
  humanitarianNeeds: Array<{ needType: string; severity: string; evidence?: string }>;
  executiveConclusion: string | null;
}
