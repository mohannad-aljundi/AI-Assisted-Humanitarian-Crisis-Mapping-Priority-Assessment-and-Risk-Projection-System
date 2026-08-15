import type { PriorityLevel, RiskLevel } from "@prisma/client";
import type { AnalyticalRiskProjection } from "@/types";
import type { MasterHumanitarianNeed } from "@/types/masterIncidentIntelligence";

export interface ClusterOperationalSnapshot {
  masterIncidentId: string;
  syncedAt: string;
  pipelineVersion: string;
  priorityLevel: PriorityLevel;
  priorityScore: number;
  riskLevel: RiskLevel;
  riskScore: number;
  verificationStatus: string;
  confidence: number;
  agreementPercent: number;
  executiveSummary: string;
  analystNarrative: string;
  humanitarianNeeds: MasterHumanitarianNeed[];
  riskProjection: AnalyticalRiskProjection;
  priorityReasoning: string | null;
  supportingReportCount: number;
  independentSourceCount: number;
  sourceAgreementPercent: number;
  evidenceStrength: number;
}

export interface PriorityClusterSyncMeta {
  originalPriorityLevel: PriorityLevel;
  originalSeverityScore: number;
  masterIncidentId: string;
  syncedAt: string;
}
