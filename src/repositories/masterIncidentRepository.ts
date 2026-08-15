import { prisma } from "@/lib/prisma";
import type { MasterIncident, MasterIncidentMember, PriorityLevel } from "@prisma/client";

export type MasterIncidentWithMembers = MasterIncident & {
  members: (MasterIncidentMember & {
    report: {
      id: string;
      title: string;
      reportDate: Date;
      source: { name: string; credibilityScore: number };
    };
  })[];
};

export class MasterIncidentRepository {
  async findByReportId(reportId: string) {
    return prisma.masterIncidentMember.findUnique({
      where: { reportId },
      include: {
        masterIncident: {
          include: {
            intelligence: true,
            members: {
              include: {
                report: {
                  select: {
                    id: true,
                    title: true,
                    reportDate: true,
                    source: { select: { name: true, credibilityScore: true } },
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });
  }

  async findCandidates(params: {
    crisisType: string;
    country: string;
    windowStart?: Date;
    backfill?: boolean;
  }) {
    return prisma.masterIncident.findMany({
      where: {
        crisisType: { equals: params.crisisType, mode: "insensitive" },
        country: { equals: params.country, mode: "insensitive" },
        ...(params.backfill || !params.windowStart
          ? {}
          : { updatedAt: { gte: params.windowStart } }),
      },
      include: {
        members: {
          include: {
            report: {
              select: {
                id: true,
                title: true,
                reportDate: true,
                source: { select: { name: true, credibilityScore: true } },
              },
            },
          },
        },
      },
      orderBy: [{ dynamicPriorityScore: "desc" }, { updatedAt: "desc" }],
      take: params.backfill ? 100 : 40,
    });
  }

  async createMasterIncident(data: {
    canonicalReportId: string;
    title: string;
    summary?: string | null;
    crisisType: string;
    country: string;
    city: string;
    latitude?: number | null;
    longitude?: number | null;
    supportingReportCount: number;
    independentSourceCount: number;
    sourceAgreementPercent: number;
    timelineConsistency: number;
    confidenceScore: number;
    evidenceStrength: number;
    correlationVerificationStatus: string;
    dynamicPriorityScore: number;
    dynamicPriorityLevel: PriorityLevel;
    sourceNames: string[];
    reportIds: string[];
  }) {
    return prisma.masterIncident.create({
      data: {
        ...data,
        sourceNames: data.sourceNames,
        reportIds: data.reportIds,
        members: {
          create: {
            reportId: data.canonicalReportId,
            similarityScore: 1,
            isCanonical: true,
          },
        },
      },
      include: { members: true },
    });
  }

  async addMember(params: {
    masterIncidentId: string;
    reportId: string;
    similarityScore: number;
  }) {
    return prisma.masterIncidentMember.create({
      data: {
        masterIncidentId: params.masterIncidentId,
        reportId: params.reportId,
        similarityScore: params.similarityScore,
        isCanonical: false,
      },
    });
  }

  async updateMasterIncident(
    id: string,
    data: Partial<Omit<MasterIncident, "id" | "createdAt" | "updatedAt">>
  ) {
    return prisma.masterIncident.update({
      where: { id },
      data: {
        ...data,
        sourceNames: data.sourceNames ?? undefined,
        reportIds: data.reportIds ?? undefined,
      },
    });
  }

  async findById(id: string) {
    return prisma.masterIncident.findUnique({
      where: { id },
      include: {
        intelligence: true,
        members: {
          include: {
            report: {
              select: {
                id: true,
                title: true,
                reportDate: true,
                source: { select: { name: true, credibilityScore: true } },
              },
            },
          },
        },
      },
    });
  }

  async findAllOrdered(limit = 100) {
    return prisma.masterIncident.findMany({
      orderBy: [{ dynamicPriorityScore: "desc" }, { updatedAt: "desc" }],
      take: limit,
      include: {
        intelligence: true,
        members: {
          include: {
            report: {
              select: {
                id: true,
                title: true,
                reportDate: true,
                source: { select: { name: true, credibilityScore: true } },
              },
            },
          },
        },
      },
    });
  }

  async getReportProfile(reportId: string) {
    return prisma.report.findUnique({
      where: { id: reportId },
      include: {
        source: true,
        extractedEntities: true,
        priorityAssessment: true,
        reliabilityAssessment: true,
        insight: {
          select: {
            situationSummary: true,
            finalReasoning: true,
            analyticalRiskProjection: true,
            humanitarianReasoning: true,
          },
        },
        crisis: {
          include: {
            location: true,
            riskProjections: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
        masterIncidentMember: true,
      },
    });
  }

  async getClusterReportsForIntelligence(masterIncidentId: string) {
    const cluster = await this.findById(masterIncidentId);
    if (!cluster) return null;

    const reports = await Promise.all(
      cluster.members.map(async (member) => {
        const report = await prisma.report.findUnique({
          where: { id: member.reportId },
          include: {
            source: true,
            extractedEntities: {
              where: {
                entityType: {
                  in: ["CRISIS_TYPE", "LOCATION", "HUMANITARIAN_NEED", "AFFECTED_POPULATION"],
                },
              },
            },
            priorityAssessment: true,
            reliabilityAssessment: true,
            insight: {
              select: {
                situationSummary: true,
                finalReasoning: true,
                analyticalRiskProjection: true,
              },
            },
            crisis: {
              include: {
                riskProjections: { orderBy: { createdAt: "desc" }, take: 1 },
              },
            },
          },
        });
        return report;
      })
    );

    return { cluster, reports: reports.filter(Boolean) };
  }
}

export const masterIncidentRepository = new MasterIncidentRepository();
