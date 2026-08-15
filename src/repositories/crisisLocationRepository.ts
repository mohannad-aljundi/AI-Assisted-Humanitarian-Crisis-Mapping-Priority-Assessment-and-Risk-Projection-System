import type { PrismaTransactionClient } from "@/lib/prismaTransaction";
import { prisma } from "@/lib/prisma";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export class CrisisLocationRepository {
  async linkMany(
    crisisId: string,
    locationIds: string[],
    tx?: PrismaTransactionClient
  ): Promise<void> {
    if (locationIds.length === 0) return;

    await client(tx).crisisLocation.createMany({
      data: locationIds.map((locationId) => ({ crisisId, locationId })),
      skipDuplicates: true,
    });
  }
}

export const crisisLocationRepository = new CrisisLocationRepository();
