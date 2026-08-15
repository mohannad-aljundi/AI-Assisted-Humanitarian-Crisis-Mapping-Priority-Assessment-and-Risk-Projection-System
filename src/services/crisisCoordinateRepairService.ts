import { prisma } from "@/lib/prisma";
import { getSafeCoordinates, hasValidCoordinates } from "@/lib/coordinates";
import { isBlacklistedLocationName } from "@/lib/locationBlacklist";
import { locationRepository } from "@/repositories/locationRepository";
import { locationValidationService } from "@/services/locationValidationService";
import type { Location, LocationResolutionMethod } from "@prisma/client";

export interface CrisisCoordinateRepairResult {
  total: number;
  repaired: number;
  skipped: number;
  failed: number;
  durationMs: number;
  details: Array<{
    crisisId: string;
    reportId: string | null;
    status: "repaired" | "skipped" | "failed";
    message: string;
  }>;
}

interface ResolvedCoordinates {
  name: string;
  latitude: number;
  longitude: number;
  resolutionMethod: LocationResolutionMethod;
  confidenceScore: number;
  resolutionStatus: "VERIFIED" | "COUNTRY_CENTROID";
}

function uniqueLocationNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || isBlacklistedLocationName(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

export class CrisisCoordinateRepairService {
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  async repairAll(limit = 100): Promise<CrisisCoordinateRepairResult> {
    if (this.running) {
      throw new Error("Crisis coordinate repair already in progress");
    }

    this.running = true;
    const started = Date.now();
    const details: CrisisCoordinateRepairResult["details"] = [];
    let repaired = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const crises = await prisma.crisis.findMany({
        include: {
          location: true,
          report: {
            include: {
              extractedEntities: {
                where: { entityType: "LOCATION" },
                select: { value: true },
              },
            },
          },
        },
        orderBy: { updatedAt: "asc" },
        take: limit,
      });

      for (const crisis of crises) {
        if (this.crisisHasRenderableCoordinates(crisis)) {
          skipped += 1;
          details.push({
            crisisId: crisis.id,
            reportId: crisis.reportId,
            status: "skipped",
            message: "Already has valid coordinates",
          });
          continue;
        }

        try {
          const outcome = await this.repairCrisisRecord(crisis);
          if (outcome.repaired) {
            repaired += 1;
            details.push({
              crisisId: crisis.id,
              reportId: crisis.reportId,
              status: "repaired",
              message: outcome.message,
            });
          } else {
            skipped += 1;
            details.push({
              crisisId: crisis.id,
              reportId: crisis.reportId,
              status: "skipped",
              message: outcome.message,
            });
          }
        } catch (error) {
          failed += 1;
          details.push({
            crisisId: crisis.id,
            reportId: crisis.reportId,
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        total: crises.length,
        repaired,
        skipped,
        failed,
        durationMs: Date.now() - started,
        details,
      };
    } finally {
      this.running = false;
    }
  }

  async repairForReport(reportId: string): Promise<{ repaired: boolean; message: string }> {
    const crisis = await prisma.crisis.findFirst({
      where: { reportId },
      include: {
        location: true,
        report: {
          include: {
            extractedEntities: {
              where: { entityType: "LOCATION" },
              select: { value: true },
            },
          },
        },
      },
    });

    if (!crisis) {
      return { repaired: false, message: "No crisis linked to report" };
    }

    if (this.crisisHasRenderableCoordinates(crisis)) {
      return { repaired: false, message: "Crisis already has coordinates" };
    }

    return this.repairCrisisRecord(crisis);
  }

  private crisisHasRenderableCoordinates(crisis: {
    centroidLatitude: number | null;
    centroidLongitude: number | null;
    location: { latitude: number | null; longitude: number | null } | null;
  }): boolean {
    if (
      crisis.centroidLatitude !== null &&
      crisis.centroidLongitude !== null &&
      hasValidCoordinates(crisis.centroidLatitude, crisis.centroidLongitude)
    ) {
      return true;
    }

    const locationCoords = getSafeCoordinates(crisis.location);
    return locationCoords != null;
  }

  private async repairCrisisRecord(crisis: {
    id: string;
    reportId: string | null;
    locationId: string;
    location: Location | null;
    report: {
      segmentCountry: string | null;
      extractedEntities: Array<{ value: string }>;
    } | null;
  }): Promise<{ repaired: boolean; message: string }> {
    const entityNames = crisis.report?.extractedEntities.map((entity) => entity.value) ?? [];
    const locationNames = uniqueLocationNames([
      crisis.location?.name ?? "",
      ...entityNames,
    ]);

    if (locationNames.length === 0) {
      return { repaired: false, message: "No location text available" };
    }

    const resolved =
      (await this.resolveFromPersisted(locationNames)) ??
      (await this.resolveViaGeocoding(locationNames, crisis.report?.segmentCountry));

    if (!resolved) {
      return { repaired: false, message: "Could not resolve coordinates" };
    }

    let location = crisis.location;
    if (location) {
      location = await locationRepository.updateResolution(location.id, {
        name: resolved.name,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        resolutionStatus: resolved.resolutionStatus,
        resolutionMethod: resolved.resolutionMethod,
        confidenceScore: resolved.confidenceScore,
        rawLocationText: location.rawLocationText ?? resolved.name,
      });
    } else {
      location = await locationRepository.findOrCreateWithResolution({
        name: resolved.name,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        resolutionStatus: resolved.resolutionStatus,
        resolutionMethod: resolved.resolutionMethod,
        confidenceScore: resolved.confidenceScore,
        rawLocationText: resolved.name,
      });
    }

    await prisma.crisis.update({
      where: { id: crisis.id },
      data: {
        locationId: location.id,
        centroidLatitude: resolved.latitude,
        centroidLongitude: resolved.longitude,
      },
    });

    await prisma.crisisLocation.upsert({
      where: {
        crisisId_locationId: {
          crisisId: crisis.id,
          locationId: location.id,
        },
      },
      create: {
        crisisId: crisis.id,
        locationId: location.id,
      },
      update: {},
    });

    console.info(
      `[CrisisCoordinateRepair] Repaired crisis ${crisis.id} -> ${resolved.name} (${resolved.latitude}, ${resolved.longitude})`
    );

    return {
      repaired: true,
      message: `Set coordinates to ${resolved.name}`,
    };
  }

  private async resolveFromPersisted(
    names: string[]
  ): Promise<ResolvedCoordinates | null> {
    const persisted = await locationRepository.findByNames(names);
    for (const name of names) {
      const match = persisted.find(
        (location) => location.name.toLowerCase() === name.toLowerCase()
      );
      const coords = getSafeCoordinates(match);
      if (match && coords) {
        return {
          name: match.name,
          latitude: coords.lat,
          longitude: coords.lng,
          resolutionMethod: match.resolutionMethod ?? "DATABASE",
          confidenceScore: match.confidenceScore,
          resolutionStatus:
            match.resolutionStatus === "COUNTRY_CENTROID"
              ? "COUNTRY_CENTROID"
              : "VERIFIED",
        };
      }
    }

    for (const location of persisted) {
      const coords = getSafeCoordinates(location);
      if (!coords) continue;
      return {
        name: location.name,
        latitude: coords.lat,
        longitude: coords.lng,
        resolutionMethod: location.resolutionMethod ?? "DATABASE",
        confidenceScore: location.confidenceScore,
        resolutionStatus:
          location.resolutionStatus === "COUNTRY_CENTROID"
            ? "COUNTRY_CENTROID"
            : "VERIFIED",
      };
    }

    return null;
  }

  private async resolveViaGeocoding(
    names: string[],
    countryHint?: string | null
  ): Promise<ResolvedCoordinates | null> {
    for (const name of names) {
      const query = countryHint ? `${name}, ${countryHint}` : name;
      const validated = await locationValidationService.validateLocations([
        { name: query, latitude: null, longitude: null },
      ]);
      const loc = validated[0];
      const coords = getSafeCoordinates(loc);
      if (!coords) continue;

      return {
        name: loc!.name,
        latitude: coords.lat,
        longitude: coords.lng,
        resolutionMethod: "NOMINATIM",
        confidenceScore: loc?.confidence ?? 0.65,
        resolutionStatus: "VERIFIED",
      };
    }

    return null;
  }
}

export const crisisCoordinateRepairService = new CrisisCoordinateRepairService();
