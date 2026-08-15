import type { Crisis, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export class CrisisRepository {
  async findById(
    id: string
  ): Promise<(Crisis & { humanitarianNeeds: { id: string }[] }) | null> {
    return prisma.crisis.findUnique({
      where: { id },
      include: { humanitarianNeeds: { select: { id: true } } },
    });
  }

  async findByReportId(reportId: string): Promise<Crisis | null> {
    try {
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: { crisis: true },
      });
      if (report?.crisis) return report.crisis;
    } catch {
      // Stale Prisma client — fall through to SQL lookup below.
    }

    try {
      const rows = await prisma.$queryRaw<Crisis[]>`
        SELECT *
        FROM "Crisis"
        WHERE "reportId" = ${reportId}
        LIMIT 1
      `;
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  async findLatestByLocationId(locationId: string): Promise<Crisis | null> {
    return prisma.crisis.findFirst({
      where: { locationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    data: Prisma.CrisisCreateInput,
    tx?: PrismaTransactionClient
  ): Promise<Crisis> {
    return client(tx).crisis.create({ data });
  }

  async upsertForReport(
    reportId: string,
    data: {
      crisisType: string;
      description: string;
      locationId: string;
    },
    tx?: PrismaTransactionClient
  ): Promise<Crisis> {
    return client(tx).crisis.upsert({
      where: { reportId },
      create: {
        reportId,
        crisisType: data.crisisType,
        description: data.description,
        locationId: data.locationId,
      },
      update: {
        crisisType: data.crisisType,
        description: data.description,
        locationId: data.locationId,
      },
    });
  }

  async updateRegion(
    crisisId: string,
    data: {
      centroidLatitude: number;
      centroidLongitude: number;
      affectedRadiusMeters: number;
      boundaryPolygon: [number, number][];
      regionLabel: string;
    },
    tx?: PrismaTransactionClient
  ): Promise<Crisis> {
    return client(tx).crisis.update({
      where: { id: crisisId },
      data: {
        centroidLatitude: data.centroidLatitude,
        centroidLongitude: data.centroidLongitude,
        affectedRadiusMeters: data.affectedRadiusMeters,
        boundaryPolygon: data.boundaryPolygon,
        regionLabel: data.regionLabel,
      },
    });
  }
}

export const crisisRepository = new CrisisRepository();
