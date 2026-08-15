import type { Prisma, Source, SourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export class SourceRepository {
  async findAll(): Promise<Source[]> {
    return prisma.source.findMany({ orderBy: { name: "asc" } });
  }

  async findById(id: string): Promise<Source | null> {
    return prisma.source.findUnique({ where: { id } });
  }

  async findByName(name: string): Promise<Source | null> {
    return prisma.source.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
  }

  async create(
    data: Prisma.SourceCreateInput,
    tx?: PrismaTransactionClient
  ): Promise<Source> {
    return client(tx).source.create({ data });
  }

  async findOrCreate(
    name: string,
    type: SourceType,
    credibilityScore = 0.5,
    url?: string,
    tx?: PrismaTransactionClient
  ): Promise<Source> {
    const existing = await client(tx).source.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      return existing;
    }

    return this.create(
      {
        name,
        type,
        credibilityScore,
        url,
      },
      tx
    );
  }
}

export const sourceRepository = new SourceRepository();
