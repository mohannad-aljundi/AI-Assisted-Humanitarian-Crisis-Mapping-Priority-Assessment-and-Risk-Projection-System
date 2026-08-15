import type { Prisma, ReliabilityAssessment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export class ReliabilityAssessmentRepository {
  async findByReportId(
    reportId: string
  ): Promise<ReliabilityAssessment | null> {
    return prisma.reliabilityAssessment.findUnique({ where: { reportId } });
  }

  async create(
    data: Prisma.ReliabilityAssessmentCreateInput,
    tx?: PrismaTransactionClient
  ): Promise<ReliabilityAssessment> {
    return client(tx).reliabilityAssessment.create({ data });
  }

  async upsertForReport(
    reportId: string,
    data: {
      sourceScore: number;
      consistencyScore: number;
      recencyScore: number;
      finalScore: number;
      scoreBreakdown?: object;
    },
    tx?: PrismaTransactionClient
  ): Promise<ReliabilityAssessment> {
    return client(tx).reliabilityAssessment.upsert({
      where: { reportId },
      create: {
        reportId,
        sourceScore: data.sourceScore,
        consistencyScore: data.consistencyScore,
        recencyScore: data.recencyScore,
        finalScore: data.finalScore,
        scoreBreakdown: data.scoreBreakdown,
      },
      update: {
        sourceScore: data.sourceScore,
        consistencyScore: data.consistencyScore,
        recencyScore: data.recencyScore,
        finalScore: data.finalScore,
        scoreBreakdown: data.scoreBreakdown,
      },
    });
  }

  async update(
    reportId: string,
    data: Prisma.ReliabilityAssessmentUpdateInput,
    tx?: PrismaTransactionClient
  ): Promise<ReliabilityAssessment> {
    return client(tx).reliabilityAssessment.update({ where: { reportId }, data });
  }
}

export const reliabilityAssessmentRepository =
  new ReliabilityAssessmentRepository();
