import type { Location, RiskLevel } from "@prisma/client";
import { getSafeCoordinates } from "@/lib/coordinates";
import { computeCrisisRegionGeometry } from "@/lib/crisisRegionGeometry";
import { resolveLocationParts } from "@/lib/locationDisplay";

export interface CrisisRegionInput {
  locations: Location[];
  crisisType: string | null;
  riskLevel: RiskLevel;
  affectedPopulation: number | null;
}

export interface CrisisRegionResult {
  centroidLatitude: number;
  centroidLongitude: number;
  affectedRadiusMeters: number;
  boundaryPolygon: [number, number][];
  regionLabel: string;
  countryName: string;
  relatedLocationIds: string[];
  relatedLocationNames: string[];
}

export class CrisisRegionService {
  buildRegion(input: CrisisRegionInput): CrisisRegionResult | null {
    const { locations, crisisType, riskLevel, affectedPopulation } = input;
    if (locations.length === 0) return null;

    const countryName = resolveLocationParts(locations[0].name).country;
    const sameCountryLocations = locations.filter(
      (location) => resolveLocationParts(location.name).country === countryName
    );
    const regionLocations = (
      sameCountryLocations.length > 0 ? sameCountryLocations : locations
    ).filter((location) => location != null);

    const geometry = computeCrisisRegionGeometry(
      regionLocations.flatMap((location) => {
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
      countryName,
      crisisType,
      riskLevel,
      affectedPopulation
    );

    if (!geometry) return null;

    return {
      ...geometry,
      countryName,
      relatedLocationIds: regionLocations.map((location) => location.id),
      relatedLocationNames: regionLocations.map((location) => location.name),
    };
  }
}

export const crisisRegionService = new CrisisRegionService();
