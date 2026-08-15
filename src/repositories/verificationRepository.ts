import type { AgreementLevel, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class VerificationRepository {
  async getAnalysedReportsWithinDays(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return prisma.report.findMany({
      where: {
        priorityAssessment: { isNot: null },
        reportDate: { gte: since },
      },
      include: {
        source: true,
        reliabilityAssessment: true,
        priorityAssessment: true,
        extractedEntities: {
          where: {
            entityType: {
              in: ["LOCATION", "CRISIS_TYPE", "HUMANITARIAN_NEED", "AFFECTED_POPULATION"],
            },
          },
        },
      },
      orderBy: { reportDate: "desc" },
    });
  }

  async upsertVerification(data: {
    country: string;
    city: string;
    crisisType: string;
    consensusScore: number;
    agreementLevel: AgreementLevel;
    sourceAgreementScore: number;
    informationConsistencyScore: number;
    sourceConsensusPercentage: number;
    finalConfidenceScore: number;
    comparedSources: number;
    sourceNames: string[];
    reportIds: string[];
  }) {
    const existing = await prisma.sourceVerification.findFirst({
      where: {
        country: data.country,
        city: data.city,
        crisisType: data.crisisType,
      },
      orderBy: { updatedAt: "desc" },
    });

    const payload = {
      country: data.country,
      city: data.city,
      crisisType: data.crisisType,
      consensusScore: data.consensusScore,
      agreementLevel: data.agreementLevel,
      sourceAgreementScore: data.sourceAgreementScore,
      informationConsistencyScore: data.informationConsistencyScore,
      sourceConsensusPercentage: data.sourceConsensusPercentage,
      finalConfidenceScore: data.finalConfidenceScore,
      comparedSources: data.comparedSources,
      sourceNames: data.sourceNames as Prisma.InputJsonValue,
      reportIds: data.reportIds as Prisma.InputJsonValue,
    };

    if (existing) {
      return prisma.sourceVerification.update({
        where: { id: existing.id },
        data: payload,
      });
    }

    return prisma.sourceVerification.create({ data: payload });
  }

  async findLatestByIncident(
    country: string,
    city: string,
    crisisType: string
  ) {
    return prisma.sourceVerification.findFirst({
      where: { country, city, crisisType },
      orderBy: { updatedAt: "desc" },
    });
  }

  async findAll(limit = 50) {
    return prisma.sourceVerification.findMany({
      orderBy: { consensusScore: "desc" },
      take: limit,
    });
  }

  async getAverageConsensusScore(): Promise<number> {
    const result = await prisma.sourceVerification.aggregate({
      _avg: { consensusScore: true },
    });
    return result._avg.consensusScore ?? 0;
  }

  async getMostVerifiedCrisis(): Promise<string | null> {
    const top = await prisma.sourceVerification.findFirst({
      orderBy: [{ comparedSources: "desc" }, { consensusScore: "desc" }],
    });
    if (!top) return null;
    return `${top.crisisType} in ${top.city}, ${top.country}`;
  }
}

export const verificationRepository = new VerificationRepository();
