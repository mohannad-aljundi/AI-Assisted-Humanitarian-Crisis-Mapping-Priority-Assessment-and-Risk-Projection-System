import { randomUUID } from "node:crypto";
import {
  findGeographicMentions,
  type GeographicEntity,
  uniqueCountries,
} from "@/lib/humanitarianGeography";

export interface SplitIncidentDraft {
  draftId: string;
  country: string;
  city: string | null;
  region: string | null;
  locationLabel: string;
  segmentTitleSuffix: string;
  segmentContent: string;
  geographicKeys: string[];
}

function splitIntoSegments(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(/(?<=[.!?])\s+|\s*;\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) return parts;

  return trimmed
    .split(/\s*,\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mentionsEntity(text: string, geo: GeographicEntity): boolean {
  const normalised = text.toLowerCase();
  return geo.aliases.some((alias) =>
    new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
      normalised
    )
  );
}

function buildLocationLabel(geo: GeographicEntity): string {
  if (geo.city && geo.country) {
    return geo.city.toLowerCase() === geo.country.toLowerCase()
      ? geo.country
      : `${geo.city}, ${geo.country}`;
  }
  return geo.country;
}

function pickPrimaryEntity(
  mentions: GeographicEntity[],
  country: string
): GeographicEntity {
  const inCountry = mentions.filter((geo) => geo.country === country);
  const cityOrRegion = inCountry.find((geo) => geo.type !== "country");
  if (cityOrRegion) return cityOrRegion;
  return (
    inCountry[0] ??
    mentions.find((geo) => geo.country === country) ?? {
      key: country.toLowerCase(),
      label: country,
      country,
      city: null,
      region: null,
      aliases: [country.toLowerCase()],
      type: "country",
    }
  );
}

function buildDraftForCountry(
  country: string,
  segments: string[],
  title: string,
  allMentions: GeographicEntity[]
): SplitIncidentDraft {
  const primary = pickPrimaryEntity(allMentions, country);
  const relevantSegments = segments.filter((segment) => {
    const segmentMentions = findGeographicMentions(segment);
    return segmentMentions.some((geo) => geo.country === country);
  });

  const contextSegments =
    relevantSegments.length > 0
      ? relevantSegments
      : segments.filter((segment) => mentionsEntity(segment, primary));

  const segmentContent = [...new Set([title, ...contextSegments])]
    .filter(Boolean)
    .join(" ")
    .trim();

  const locationLabel = buildLocationLabel(primary);

  return {
    draftId: randomUUID(),
    country,
    city: primary.city,
    region: primary.region,
    locationLabel,
    segmentTitleSuffix: locationLabel,
    segmentContent,
    geographicKeys: allMentions
      .filter((geo) => geo.country === country)
      .map((geo) => geo.key),
  };
}

export class IncidentSplittingService {
  /**
   * Splits a multi-location humanitarian article into independent incident drafts.
   * Each draft contains only the text relevant to one geographic context.
   */
  splitArticle(title: string, content: string): SplitIncidentDraft[] {
    const combined = `${title}. ${content}`.trim();
    const segments = splitIntoSegments(combined);
    const allMentions = findGeographicMentions(combined);
    const countries = uniqueCountries(allMentions);

    if (countries.length <= 1) {
      const primary = allMentions[0];
      return [
        {
          draftId: randomUUID(),
          country: primary?.country ?? "Unknown",
          city: primary?.city ?? null,
          region: primary?.region ?? null,
          locationLabel: primary ? buildLocationLabel(primary) : "Unknown",
          segmentTitleSuffix: primary ? buildLocationLabel(primary) : "Incident",
          segmentContent: combined,
          geographicKeys: allMentions.map((geo) => geo.key),
        },
      ];
    }

    return countries.map((country) =>
      buildDraftForCountry(country, segments, title, allMentions)
    );
  }

  shouldSplit(drafts: SplitIncidentDraft[]): boolean {
    const countries = new Set(drafts.map((draft) => draft.country));
    return countries.size > 1;
  }
}

export const incidentSplittingService = new IncidentSplittingService();
