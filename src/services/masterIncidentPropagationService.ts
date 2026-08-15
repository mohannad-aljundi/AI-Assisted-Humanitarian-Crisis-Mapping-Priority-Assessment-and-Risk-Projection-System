import type { PriorityLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/simpleCache";
import { MASTER_INCIDENT_INTELLIGENCE_VERSION } from "@/lib/pipelineVersions";
import { masterIncidentIntelligenceRepository } from "@/repositories/masterIncidentIntelligenceRepository";
import { masterIncidentRepository } from "@/repositories/masterIncidentRepository";
import { priorityAssessmentRepository } from "@/repositories/priorityAssessmentRepository";
import type { ClusterOperationalSnapshot, PriorityClusterSyncMeta } from "@/types/clusterOperational";
import type { MasterIncidentIntelligenceView } from "@/types/masterIncidentIntelligence";
import { invalidateIncidentCache } from "@/services/incidentCache";

function roundTo(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildClusterSnapshot(
  master: NonNullable<Awaited<ReturnType<typeof masterIncidentRepository.findById>>>,
  intelligence: MasterIncidentIntelligenceView
): ClusterOperationalSnapshot {
  return {
    masterIncidentId: master.id,
    syncedAt: new Date().toISOString(),
    pipelineVersion: intelligence.pipelineVersion,
    priorityLevel: intelligence.dynamicPriority.level,
    priorityScore: roundTo(intelligence.dynamicPriority.score),
    riskLevel: intelligence.riskProjection.riskLevel,
    riskScore: intelligence.riskProjection.currentScore,
    verificationStatus: intelligence.verification,
    confidence: roundTo(intelligence.confidence),
    agreementPercent: Math.round(intelligence.consensus.agreementPercent),
    executiveSummary: intelligence.executiveSummary,
    analystNarrative: intelligence.analystNarrative,
    humanitarianNeeds: intelligence.humanitarianNeeds,
    riskProjection: intelligence.riskProjection,
    priorityReasoning: intelligence.priorityReasoning,
    supportingReportCount: master.supportingReportCount,
    independentSourceCount: master.independentSourceCount,
    sourceAgreementPercent: master.sourceAgreementPercent,
    evidenceStrength: master.evidenceStrength,
  };
}

export interface MasterIncidentPropagationResult {
  masterIncidentId: string;
  reportsUpdated: number;
  reportIds: string[];
}

export class MasterIncidentPropagationService {
  async propagateFromIntelligence(
    masterIncidentId: string,
    intelligence?: MasterIncidentIntelligenceView | null
  ): Promise<MasterIncidentPropagationResult | null> {
    const master = await masterIncidentRepository.findById(masterIncidentId);
    if (!master) return null;

    const resolved =
      intelligence ??
      (await masterIncidentIntelligenceRepository.findByMasterIncidentId(masterIncidentId));
    if (!resolved) return null;

    const snapshot = buildClusterSnapshot(master, resolved);
    const reportIds = master.members.map((member) => member.reportId);
    const syncedAt = new Date();

    for (const reportId of reportIds) {
      await this.syncReportOperationalFields(reportId, snapshot, syncedAt);
    }

    await prisma.masterIncidentMember.updateMany({
      where: { masterIncidentId },
      data: { operationalSyncedAt: syncedAt },
    });

    invalidateCache("dashboard:");
    invalidateCache("map:");
    for (const reportId of reportIds) {
      invalidateIncidentCache(reportId);
    }

    return {
      masterIncidentId,
      reportsUpdated: reportIds.length,
      reportIds,
    };
  }

  private async syncReportOperationalFields(
    reportId: string,
    snapshot: ClusterOperationalSnapshot,
    syncedAt: Date
  ): Promise<void> {
    const priorityAssessment = await priorityAssessmentRepository.findByReportId(reportId);
    if (priorityAssessment) {
      const existingBreakdown =
        priorityAssessment.scoreBreakdown &&
        typeof priorityAssessment.scoreBreakdown === "object"
          ? (priorityAssessment.scoreBreakdown as Record<string, unknown>)
          : {};

      const clusterSync = existingBreakdown.clusterSync as PriorityClusterSyncMeta | undefined;
      const originalMeta: PriorityClusterSyncMeta = clusterSync ?? {
        originalPriorityLevel: priorityAssessment.priorityLevel,
        originalSeverityScore: priorityAssessment.severityScore,
        masterIncidentId: snapshot.masterIncidentId,
        syncedAt: snapshot.syncedAt,
      };

      await priorityAssessmentRepository.update(reportId, {
        priorityLevel: snapshot.priorityLevel,
        severityScore: roundTo(snapshot.priorityScore),
        scoreBreakdown: {
          ...existingBreakdown,
          clusterSync: originalMeta,
          clusterOperational: {
            masterIncidentId: snapshot.masterIncidentId,
            syncedAt: snapshot.syncedAt,
            pipelineVersion: snapshot.pipelineVersion,
          },
        },
      });
    }

    const insight = await prisma.reportInsight.findUnique({ where: { reportId } });
    if (insight) {
      await prisma.reportInsight.update({
        where: { reportId },
        data: {
          clusterOperational: snapshot as object,
          analyticalRiskProjection: snapshot.riskProjection as object,
          situationSummary: insight.situationSummary,
        },
      });
    }
  }

  async propagateAllLinkedReports(): Promise<{
    total: number;
    propagated: number;
    skipped: number;
    reportsUpdated: number;
    errors: Array<{ masterIncidentId: string; message: string }>;
    durationMs: number;
  }> {
    const started = Date.now();
    const masters = await prisma.masterIncident.findMany({
      where: {
        intelligence: {
          pipelineVersion: MASTER_INCIDENT_INTELLIGENCE_VERSION,
        },
      },
      select: { id: true },
      orderBy: { dynamicPriorityScore: "desc" },
    });

    let propagated = 0;
    let skipped = 0;
    let reportsUpdated = 0;
    const errors: Array<{ masterIncidentId: string; message: string }> = [];

    for (const master of masters) {
      try {
        const result = await this.propagateFromIntelligence(master.id);
        if (result) {
          propagated += 1;
          reportsUpdated += result.reportsUpdated;
        } else {
          skipped += 1;
        }
      } catch (error) {
        errors.push({
          masterIncidentId: master.id,
          message: error instanceof Error ? error.message : "Unknown propagation error",
        });
      }
    }

    invalidateCache("dashboard:");
    invalidateCache("map:");
    invalidateIncidentCache();

    return {
      total: masters.length,
      propagated,
      skipped,
      reportsUpdated,
      errors,
      durationMs: Date.now() - started,
    };
  }
}

export const masterIncidentPropagationService = new MasterIncidentPropagationService();
