import type { AlertType, RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class AlertRepository {
  async create(data: {
    title: string;
    description: string;
    country: string;
    city: string;
    crisisType: string;
    riskLevel: RiskLevel;
    alertType: AlertType;
  }) {
    return prisma.alert.create({ data });
  }

  async findPaginated(page = 1, limit = 25) {
    const take = Math.min(50, Math.max(1, limit));
    const skip = (Math.max(1, page) - 1) * take;
    const [items, totalCount] = await Promise.all([
      prisma.alert.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.alert.count(),
    ]);
    const hasMore = skip + items.length < totalCount;
    return {
      items,
      page: Math.max(1, page),
      nextPage: hasMore ? page + 1 : null,
      hasMore,
      totalCount,
    };
  }

  async findRecent(limit = 10) {
    return prisma.alert.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async existsSimilar(
    alertType: AlertType,
    country: string,
    city: string,
    hours = 24
  ): Promise<boolean> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const count = await prisma.alert.count({
      where: {
        alertType,
        country,
        city,
        createdAt: { gte: since },
      },
    });
    return count > 0;
  }

  async countAll(): Promise<number> {
    return prisma.alert.count();
  }
}

export const alertRepository = new AlertRepository();
