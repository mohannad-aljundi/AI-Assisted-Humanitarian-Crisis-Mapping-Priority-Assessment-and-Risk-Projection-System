import { prisma } from "@/lib/prisma";

const riskProjectionInclude = {
  orderBy: { createdAt: "desc" as const },
  take: 1,
};

export class MapRepository {
  async getCrisesWithRegionDetails() {
    return prisma.crisis.findMany({
      include: {
        location: {
          include: {
            riskProjections: riskProjectionInclude,
          },
        },
        humanitarianNeeds: true,
        relatedLocations: {
          include: {
            location: {
              include: {
                riskProjections: riskProjectionInclude,
              },
            },
          },
        },
        riskProjections: riskProjectionInclude,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getAnalysedReportsWithExtractions() {
    return prisma.report.findMany({
      where: { priorityAssessment: { isNot: null } },
      include: {
        source: true,
        priorityAssessment: true,
        reliabilityAssessment: true,
        extractedEntities: {
          where: {
            entityType: {
              in: ["LOCATION", "CRISIS_TYPE", "AFFECTED_POPULATION"],
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getLocationsWithLatestRisk() {
    return prisma.location.findMany({
      where: {
        riskProjections: { some: {} },
      },
      include: {
        riskProjections: riskProjectionInclude,
        crises: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: {
            humanitarianNeeds: true,
          },
        },
      },
    });
  }

  async getAllPersistedLocations() {
    return prisma.location.findMany({
      orderBy: { name: "asc" },
    });
  }
}

export const mapRepository = new MapRepository();
