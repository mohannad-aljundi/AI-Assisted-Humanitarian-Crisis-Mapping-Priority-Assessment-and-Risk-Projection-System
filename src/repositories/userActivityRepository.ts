import type { UserActivity } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export class UserActivityRepository {
  async create(
    action: string,
    tx?: PrismaTransactionClient
  ): Promise<UserActivity> {
    return client(tx).userActivity.create({ data: { action } });
  }

  async findRecent(limit = 20): Promise<UserActivity[]> {
    return prisma.userActivity.findMany({
      orderBy: { timestamp: "desc" },
      take: limit,
    });
  }
}

export const userActivityRepository = new UserActivityRepository();
