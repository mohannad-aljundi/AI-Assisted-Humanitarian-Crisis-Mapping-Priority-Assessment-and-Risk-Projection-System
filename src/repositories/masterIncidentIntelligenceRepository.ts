import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MasterIncidentIntelligenceView } from "@/types/masterIncidentIntelligence";

export function mapIntelligenceRecord(
  record: NonNullable<Awaited<ReturnType<typeof prisma.masterIncidentIntelligence.findUnique>>>
): MasterIncidentIntelligenceView {
  return {
    id: record.id,
    masterIncidentId: record.masterIncidentId,
    executiveSummary: record.executiveSummary,
    situationAssessment: record.situationAssessment as unknown as MasterIncidentIntelligenceView["situationAssessment"],
    humanitarianNeeds: record.humanitarianNeeds as unknown as MasterIncidentIntelligenceView["humanitarianNeeds"],
    evidenceMatrix: record.evidenceMatrix as unknown as MasterIncidentIntelligenceView["evidenceMatrix"],
    consensus: record.consensus as unknown as MasterIncidentIntelligenceView["consensus"],
    dynamicPriority: record.dynamicPriority as unknown as MasterIncidentIntelligenceView["dynamicPriority"],
    priorityReasoning:
      typeof record.priorityReasoning === "string"
        ? record.priorityReasoning
        : typeof record.priorityReasoning === "object" &&
            record.priorityReasoning !== null &&
            "narrative" in (record.priorityReasoning as object)
          ? String((record.priorityReasoning as { narrative?: string }).narrative ?? "")
          : null,
    riskProjection: record.riskProjection as unknown as MasterIncidentIntelligenceView["riskProjection"],
    analystNarrative: record.analystNarrative,
    timeline: record.timeline as unknown as MasterIncidentIntelligenceView["timeline"],
    sourceReliability: record.sourceReliability as unknown as MasterIncidentIntelligenceView["sourceReliability"],
    confidence: record.confidence,
    verification: record.verification,
    pipelineVersion: record.pipelineVersion,
    sourceReportIds: Array.isArray(record.sourceReportIds)
      ? (record.sourceReportIds as string[])
      : [],
    memberCountAtAnalysis: record.memberCountAtAnalysis,
    aiModel: record.aiModel,
    lastAnalysed: record.lastAnalysed.toISOString(),
  };
}

export class MasterIncidentIntelligenceRepository {
  async findByMasterIncidentId(masterIncidentId: string) {
    const record = await prisma.masterIncidentIntelligence.findUnique({
      where: { masterIncidentId },
    });
    return record ? mapIntelligenceRecord(record) : null;
  }

  async findByReportId(reportId: string) {
    const member = await prisma.masterIncidentMember.findUnique({
      where: { reportId },
      include: { masterIncident: { include: { intelligence: true } } },
    });
    return member?.masterIncident.intelligence
      ? mapIntelligenceRecord(member.masterIncident.intelligence)
      : null;
  }

  async upsert(
    masterIncidentId: string,
    data: Omit<
      Prisma.MasterIncidentIntelligenceUncheckedCreateInput,
      "id" | "masterIncidentId" | "createdAt" | "updatedAt"
    >
  ) {
    const record = await prisma.masterIncidentIntelligence.upsert({
      where: { masterIncidentId },
      create: { masterIncidentId, ...data },
      update: { ...data, lastAnalysed: new Date() },
    });
    return mapIntelligenceRecord(record);
  }

  async countPending(pipelineVersion: string) {
    return prisma.masterIncident.count({
      where: {
        OR: [
          { intelligence: null },
          { intelligence: { pipelineVersion: { not: pipelineVersion } } },
        ],
      },
    });
  }

  async listMasterIdsWithoutIntelligence(pipelineVersion: string) {
    const rows = await prisma.masterIncident.findMany({
      where: {
        OR: [
          { intelligence: null },
          { intelligence: { pipelineVersion: { not: pipelineVersion } } },
        ],
      },
      select: { id: true },
      orderBy: { dynamicPriorityScore: "desc" },
    });
    return rows.map((row) => row.id);
  }
}

export const masterIncidentIntelligenceRepository =
  new MasterIncidentIntelligenceRepository();
