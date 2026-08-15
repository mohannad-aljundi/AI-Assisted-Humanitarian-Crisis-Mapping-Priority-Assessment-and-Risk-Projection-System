import type { Prisma, PriorityAssessment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export class PriorityAssessmentRepository {
  async findByReportId(reportId: string): Promise<PriorityAssessment | null> {
    return prisma.priorityAssessment.findUnique({ where: { reportId } });
  }

  async create(
    data: Prisma.PriorityAssessmentCreateInput,
    tx?: PrismaTransactionClient
  ): Promise<PriorityAssessment> {
    return client(tx).priorityAssessment.create({ data });
  }

  async upsertForReport(
    reportId: string,
    data: {
      severityScore: number;
      priorityLevel: PriorityAssessment["priorityLevel"];
      scoreBreakdown?: object;
    },
    tx?: PrismaTransactionClient
  ): Promise<PriorityAssessment> {
    return client(tx).priorityAssessment.upsert({
      where: { reportId },
      create: {
        reportId,
        severityScore: data.severityScore,
        priorityLevel: data.priorityLevel,
        scoreBreakdown: data.scoreBreakdown,
      },
      update: {
        severityScore: data.severityScore,
        priorityLevel: data.priorityLevel,
        scoreBreakdown: data.scoreBreakdown,
      },
    });
  }

  async update(
    reportId: string,
    data: Prisma.PriorityAssessmentUpdateInput,
    tx?: PrismaTransactionClient
  ): Promise<PriorityAssessment> {
    return client(tx).priorityAssessment.update({ where: { reportId }, data });
  }
}

export const priorityAssessmentRepository = new PriorityAssessmentRepository();
