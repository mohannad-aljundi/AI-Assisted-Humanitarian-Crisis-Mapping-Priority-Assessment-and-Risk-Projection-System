import type { Prisma, Report, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export class ReportRepository {
  async findAll(): Promise<(Report & { source: Source })[]> {
    return prisma.report.findMany({
      include: { source: true },
      orderBy: { reportDate: "desc" },
    });
  }

  async findById(id: string): Promise<(Report & { source: Source }) | null> {
    return prisma.report.findUnique({
      where: { id },
      include: { source: true },
    });
  }

  async create(
    data: Prisma.ReportCreateInput,
    tx?: PrismaTransactionClient
  ): Promise<Report & { source: Source }> {
    return client(tx).report.create({
      data,
      include: { source: true },
    });
  }

  async update(
    id: string,
    data: Prisma.ReportUpdateInput
  ): Promise<Report & { source: Source }> {
    return prisma.report.update({
      where: { id },
      data,
      include: { source: true },
    });
  }

  async delete(id: string): Promise<Report> {
    return prisma.report.delete({ where: { id } });
  }

  async count(): Promise<number> {
    return prisma.report.count();
  }
}

export const reportRepository = new ReportRepository();
