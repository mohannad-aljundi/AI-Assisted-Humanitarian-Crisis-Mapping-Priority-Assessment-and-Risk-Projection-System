import type {
  Location,
  LocationResolutionMethod,
  LocationResolutionStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PrismaTransactionClient } from "@/lib/prismaTransaction";

function client(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

export interface LocationResolutionData {
  name: string;
  latitude: number | null;
  longitude: number | null;
  resolutionStatus: LocationResolutionStatus;
  resolutionMethod: LocationResolutionMethod | null;
  confidenceScore: number;
  rawLocationText: string;
}

export class LocationRepository {
  async findAll(): Promise<Location[]> {
    return prisma.location.findMany({ orderBy: { name: "asc" } });
  }

  async findById(id: string): Promise<Location | null> {
    return prisma.location.findUnique({ where: { id } });
  }

  async findByIds(ids: string[]): Promise<Location[]> {
    if (ids.length === 0) return [];
    return prisma.location.findMany({ where: { id: { in: ids } } });
  }

  async findByName(
    name: string,
    tx?: PrismaTransactionClient
  ): Promise<Location | null> {
    return client(tx).location.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
  }

  async findByNames(
    names: string[],
    tx?: PrismaTransactionClient
  ): Promise<Location[]> {
    if (names.length === 0) return [];
    const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    if (unique.length === 0) return [];

    return client(tx).location.findMany({
      where: {
        OR: unique.map((name) => ({
          name: { equals: name, mode: "insensitive" as const },
        })),
      },
    });
  }

  async findPending(limit = 50): Promise<Location[]> {
    return prisma.location.findMany({
      where: { resolutionStatus: "LOCATION_PENDING" },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
  }

  async create(
    data: Prisma.LocationCreateInput,
    tx?: PrismaTransactionClient
  ): Promise<Location> {
    return client(tx).location.create({ data });
  }

  async updateResolution(
    id: string,
    data: LocationResolutionData,
    tx?: PrismaTransactionClient
  ): Promise<Location> {
    return client(tx).location.update({
      where: { id },
      data: {
        name: data.name,
        latitude: data.latitude,
        longitude: data.longitude,
        resolutionStatus: data.resolutionStatus,
        resolutionMethod: data.resolutionMethod,
        confidenceScore: data.confidenceScore,
        rawLocationText: data.rawLocationText,
      },
    });
  }

  async findOrCreate(
    name: string,
    latitude: number | null,
    longitude: number | null,
    tx?: PrismaTransactionClient,
    resolution?: Partial<LocationResolutionData>
  ): Promise<Location> {
    const existing = await this.findByName(name, tx);
    if (existing) {
      return existing;
    }

    return this.create(
      {
        name,
        latitude,
        longitude,
        resolutionStatus: resolution?.resolutionStatus ?? "VERIFIED",
        resolutionMethod: resolution?.resolutionMethod ?? null,
        confidenceScore: resolution?.confidenceScore ?? 0.75,
        rawLocationText: resolution?.rawLocationText ?? name,
      },
      tx
    );
  }

  async findOrCreateWithResolution(
    data: LocationResolutionData,
    tx?: PrismaTransactionClient
  ): Promise<Location> {
    const existing = await this.findByName(data.name, tx);
    if (existing) {
      return existing;
    }

    return this.create(
      {
        name: data.name,
        latitude: data.latitude,
        longitude: data.longitude,
        resolutionStatus: data.resolutionStatus,
        resolutionMethod: data.resolutionMethod,
        confidenceScore: data.confidenceScore,
        rawLocationText: data.rawLocationText,
      },
      tx
    );
  }
}

export const locationRepository = new LocationRepository();
