import type { ExtractedEntity, ExtractedEntityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export interface ExtractedEntityInput {
  entityType: ExtractedEntityType;
  entitySubtype?: string | null;
  value: string;
  latitude?: number | null;
  longitude?: number | null;
  severity?: string | null;
}

export class ExtractedEntityRepository {
  async findByReportId(reportId: string): Promise<ExtractedEntity[]> {
    return prisma.extractedEntity.findMany({
      where: { reportId },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(
    reportId: string,
    data: ExtractedEntityInput,
    tx?: PrismaTransactionClient
  ): Promise<ExtractedEntity> {
    return client(tx).extractedEntity.create({
      data: {
        entityType: data.entityType,
        entitySubtype: data.entitySubtype ?? null,
        value: data.value,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        severity: data.severity ?? null,
        report: { connect: { id: reportId } },
      },
    });
  }

  async createMany(
    reportId: string,
    entities: ExtractedEntityInput[],
    tx?: PrismaTransactionClient
  ): Promise<ExtractedEntity[]> {
    const results: ExtractedEntity[] = [];
    for (const entity of entities) {
      results.push(await this.create(reportId, entity, tx));
    }
    return results;
  }
}

export const extractedEntityRepository = new ExtractedEntityRepository();
