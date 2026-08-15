import { IngestionValidationError } from "@/lib/ingestionErrors";
import type { IngestionProviderId } from "@/types";

export const INGESTION_KEYWORDS = [
  "conflict",
  "flood",
  "earthquake",
  "displacement",
  "humanitarian",
  "medical emergency",
  "food shortage",
  "water shortage",
] as const;

export type IngestionKeyword = (typeof INGESTION_KEYWORDS)[number] | "all";

export type IngestionSource =
  | IngestionProviderId
  | "FALLBACK"
  | "ALL";

export const DEFAULT_INGESTION_SOURCE: IngestionSource = "FALLBACK";
export const DEFAULT_INGESTION_LIMIT = 10;
export const MAX_INGESTION_LIMIT = 50;

export const RELIEFWEB_DISABLED_NOTE = "Requires approved ReliefWeb appname";

export function isReliefWebIngestionEnabled(): boolean {
  return process.env.RELIEFWEB_APPNAME_APPROVED === "true";
}

export const KEYWORD_SEARCH_TERMS: Record<IngestionKeyword, string[]> = {
  all: [...INGESTION_KEYWORDS],
  conflict: ["conflict", "armed clash", "war"],
  flood: ["flood", "flooding", "inundation"],
  earthquake: ["earthquake", "seismic", "tremor"],
  displacement: ["displacement", "refugee", "displaced"],
  humanitarian: ["humanitarian", "crisis", "emergency"],
  "medical emergency": ["medical emergency", "health crisis", "outbreak"],
  "food shortage": ["food shortage", "famine", "hunger"],
  "water shortage": ["water shortage", "drought", "water crisis"],
};

export function resolveSearchQuery(keyword: IngestionKeyword): string {
  if (keyword === "all") {
    return INGESTION_KEYWORDS.join(" OR ");
  }
  return KEYWORD_SEARCH_TERMS[keyword].join(" OR ");
}

/** HDX CKAN search — broad humanitarian query for "all". */
export function resolveHdxSearchQuery(keyword: IngestionKeyword): string {
  if (keyword === "all") {
    return "humanitarian crisis disaster";
  }
  return resolveSearchQuery(keyword);
}

/** Disaster feeds return curated events — skip keyword filtering. */
export const KEYWORD_FILTER_BYPASS_PROVIDERS: IngestionProviderId[] = [
  "GDACS",
  "USGS",
  "EONET",
  "OCHA",
];

export function shouldBypassKeywordFilter(provider: IngestionProviderId): boolean {
  return KEYWORD_FILTER_BYPASS_PROVIDERS.includes(provider);
}

export function matchesIngestionKeywordForProvider(
  text: string,
  keyword: IngestionKeyword,
  provider?: IngestionProviderId
): boolean {
  if (provider && shouldBypassKeywordFilter(provider)) {
    return true;
  }
  return matchesIngestionKeyword(text, keyword);
}

function formatGdeltSearchTerm(term: string): string {
  const trimmed = term.trim();
  if (!trimmed) return trimmed;
  if (/\s/.test(trimmed)) {
    return `"${trimmed.replace(/"/g, "")}"`;
  }
  return trimmed;
}

/** GDELT DOC API requires parenthesised OR blocks and quoted phrases. */
export function resolveGdeltSearchQuery(keyword: IngestionKeyword): string {
  if (keyword === "all") {
    return "(humanitarian OR crisis OR conflict OR disaster OR flood OR earthquake OR displacement)";
  }

  const terms = KEYWORD_SEARCH_TERMS[keyword].map(formatGdeltSearchTerm);
  if (terms.length === 1) {
    return terms[0];
  }
  return `(${terms.join(" OR ")})`;
}

export function parseJsonResponse<T>(body: string, source: string): T {
  const trimmed = body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new Error(
      `${source} returned non-JSON response: ${trimmed.slice(0, 200)}`
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `${source} returned invalid JSON: ${trimmed.slice(0, 200)}`
    );
  }
}

export function matchesIngestionKeyword(
  text: string,
  keyword: IngestionKeyword
): boolean {
  const normalised = text.toLowerCase();
  const terms =
    keyword === "all" ? INGESTION_KEYWORDS : KEYWORD_SEARCH_TERMS[keyword];
  return terms.some((term) => normalised.includes(term.toLowerCase()));
}

const INGESTION_PROVIDER_IDS: IngestionProviderId[] = [
  "GDELT",
  "RELIEFWEB",
  "NEWSAPI",
  "UNNEWS",
  "GDACS",
  "USGS",
  "EONET",
  "GUARDIAN",
  "RSS",
  "OCHA",
  "ACLED",
  "HDX",
  "MANUAL",
];

const VALID_INGESTION_SOURCES: IngestionSource[] = [
  ...INGESTION_PROVIDER_IDS,
  "FALLBACK",
  "ALL",
];

export function isFallbackIngestionSource(source: IngestionSource): boolean {
  return source === "FALLBACK" || source === "ALL";
}

export function normaliseIngestionSource(value: string): IngestionSource | null {
  const upper = value.trim().toUpperCase();
  if (VALID_INGESTION_SOURCES.includes(upper as IngestionSource)) {
    return upper as IngestionSource;
  }
  return null;
}

export function assertIngestionSourceAllowed(source: IngestionSource): void {
  if (source === "RELIEFWEB" && !isReliefWebIngestionEnabled()) {
    throw new IngestionValidationError(
      `${RELIEFWEB_DISABLED_NOTE}. Register at https://apidoc.reliefweb.int/parameters#appname and set RELIEFWEB_APPNAME_APPROVED=true.`
    );
  }

  if (source === "NEWSAPI" && !process.env.NEWS_API_KEY?.trim()) {
    throw new IngestionValidationError(
      "NewsAPI requires NEWS_API_KEY in your environment."
    );
  }

  if (source === "GUARDIAN" && !process.env.GUARDIAN_API_KEY?.trim()) {
    throw new IngestionValidationError(
      "Guardian API requires GUARDIAN_API_KEY in your environment."
    );
  }
}
