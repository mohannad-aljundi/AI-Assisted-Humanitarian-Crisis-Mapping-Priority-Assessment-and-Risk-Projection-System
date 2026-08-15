import type { Prisma, RiskProjection, RiskLevel, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export class RiskRepository {
  async findAll(): Promise<RiskProjection[]> {
    return prisma.riskProjection.findMany({
      include: { location: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async findByLocationId(locationId: string): Promise<RiskProjection[]> {
    return prisma.riskProjection.findMany({
      where: { locationId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async findLatestByLocationId(
    locationId: string
  ): Promise<(RiskProjection & { location: { id: string; name: string } }) | null> {
    return prisma.riskProjection.findFirst({
      where: { locationId },
      orderBy: { updatedAt: "desc" },
      include: { location: { select: { id: true, name: true } } },
    });
  }

  async findLatestForReportLocations(
    locationIds: string[]
  ): Promise<(RiskProjection & { location: Location }) | null> {
    if (locationIds.length === 0) return null;
    return prisma.riskProjection.findFirst({
      where: { locationId: { in: locationIds } },
      orderBy: { createdAt: "desc" },
      include: { location: true },
    });
  }

  async create(
    data: Prisma.RiskProjectionCreateInput,
    tx?: PrismaTransactionClient
  ): Promise<RiskProjection> {
    return client(tx).riskProjection.create({ data });
  }

  async update(
    id: string,
    data: Prisma.RiskProjectionUpdateInput,
    tx?: PrismaTransactionClient
  ): Promise<RiskProjection> {
    return client(tx).riskProjection.update({ where: { id }, data });
  }

  async findByCrisisId(crisisId: string): Promise<RiskProjection | null> {
    return prisma.riskProjection.findFirst({
      where: { crisisId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async countByRiskLevel(riskLevel: RiskLevel): Promise<number> {
    return prisma.riskProjection.count({ where: { riskLevel } });
  }

  async countCriticalZones(): Promise<number> {
    return this.countByRiskLevel("Critical");
  }
}

export const riskRepository = new RiskRepository();
