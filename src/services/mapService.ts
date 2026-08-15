import {
  getCrisisIconKey,
  getRiskZoneColor,
  computeRiskZoneRadius,
} from "@/lib/mapConstants";
import { resolveCountryCentroidFromTexts } from "@/lib/countryCentroids";
import {
  getSafeCoordinates,
  hasValidCoordinates,
} from "@/lib/coordinates";
import { isBlacklistedLocationName } from "@/lib/locationBlacklist";
import { isPendingLocationName, isPendingLocationRecord } from "@/lib/safeCoordinateResolver";
import { resolveLocationParts } from "@/lib/locationDisplay";
import { decodeLocationMeta } from "@/lib/locationConfidence";
import type { CoordinatePrecision, MapVerificationStatus } from "@/lib/mapMarkers";
import { mapRepository } from "@/repositories/mapRepository";
import { masterIncidentRepository } from "@/repositories/masterIncidentRepository";
import { mapIntelligenceRecord } from "@/repositories/masterIncidentIntelligenceRepository";
import { resolveOperationalIntelligence } from "@/lib/operationalIntelligenceResolver";
import { verificationRepository } from "@/repositories/verificationRepository";
import { locationValidationService } from "@/services/locationValidationService";
import { crisisCoordinateRepairService } from "@/services/crisisCoordinateRepairService";
import type { MapPageData, MapRiskZone, MapStatistics } from "@/types";
import type {
  Location,
  LocationResolutionStatus,
  PriorityLevel,
  RiskLevel,
  RiskProjection,
  RiskTrend,
} from "@prisma/client";

const UNSPECIFIED_LOCATION = "unspecified location";

const COUNTRY_LEVEL_NAMES = new Set([
  "syria",
  "sudan",
  "ukraine",
  "yemen",
  "haiti",
  "iraq",
  "somalia",
  "afghanistan",
  "palestine",
]);

interface ReportContext {
  reportId: string;
  reportTitle: string;
  sourceName: string;
  reportDate: string;
  crisisType: string | null;
  affectedPopulation: number | null;
  priorityLevel: PriorityLevel;
  locationName: string | null;
  locationEntityNames: string[];
  reliabilityScore: number | null;
  locationConfidence: number | null;
}

interface PersistedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  resolutionStatus?: LocationResolutionStatus;
}

type CrisisWithDetails = Awaited<
  ReturnType<typeof mapRepository.getCrisesWithRegionDetails>
>[number];

type AnalysedReport = Awaited<
  ReturnType<typeof mapRepository.getAnalysedReportsWithExtractions>
>[number];

function parseJsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function verificationKey(country: string, city: string, crisisType: string): string {
  return `${country.toLowerCase()}::${city.toLowerCase()}::${crisisType.toLowerCase()}`;
}

function parseBoundaryPolygon(value: unknown): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 3) return null;

  const polygon = value
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const latitude = Number(point[0]);
      const longitude = Number(point[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return [latitude, longitude] as [number, number];
    })
    .filter((point): point is [number, number] => point !== null);

  return polygon.length >= 3 ? polygon : null;
}

function inferCoordinatePrecision(
  locationName: string,
  confidence: number | null,
  verified: boolean
): CoordinatePrecision {
  if (!verified) return "unknown";
  if (COUNTRY_LEVEL_NAMES.has(locationName.trim().toLowerCase())) return "country_centroid";
  if (confidence !== null && confidence >= 85) return "exact";
  if (confidence !== null && confidence >= 50) return "approximate";
  return "approximate";
}

export class MapService {
  async getMapPageData(options?: { readOnly?: boolean }): Promise<MapPageData> {
    const [crises, reports, verifications, persistedLocations, locationsWithRisk] =
      await Promise.all([
        mapRepository.getCrisesWithRegionDetails(),
        mapRepository.getAnalysedReportsWithExtractions(),
        verificationRepository.findAll(100),
        mapRepository.getAllPersistedLocations(),
        mapRepository.getLocationsWithLatestRisk(),
      ]);

    const verificationByKey = new Map(
      verifications.map((verification) => [
        verificationKey(
          verification.country,
          verification.city,
          verification.crisisType
        ),
        verification,
      ])
    );

    const locationByName = new Map(
      persistedLocations.map((location) => [location.name.toLowerCase(), location])
    );
    const riskByLocationId = new Map<string, RiskProjection>(
      locationsWithRisk.flatMap((location) =>
        location.riskProjections[0]
          ? [[location.id, location.riskProjections[0]] as const]
          : []
      )
    );

    const reportByLocation = this.buildReportLocationIndex(reports);
    const zones: MapRiskZone[] = [];
    const seenCrisisIds = new Set<string>();
    const skippedReasons: string[] = [];
    const reportById = new Map(
      reports.map((report) => [report.id, this.buildReportContext(report)])
    );

    for (const crisis of crises) {
      if (seenCrisisIds.has(crisis.id)) continue;
      seenCrisisIds.add(crisis.id);

      const relatedLocations =
        crisis.relatedLocations.length > 0
          ? crisis.relatedLocations
              .map((entry) => entry.location)
              .filter((location): location is NonNullable<typeof location> =>
                location != null
              )
          : crisis.location
            ? [crisis.location]
            : [];

      let validRelated: PersistedLocation[] = relatedLocations.flatMap(
        (location) => {
          if (
            isPendingLocationRecord(location) ||
            this.shouldSkipLocation(
              location.name,
              location.latitude,
              location.longitude,
              location.resolutionStatus
            )
          ) {
            return [];
          }
          const coords = getSafeCoordinates(location);
          if (!coords) return [];
          return [
            {
              id: location.id,
              name: location.name,
              latitude: coords.lat,
              longitude: coords.lng,
              resolutionStatus: location.resolutionStatus,
            },
          ];
        }
      );

      const reportContext =
        (crisis.reportId ? reportById.get(crisis.reportId) : null) ??
        this.findReportContext(validRelated, reportByLocation);
      validRelated = this.enrichWithReportLocations(
        validRelated,
        reportContext,
        locationByName
      );

      if (
        validRelated.length === 0 &&
        crisis.centroidLatitude !== null &&
        crisis.centroidLongitude !== null &&
        hasValidCoordinates(crisis.centroidLatitude, crisis.centroidLongitude)
      ) {
        validRelated = [
          {
            id: crisis.location?.id ?? crisis.id,
            name: crisis.location?.name ?? "Unknown Region",
            latitude: crisis.centroidLatitude,
            longitude: crisis.centroidLongitude,
          },
        ];
      }

      if (validRelated.length === 0) {
        if (crisis.reportId && !options?.readOnly) {
          const repaired = await crisisCoordinateRepairService
            .repairForReport(crisis.reportId)
            .catch(() => ({ repaired: false, message: "repair failed" }));

          if (repaired.repaired) {
            const refreshed = (
              await mapRepository.getCrisesWithRegionDetails()
            ).find((row) => row.id === crisis.id);
            const target = refreshed ?? crisis;
            const locationCoords = getSafeCoordinates(target.location);
            if (locationCoords) {
              validRelated = [
                {
                  id: target.location!.id,
                  name: target.location!.name,
                  latitude: locationCoords.lat,
                  longitude: locationCoords.lng,
                  resolutionStatus: target.location!.resolutionStatus,
                },
              ];
            } else if (
              target.centroidLatitude !== null &&
              target.centroidLongitude !== null &&
              hasValidCoordinates(target.centroidLatitude, target.centroidLongitude)
            ) {
              validRelated = [
                {
                  id: target.location?.id ?? target.id,
                  name: target.location?.name ?? "Unknown Region",
                  latitude: target.centroidLatitude,
                  longitude: target.centroidLongitude,
                },
              ];
            }
          }
        }

        if (validRelated.length === 0 && reportContext && !options?.readOnly) {
          const geocoded = await this.tryGeocodeLocationNames(
            reportContext.locationEntityNames
          );
          if (geocoded) {
            validRelated = [geocoded];
          }
        }
      }

      if (validRelated.length === 0) {
        skippedReasons.push(
          `crisis ${crisis.id} (${crisis.crisisType}): no valid coordinates`
        );
        continue;
      }

      const risk = this.resolveRiskForCrisis(crisis, riskByLocationId);
      if (!risk) {
        skippedReasons.push(
          `crisis ${crisis.id} (${crisis.crisisType}): no risk projection`
        );
        continue;
      }

      const zone = this.buildZone({
        zoneId: crisis.reportId ? `crisis-${crisis.id}` : crisis.id,
        crisis,
        locations: validRelated.slice(0, 1),
        risk,
        reportContext,
        verificationByKey,
        locationPending: crisis.location
          ? isPendingLocationRecord(crisis.location)
          : false,
        countryCentroid:
          crisis.location?.resolutionStatus === "COUNTRY_CENTROID",
      });

      if (zone) zones.push(zone);
    }

    const reportsWithZones = new Set(
      zones
        .map((zone) => zone.reportId)
        .filter((reportId): reportId is string => Boolean(reportId))
    );

    const fallbackZones = await this.buildFallbackZonesFromReports({
      reports,
      locationByName,
      riskByLocationId,
      reportsWithZones,
      verificationByKey,
      skippedReasons,
      readOnly: options?.readOnly ?? false,
    });
    zones.push(...fallbackZones);

    if (skippedReasons.length > 0) {
      console.info(
        `[Map] Skipped ${skippedReasons.length} zone(s): ${skippedReasons.slice(0, 5).join("; ")}`
      );
    }

    const renderableZones = zones.filter(
      (zone) =>
        !zone.locationPending &&
        hasValidCoordinates(zone.latitude, zone.longitude)
    );

    const correlatedZones = await this.applyMasterIncidentOverlay(renderableZones);

    correlatedZones.sort(
      (a, b) =>
        (b.dynamicPriorityScore ?? 0) - (a.dynamicPriorityScore ?? 0) ||
        this.riskWeight(b.riskLevel) - this.riskWeight(a.riskLevel) ||
        (b.affectedPopulation ?? 0) - (a.affectedPopulation ?? 0)
    );

    return {
      zones: correlatedZones,
      statistics: this.buildStatistics(correlatedZones),
      latestIncidents: correlatedZones.slice(0, 5),
    };
  }

  private async tryGeocodeLocationNames(
    names: string[]
  ): Promise<PersistedLocation | null> {
    for (const name of names) {
      if (!name.trim() || isBlacklistedLocationName(name)) continue;

      try {
        const validated = await locationValidationService.validateLocations([
          { name, latitude: null, longitude: null },
        ]);
        const loc = validated[0];
        const coords = getSafeCoordinates(loc);
        if (coords) {
          return {
            id: `geocoded-${name.toLowerCase().replace(/\s+/g, "-")}`,
            name: loc!.name,
            latitude: coords.lat,
            longitude: coords.lng,
          };
        }
      } catch {
        // Geocoding failures must not break map rendering
      }
    }
    return null;
  }

  private resolveRiskForCrisis(
    crisis: CrisisWithDetails,
    riskByLocationId: Map<string, RiskProjection>
  ): RiskProjection | null {
    if (crisis.riskProjections[0]) return crisis.riskProjections[0];
    if (crisis.location?.riskProjections?.[0]) {
      return crisis.location.riskProjections[0];
    }
    const linkedRisk = riskByLocationId.get(crisis.locationId);
    if (linkedRisk) return linkedRisk;

    for (const entry of crisis.relatedLocations) {
      if (entry.location?.riskProjections?.[0]) {
        return entry.location.riskProjections[0];
      }
      const relatedRisk = riskByLocationId.get(entry.locationId);
      if (relatedRisk) return relatedRisk;
    }

    return null;
  }

  private enrichWithReportLocations(
    validRelated: PersistedLocation[],
    reportContext: ReportContext | null,
    locationByName: Map<string, Location>
  ): PersistedLocation[] {
    if (!reportContext) return validRelated;

    const extras: PersistedLocation[] = [];
    for (const entityName of reportContext.locationEntityNames) {
      const persisted = locationByName.get(entityName.toLowerCase());
      if (!persisted) continue;
      const persistedCoords = getSafeCoordinates(persisted);
      if (
        !persistedCoords ||
        this.shouldSkipLocation(
          persisted.name,
          persistedCoords.lat,
          persistedCoords.lng,
          persisted.resolutionStatus
        )
      ) {
        continue;
      }
      if (validRelated.some((location) => location.id === persisted.id)) continue;
      if (this.isCountryLevelLocation(persisted.name)) continue;
      extras.push({
        id: persisted.id,
        name: persisted.name,
        latitude: persistedCoords.lat,
        longitude: persistedCoords.lng,
        resolutionStatus: persisted.resolutionStatus,
      });
    }

    if (extras.length === 0) return validRelated;

    const withoutCountryOnly = validRelated.filter(
      (location) => !this.isCountryLevelLocation(location.name)
    );

    return [...withoutCountryOnly, ...extras].length > 0
      ? [...withoutCountryOnly, ...extras]
      : [...validRelated, ...extras];
  }

  private async buildFallbackZonesFromReports(input: {
    reports: AnalysedReport[];
    locationByName: Map<string, Location>;
    riskByLocationId: Map<string, RiskProjection>;
    reportsWithZones: Set<string>;
    verificationByKey: Map<
      string,
      Awaited<ReturnType<typeof verificationRepository.findAll>>[number]
    >;
    skippedReasons: string[];
    readOnly?: boolean;
  }): Promise<MapRiskZone[]> {
    const {
      reports,
      locationByName,
      riskByLocationId,
      reportsWithZones,
      verificationByKey,
      skippedReasons,
      readOnly = false,
    } = input;

    const fallbackZones: MapRiskZone[] = [];

    for (const report of reports) {
      if (reportsWithZones.has(report.id)) continue;

      const locationEntities = report.extractedEntities.filter(
        (entity) => entity.entityType === "LOCATION"
      );

      const matchedLocations = locationEntities.flatMap((entity) => {
        const location = locationByName.get(entity.value.toLowerCase());
        if (!location) return [];
        const coords = getSafeCoordinates(location);
        if (
          !coords ||
          this.shouldSkipLocation(location.name, coords.lat, coords.lng)
        ) {
          return [];
        }
        return [location];
      });

      if (matchedLocations.length === 0) {
        if (readOnly) {
          skippedReasons.push(`report-${report.id}: no persisted coordinates (read-only)`);
          continue;
        }
        const entityTexts = locationEntities.map((entity) => entity.value);
        const geocoded = await this.tryGeocodeLocationNames(entityTexts);

        if (geocoded && report.priorityAssessment && report.reliabilityAssessment) {
          const crisisType =
            report.extractedEntities.find(
              (entity) => entity.entityType === "CRISIS_TYPE"
            )?.value ?? null;

          const populationEntity = report.extractedEntities.find(
            (entity) => entity.entityType === "AFFECTED_POPULATION"
          );

          const reportContext: ReportContext = {
            reportId: report.id,
            reportTitle: report.title,
            sourceName: report.source.name,
            reportDate: report.reportDate.toISOString(),
            crisisType,
            affectedPopulation: populationEntity
              ? parseInt(populationEntity.value, 10) || null
              : null,
            priorityLevel: report.priorityAssessment.priorityLevel,
            locationName: geocoded.name,
            locationEntityNames: entityTexts,
            reliabilityScore: report.reliabilityAssessment.finalScore,
            locationConfidence: 55,
          };

          const risk = riskByLocationId.get(geocoded.id) ?? {
            riskLevel: report.priorityAssessment.priorityLevel as RiskLevel,
            trend: "Stable" as RiskTrend,
            confidenceScore: report.reliabilityAssessment.finalScore,
          };

          const zone = this.buildZone({
            zoneId: `report-${report.id}-geocoded`,
            crisis: null,
            locations: [geocoded],
            risk,
            reportContext,
            verificationByKey,
          });

          if (zone) fallbackZones.push(zone);
          continue;
        }

        const centroid = resolveCountryCentroidFromTexts(entityTexts);

        if (centroid && report.priorityAssessment && report.reliabilityAssessment) {
          const syntheticId = `centroid-${report.id}`;

          const crisisType =
            report.extractedEntities.find(
              (entity) => entity.entityType === "CRISIS_TYPE"
            )?.value ?? null;

          const populationEntity = report.extractedEntities.find(
            (entity) => entity.entityType === "AFFECTED_POPULATION"
          );

          const reportContext: ReportContext = {
            reportId: report.id,
            reportTitle: report.title,
            sourceName: report.source.name,
            reportDate: report.reportDate.toISOString(),
            crisisType,
            affectedPopulation: populationEntity
              ? parseInt(populationEntity.value, 10) || null
              : null,
            priorityLevel: report.priorityAssessment.priorityLevel,
            locationName: centroid.name,
            locationEntityNames: entityTexts,
            reliabilityScore: report.reliabilityAssessment.finalScore,
            locationConfidence: 45,
          };

          const zone = this.buildZone({
            zoneId: `report-${report.id}-centroid`,
            crisis: null,
            locations: [
              {
                id: syntheticId,
                name: centroid.name,
                latitude: centroid.lat,
                longitude: centroid.lng,
              },
            ],
            risk: {
              riskLevel: report.priorityAssessment.priorityLevel as RiskLevel,
              trend: "Stable",
              confidenceScore: report.reliabilityAssessment.finalScore,
            },
            reportContext,
            verificationByKey,
          });

          if (zone) {
            zone.coordinatePrecision = "country_centroid";
            zone.locationVerified = true;
            zone.countryName = centroid.name;
            zone.cityName = "—";
            zone.displayLocation = `${centroid.name} (estimated region)`;
            fallbackZones.push(zone);
          }
          continue;
        }

        skippedReasons.push(`report ${report.id}: location pending`);
        continue;
      }

      const reportRisks = matchedLocations
        .map((location) => riskByLocationId.get(location.id))
        .filter((risk): risk is RiskProjection => risk !== undefined);

      const sharedRisk = reportRisks[0] ?? null;
      if (!sharedRisk) {
        skippedReasons.push(
          `report ${report.id}: no risk projection linked to report locations`
        );
        continue;
      }

      const crisisType =
        report.extractedEntities.find(
          (entity) => entity.entityType === "CRISIS_TYPE"
        )?.value ?? null;

      const populationEntity = report.extractedEntities.find(
        (entity) => entity.entityType === "AFFECTED_POPULATION"
      );

      const locationEntity = locationEntities[0];
      const locationMeta = locationEntity
        ? decodeLocationMeta(locationEntity.severity)
        : null;

      const reportContext: ReportContext = {
        reportId: report.id,
        reportTitle: report.title,
        sourceName: report.source.name,
        reportDate: report.reportDate.toISOString(),
        crisisType,
        affectedPopulation: populationEntity
          ? parseInt(populationEntity.value, 10) || null
          : null,
        priorityLevel: report.priorityAssessment!.priorityLevel,
        locationName: locationEntity?.value ?? null,
        locationEntityNames: locationEntities.map((entity) => entity.value),
        reliabilityScore: report.reliabilityAssessment?.finalScore ?? null,
        locationConfidence: locationMeta
          ? Math.round(locationMeta.confidence * 100)
          : null,
      };

      const displayLocations = matchedLocations.filter(
        (location) => !this.isCountryLevelLocation(location.name)
      );
      const locationsToRender =
        (displayLocations.length > 0 ? displayLocations : matchedLocations).slice(
          0,
          1
        );

      for (const location of locationsToRender) {
        const coords = getSafeCoordinates(location);
        if (!coords) continue;

        const risk = riskByLocationId.get(location.id) ?? sharedRisk;
        const zone = this.buildZone({
          zoneId: `report-${report.id}-${location.id}`,
          crisis: null,
          locations: [
            {
              id: location.id,
              name: location.name,
              latitude: coords.lat,
              longitude: coords.lng,
            },
          ],
          risk,
          reportContext,
          verificationByKey,
        });

        if (zone) fallbackZones.push(zone);
      }
    }

    return fallbackZones;
  }

  private buildZone(input: {
    zoneId: string;
    crisis: CrisisWithDetails | null;
    locations: PersistedLocation[];
    risk: Pick<RiskProjection, "riskLevel" | "trend" | "confidenceScore">;
    reportContext: ReportContext | null;
    verificationByKey: Map<
      string,
      Awaited<ReturnType<typeof verificationRepository.findAll>>[number]
    >;
    locationPending?: boolean;
    countryCentroid?: boolean;
  }): MapRiskZone | null {
    const {
      zoneId,
      crisis,
      locations,
      risk,
      reportContext,
      verificationByKey,
      locationPending = false,
      countryCentroid = false,
    } = input;

    const primaryLocation = locations[0];
    if (!primaryLocation) {
      return null;
    }

    const primaryCoords = getSafeCoordinates(primaryLocation);
    if (
      locationPending ||
      isPendingLocationName(primaryLocation.name) ||
      !primaryCoords
    ) {
      return null;
    }
    const affectedPopulation =
      reportContext?.affectedPopulation ??
      (crisis ? this.extractPopulationFromCrisisDescription(crisis.description) : null);

    const crisisType =
      crisis?.crisisType ?? reportContext?.crisisType ?? null;
    const parts = resolveLocationParts(primaryLocation.name);
    const countryName = parts.verified ? parts.country : "—";
    const relatedLocationNames = locations.map((location) => location.name);
    const cityName =
      locations.length > 1
        ? relatedLocationNames.join(", ")
        : parts.verified
          ? parts.city
          : "—";
    const regionLabel =
      crisis?.regionLabel ?? (parts.verified ? `${countryName} Crisis Region` : null);

    const centroidLatitude =
      crisis?.centroidLatitude ?? primaryCoords.lat;
    const centroidLongitude =
      crisis?.centroidLongitude ?? primaryCoords.lng;

    if (!hasValidCoordinates(centroidLatitude, centroidLongitude)) {
      return null;
    }

    const boundaryPolygon = Array.isArray(crisis?.boundaryPolygon)
      ? (crisis.boundaryPolygon as [number, number][])
      : null;

    const locationConfidence = reportContext?.locationConfidence ?? null;
    const isCountryCentroid =
      countryCentroid ||
      primaryLocation.resolutionStatus === "COUNTRY_CENTROID";

    const displayLocation = isCountryCentroid
      ? `${parts.display || primaryLocation.name} (approximate)`
      : parts.verified
        ? locations.length > 1
          ? `${regionLabel} (${relatedLocationNames.slice(0, 3).join(", ")}${relatedLocationNames.length > 3 ? "…" : ""})`
          : parts.display
        : parts.city !== "Location could not yet be verified"
          ? parts.display
          : "—";

    const verification = verificationByKey.get(
      verificationKey(
        parts.verified ? parts.country : "",
        parts.verified ? parts.city : "",
        crisisType ?? "Unclassified"
      )
    );

    let verificationStatus: MapVerificationStatus = "Single Source";
    if (verification) {
      const consistency = verification.informationConsistencyScore / 100;
      if (verification.comparedSources >= 2) {
        if (consistency >= 0.75) verificationStatus = "Verified";
        else if (consistency >= 0.5) verificationStatus = "Partially Corroborated";
        else verificationStatus = "Conflicting Sources";
      }
    }

    const sourceNames = verification
      ? parseJsonStringArray(verification.sourceNames)
      : reportContext?.sourceName
        ? [reportContext.sourceName]
        : [];

    const coordinatePrecision = isCountryCentroid
      ? "country_centroid"
      : inferCoordinatePrecision(
          primaryLocation.name,
          locationConfidence,
          parts.verified
        );

    const humanitarianNeeds =
      crisis?.humanitarianNeeds.map((need) => ({
        needType: need.needType,
        severity: need.severity,
        source: need.source ?? undefined,
        evidence: need.evidence ?? undefined,
        reasoning: need.reasoning ?? undefined,
        confidence: need.confidenceScore ?? undefined,
      })) ?? [];

    return {
      id: zoneId,
      locationId: primaryLocation.id,
      locationName: primaryLocation.name,
      cityName,
      countryName,
      displayLocation,
      regionLabel,
      latitude: centroidLatitude,
      longitude: centroidLongitude,
      riskLevel: risk.riskLevel,
      trend: risk.trend as RiskTrend,
      confidenceScore: risk.confidenceScore,
      crisisType,
      crisisIconKey: getCrisisIconKey(crisisType),
      priorityLevel: reportContext?.priorityLevel ?? null,
      reliabilityScore: reportContext?.reliabilityScore ?? null,
      affectedPopulation,
      humanitarianNeeds,
      reportId: reportContext?.reportId ?? null,
      reportTitle: reportContext?.reportTitle ?? null,
      radiusMeters: computeRiskZoneRadius({
        riskLevel: risk.riskLevel,
        crisisType,
        confidenceScore: risk.confidenceScore,
        locationConfidence,
        priorityLevel: reportContext?.priorityLevel ?? null,
        affectedPopulation,
        countryCentroid: isCountryCentroid,
      }),
      fillColor: getRiskZoneColor(risk.riskLevel),
      boundaryPolygon,
      relatedLocations: locations.flatMap((location) => {
        const coords = getSafeCoordinates(location);
        if (!coords) return [];
        return [
          {
            name: location.name,
            latitude: coords.lat,
            longitude: coords.lng,
          },
        ];
      }),
      sourceNames,
      consensusScore: verification?.consensusScore ?? null,
      verificationStatus,
      locationVerified: isCountryCentroid ? false : parts.verified,
      locationConfidence,
      coordinatePrecision,
      reportDate: reportContext?.reportDate ?? null,
      primarySource: reportContext?.sourceName ?? sourceNames[0] ?? null,
      locationPending: false,
    };
  }

  private findReportContext(
    locations: Array<{ name: string }>,
    reportByLocation: Map<string, ReportContext>
  ): ReportContext | null {
    for (const location of locations) {
      const context = reportByLocation.get(location.name.toLowerCase());
      if (context) return context;
    }
    return null;
  }

  private buildReportContext(report: AnalysedReport): ReportContext {
    const locationEntities = report.extractedEntities.filter(
      (entity) => entity.entityType === "LOCATION"
    );
    const crisisType =
      report.extractedEntities.find((entity) => entity.entityType === "CRISIS_TYPE")
        ?.value ?? null;
    const populationEntity = report.extractedEntities.find(
      (entity) => entity.entityType === "AFFECTED_POPULATION"
    );
    const locationMeta = decodeLocationMeta(locationEntities[0]?.severity);

    return {
      reportId: report.id,
      reportTitle: report.title,
      sourceName: report.source.name,
      reportDate: report.reportDate.toISOString(),
      crisisType,
      affectedPopulation: populationEntity
        ? parseInt(populationEntity.value, 10) || null
        : null,
      priorityLevel: report.priorityAssessment!.priorityLevel,
      locationName: locationEntities[0]?.value ?? null,
      locationEntityNames: locationEntities.map((entity) => entity.value),
      reliabilityScore: report.reliabilityAssessment?.finalScore ?? null,
      locationConfidence: locationMeta
        ? Math.round(locationMeta.confidence * 100)
        : null,
    };
  }

  private buildReportLocationIndex(
    reports: AnalysedReport[]
  ): Map<string, ReportContext> {
    const index = new Map<string, ReportContext>();

    for (const report of reports) {
      const locationEntities = report.extractedEntities.filter(
        (entity) => entity.entityType === "LOCATION"
      );
      if (locationEntities.length === 0) continue;

      const context = this.buildReportContext(report);

      for (const locationEntity of locationEntities) {
        const key = locationEntity.value.toLowerCase();
        if (!index.has(key)) {
          index.set(key, {
            ...context,
            locationName: locationEntity.value,
          });
        }
      }
    }

    return index;
  }

  private shouldSkipLocation(
    name: string,
    latitude: number | null | undefined,
    longitude: number | null | undefined,
    resolutionStatus?: LocationResolutionStatus | null
  ): boolean {
    if (resolutionStatus && isPendingLocationRecord({ name, resolutionStatus })) {
      return true;
    }
    if (isPendingLocationName(name)) return true;
    if (name.trim().toLowerCase() === UNSPECIFIED_LOCATION) return true;
    if (isBlacklistedLocationName(name)) return true;
    return !hasValidCoordinates(latitude ?? null, longitude ?? null);
  }

  private isCountryLevelLocation(name: string): boolean {
    return COUNTRY_LEVEL_NAMES.has(name.trim().toLowerCase());
  }

  private extractPopulationFromCrisisDescription(
    description: string | null
  ): number | null {
    if (!description) return null;
    const match = description.match(
      /Estimated affected population:\s*([\d,]+)/i
    );
    if (!match) return null;
    return parseInt(match[1].replace(/,/g, ""), 10) || null;
  }

  private riskWeight(level: RiskLevel): number {
    switch (level) {
      case "Critical":
        return 4;
      case "High":
        return 3;
      case "Medium":
        return 2;
      default:
        return 1;
    }
  }

  private async applyMasterIncidentOverlay(
    zones: MapRiskZone[]
  ): Promise<MapRiskZone[]> {
    const masters = await masterIncidentRepository.findAllOrdered(250);
    const nonCanonicalReportIds = new Set<string>();
    const masterByCanonicalReportId = new Map<
      string,
      (typeof masters)[number]
    >();

    for (const master of masters) {
      for (const member of master.members) {
        if (member.isCanonical) {
          masterByCanonicalReportId.set(member.reportId, master);
        } else {
          nonCanonicalReportIds.add(member.reportId);
        }
      }
    }

    const deduped = zones.filter(
      (zone) => !zone.reportId || !nonCanonicalReportIds.has(zone.reportId)
    );

    return deduped.map((zone) => {
      if (!zone.reportId) return zone;
      const master = masterByCanonicalReportId.get(zone.reportId);
      if (!master) return zone;

      const sourceNames = Array.isArray(master.sourceNames)
        ? (master.sourceNames as string[])
        : zone.sourceNames;
      const linkedReportIds = Array.isArray(master.reportIds)
        ? (master.reportIds as string[])
        : [];

      const intelligence = master.intelligence
        ? mapIntelligenceRecord(master.intelligence)
        : null;
      const operational = resolveOperationalIntelligence({
        master,
        intelligence,
        reportFallback: {
          priorityLevel: zone.priorityLevel ?? "Medium",
          priorityScore: master.dynamicPriorityScore,
          verificationStatus: master.correlationVerificationStatus,
          confidence: master.confidenceScore,
        },
      });

      return {
        ...zone,
        masterIncidentId: master.id,
        supportingReportCount: operational.supportingReportCount,
        independentSourceCount: operational.independentSourceCount,
        sourceAgreementPercent: operational.sourceAgreementPercent,
        correlationVerificationStatus: operational.verificationStatus,
        dynamicPriorityScore: operational.dynamicPriorityScore,
        dynamicPriorityLevel: operational.priorityLevel,
        linkedReportIds,
        sourceNames,
        priorityLevel: operational.priorityLevel,
        riskLevel: operational.riskLevel,
        confidenceScore: Math.round(operational.confidence * 100),
      };
    });
  }

  private buildStatistics(zones: MapRiskZone[]): MapStatistics {
    const crisisTypes = [
      ...new Set(
        zones
          .map((zone) => zone.crisisType)
          .filter((type): type is string => type !== null)
      ),
    ].sort();

    return {
      totalZones: zones.length,
      criticalZones: zones.filter((zone) => zone.riskLevel === "Critical").length,
      highZones: zones.filter((zone) => zone.riskLevel === "High").length,
      mediumZones: zones.filter((zone) => zone.riskLevel === "Medium").length,
      lowZones: zones.filter((zone) => zone.riskLevel === "Low").length,
      totalAffectedPopulation: zones.reduce(
        (total, zone) => total + (zone.affectedPopulation ?? 0),
        0
      ),
      crisisTypes,
    };
  }
}

export const mapService = new MapService();
