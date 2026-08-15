import { gdeltRequestQueue } from "@/lib/gdeltRequestQueue";
import { isReliefWebIngestionEnabled } from "@/lib/ingestionConstants";
import type { IngestionProviderId, IngestionSourceInfo, IngestionSourceStatus } from "@/types";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export const FALLBACK_SOURCE_ORDER: IngestionProviderId[] = [
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

export const PROVIDER_LABELS: Record<IngestionProviderId, string> = {
  GDELT: "GDELT DOC API",
  RELIEFWEB: "ReliefWeb",
  NEWSAPI: "NewsAPI",
  UNNEWS: "UN News",
  GDACS: "GDACS",
  USGS: "USGS Earthquakes",
  EONET: "NASA EONET",
  GUARDIAN: "The Guardian",
  RSS: "RSS Feeds",
  OCHA: "UN OCHA",
  ACLED: "ACLED Conflict Data",
  HDX: "Humanitarian Data Exchange",
  MANUAL: "Manual Import",
};

export function isNewsApiConfigured(): boolean {
  return Boolean(process.env.NEWS_API_KEY?.trim());
}

export function isGuardianApiConfigured(): boolean {
  return Boolean(process.env.GUARDIAN_API_KEY?.trim());
}

export function isAcledConfigured(): boolean {
  return Boolean(
    process.env.ACLED_EMAIL?.trim() && process.env.ACLED_API_KEY?.trim()
  );
}

function isGdeltRateLimited(): boolean {
  return gdeltRequestQueue.isRecentlyRateLimited(RATE_LIMIT_WINDOW_MS);
}

function resolveGdeltStatus(): IngestionSourceStatus {
  if (isGdeltRateLimited()) return "rate_limited";
  return "available";
}

function resolveReliefWebStatus(): IngestionSourceStatus {
  if (!isReliefWebIngestionEnabled()) return "disabled";
  return "available";
}

function resolveNewsApiStatus(): IngestionSourceStatus {
  if (!isNewsApiConfigured()) return "requires_api_key";
  return "available";
}

function resolveGuardianStatus(): IngestionSourceStatus {
  if (!isGuardianApiConfigured()) return "requires_api_key";
  return "available";
}

function resolveAcledStatus(): IngestionSourceStatus {
  if (!isAcledConfigured()) return "requires_api_key";
  return "available";
}

export function getProviderStatus(id: IngestionProviderId): IngestionSourceStatus {
  switch (id) {
    case "GDELT":
      return resolveGdeltStatus();
    case "RELIEFWEB":
      return resolveReliefWebStatus();
    case "NEWSAPI":
      return resolveNewsApiStatus();
    case "GUARDIAN":
      return resolveGuardianStatus();
    case "ACLED":
      return resolveAcledStatus();
    case "RSS":
    case "OCHA":
    case "HDX":
    case "UNNEWS":
    case "GDACS":
    case "USGS":
    case "EONET":
    case "MANUAL":
      return "available";
    default:
      return "disabled";
  }
}

/** Remote sources that can appear in the UI and sync pipeline. */
export function isProviderOperational(id: IngestionProviderId): boolean {
  if (id === "MANUAL") return false;
  const status = getProviderStatus(id);
  return status === "available" || status === "rate_limited";
}

export function getOperationalProviderIds(): IngestionProviderId[] {
  return FALLBACK_SOURCE_ORDER.filter(isProviderOperational);
}

function resolveStatusMessage(
  id: IngestionProviderId,
  status: IngestionSourceStatus
): string {
  if (status === "available") {
    if (id === "NEWSAPI" && isNewsApiConfigured()) {
      return "Connected · Available · Active in ingestion pipeline";
    }
    return "Connected · Available · Ready to fetch crisis reports";
  }

  if (status === "rate_limited") {
    return "Connected · Temporarily rate limited — cached results may be used";
  }

  if (status === "requires_api_key") {
    return "Add the API key to your environment to enable this source.";
  }

  return "This source is disabled in the current configuration.";
}

export function getIngestionSourcesStatus(): IngestionSourceInfo[] {
  return getOperationalProviderIds().map((id) => {
    const status = getProviderStatus(id);
    return {
      id,
      name: PROVIDER_LABELS[id],
      status,
      statusMessage: resolveStatusMessage(id, status),
    };
  });
}

export function isProviderFetchable(id: IngestionProviderId): boolean {
  const status = getProviderStatus(id);
  return status === "available" || status === "rate_limited";
}

export function countConnectedSources(): number {
  return getOperationalProviderIds().filter(
    (id) => getProviderStatus(id) === "available"
  ).length;
}

export function getSelectableIngestionSourceOptions(): Array<{
  value: string;
  label: string;
}> {
  const options = [
    { value: "FALLBACK", label: "Multi-source fallback (recommended)" },
  ];

  for (const id of getOperationalProviderIds()) {
    options.push({
      value: id,
      label: `${PROVIDER_LABELS[id]} only`,
    });
  }

  options.push({ value: "MANUAL", label: "Manual import only" });
  return options;
}
