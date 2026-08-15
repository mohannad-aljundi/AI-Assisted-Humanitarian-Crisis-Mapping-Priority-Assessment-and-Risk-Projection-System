import type { PriorityLevel, RiskLevel } from "@prisma/client";
import { mapIntelligenceRecord } from "@/repositories/masterIncidentIntelligenceRepository";
import type { ClusterOperationalSnapshot } from "@/types/clusterOperational";
import type { MasterIncidentIntelligenceView } from "@/types/masterIncidentIntelligence";
import {
  isVerifiedCorrelationStatus,
  type CorrelationVerificationStatus,
} from "@/lib/correlationVerificationStatus";

export interface MasterIncidentMetrics {
  id: string;
  supportingReportCount: number;
  independentSourceCount: number;
  sourceAgreementPercent: number;
  evidenceStrength: number;
  correlationVerificationStatus: string;
  dynamicPriorityScore: number;
  dynamicPriorityLevel: PriorityLevel;
  confidenceScore: number;
}

export interface ReportOperationalFallback {
  priorityLevel: PriorityLevel;
  priorityScore: number;
  verificationStatus?: string | null;
  confidence?: number | null;
}

export interface OperationalIntelligence {
  source: "master_incident" | "report";
  masterIncidentId: string | null;
  priorityLevel: PriorityLevel;
  priorityScore: number;
  riskLevel: RiskLevel;
  riskScore: number;
  verificationStatus: string;
  confirmationStatus: string;
  confidence: number;
  agreementPercent: number;
  evidenceStrength: number;
  executiveSummary: string | null;
  analystNarrative: string | null;
  supportingReportCount: number;
  independentSourceCount: number;
  sourceAgreementPercent: number;
  dynamicPriorityScore: number;
  intelligence: MasterIncidentIntelligenceView | null;
  clusterOperational: ClusterOperationalSnapshot | null;
}

function scoreToPercent(score: number): number {
  return score <= 1 ? Math.round(score * 100) : Math.round(score);
}

export function resolveOperationalFromIntelligence(
  master: MasterIncidentMetrics,
  intelligence: MasterIncidentIntelligenceView
): OperationalIntelligence {
  const verificationStatus =
    intelligence.verification || master.correlationVerificationStatus;
  const priorityLevel = intelligence.dynamicPriority.level;
  const priorityScore = intelligence.dynamicPriority.score;

  return {
    source: "master_incident",
    masterIncidentId: master.id,
    priorityLevel,
    priorityScore,
    riskLevel: intelligence.riskProjection.riskLevel,
    riskScore: intelligence.riskProjection.currentScore,
    verificationStatus,
    confirmationStatus: verificationStatus,
    confidence: intelligence.confidence,
    agreementPercent: Math.round(intelligence.consensus.agreementPercent),
    evidenceStrength: master.evidenceStrength,
    executiveSummary: intelligence.executiveSummary,
    analystNarrative: intelligence.analystNarrative,
    supportingReportCount: master.supportingReportCount,
    independentSourceCount: master.independentSourceCount,
    sourceAgreementPercent: master.sourceAgreementPercent,
    dynamicPriorityScore: master.dynamicPriorityScore,
    intelligence,
    clusterOperational: null,
  };
}

export function resolveOperationalFromClusterSnapshot(
  snapshot: ClusterOperationalSnapshot
): OperationalIntelligence {
  return {
    source: "master_incident",
    masterIncidentId: snapshot.masterIncidentId,
    priorityLevel: snapshot.priorityLevel,
    priorityScore: snapshot.priorityScore,
    riskLevel: snapshot.riskLevel,
    riskScore: snapshot.riskScore,
    verificationStatus: snapshot.verificationStatus,
    confirmationStatus: snapshot.verificationStatus,
    confidence: snapshot.confidence,
    agreementPercent: snapshot.agreementPercent,
    evidenceStrength: snapshot.evidenceStrength,
    executiveSummary: snapshot.executiveSummary,
    analystNarrative: snapshot.analystNarrative,
    supportingReportCount: snapshot.supportingReportCount,
    independentSourceCount: snapshot.independentSourceCount,
    sourceAgreementPercent: snapshot.sourceAgreementPercent,
    dynamicPriorityScore: snapshot.priorityScore,
    intelligence: null,
    clusterOperational: snapshot,
  };
}

export function resolveOperationalFromReport(
  fallback: ReportOperationalFallback
): OperationalIntelligence {
  return {
    source: "report",
    masterIncidentId: null,
    priorityLevel: fallback.priorityLevel,
    priorityScore: fallback.priorityScore,
    riskLevel: fallback.priorityLevel as RiskLevel,
    riskScore: fallback.priorityScore,
    verificationStatus: fallback.verificationStatus ?? "Pending Review",
    confirmationStatus: fallback.verificationStatus ?? "Pending Review",
    confidence: fallback.confidence ?? 0.5,
    agreementPercent: 0,
    evidenceStrength: 0.5,
    executiveSummary: null,
    analystNarrative: null,
    supportingReportCount: 1,
    independentSourceCount: 1,
    sourceAgreementPercent: 0,
    dynamicPriorityScore: fallback.priorityScore,
    intelligence: null,
    clusterOperational: null,
  };
}

export function resolveOperationalIntelligence(params: {
  master?: MasterIncidentMetrics | null;
  intelligence?: MasterIncidentIntelligenceView | null;
  clusterOperational?: ClusterOperationalSnapshot | null;
  reportFallback: ReportOperationalFallback;
}): OperationalIntelligence {
  if (params.intelligence && params.master) {
    return resolveOperationalFromIntelligence(params.master, params.intelligence);
  }

  if (params.clusterOperational) {
    return resolveOperationalFromClusterSnapshot(params.clusterOperational);
  }

  if (params.master) {
    return {
      ...resolveOperationalFromReport(params.reportFallback),
      source: "master_incident",
      masterIncidentId: params.master.id,
      priorityLevel: params.master.dynamicPriorityLevel,
      priorityScore: params.master.dynamicPriorityScore,
      riskLevel: params.master.dynamicPriorityLevel as RiskLevel,
      riskScore: params.master.dynamicPriorityScore,
      verificationStatus: params.master.correlationVerificationStatus,
      confirmationStatus: params.master.correlationVerificationStatus,
      confidence: params.master.confidenceScore,
      agreementPercent: Math.round(params.master.sourceAgreementPercent),
      evidenceStrength: params.master.evidenceStrength,
      supportingReportCount: params.master.supportingReportCount,
      independentSourceCount: params.master.independentSourceCount,
      sourceAgreementPercent: params.master.sourceAgreementPercent,
      dynamicPriorityScore: params.master.dynamicPriorityScore,
    };
  }

  return resolveOperationalFromReport(params.reportFallback);
}

export function parseClusterOperational(value: unknown): ClusterOperationalSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<ClusterOperationalSnapshot>;
  if (
    typeof snapshot.masterIncidentId !== "string" ||
    typeof snapshot.priorityLevel !== "string" ||
    typeof snapshot.verificationStatus !== "string"
  ) {
    return null;
  }
  return snapshot as ClusterOperationalSnapshot;
}

export function resolveDisplayVerificationStatus(params: {
  operational: OperationalIntelligence;
  analystValidated?: boolean;
  feedbackCount?: number;
}): string {
  if (params.analystValidated) return "Validated";
  if ((params.feedbackCount ?? 0) > 0) return "Feedback submitted";

  const status = params.operational.verificationStatus as CorrelationVerificationStatus;
  if (isVerifiedCorrelationStatus(status)) {
    return status;
  }

  return "Pending review";
}

export function operationalPriorityPercent(operational: OperationalIntelligence): number {
  return scoreToPercent(operational.priorityScore);
}

type LinkedReportOperationalInput = {
  priorityAssessment: { priorityLevel: PriorityLevel; severityScore: number } | null;
  insight?: { clusterOperational: unknown } | null;
  masterIncidentMember?: {
    masterIncident: MasterIncidentMetrics & {
      intelligence?: Parameters<typeof mapIntelligenceRecord>[0] | null;
    };
  } | null;
};

export function resolveOperationalForLinkedReport(
  row: LinkedReportOperationalInput
): OperationalIntelligence {
  const master = row.masterIncidentMember?.masterIncident ?? null;
  const intelligenceRecord = master?.intelligence ?? null;
  const intelligence = intelligenceRecord ? mapIntelligenceRecord(intelligenceRecord) : null;
  const clusterOperational = parseClusterOperational(row.insight?.clusterOperational);

  return resolveOperationalIntelligence({
    master,
    intelligence,
    clusterOperational,
    reportFallback: {
      priorityLevel: row.priorityAssessment?.priorityLevel ?? "Medium",
      priorityScore: row.priorityAssessment?.severityScore ?? 0.5,
      verificationStatus: master?.correlationVerificationStatus ?? null,
      confidence: master?.confidenceScore ?? null,
    },
  });
}
