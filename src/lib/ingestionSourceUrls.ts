import {
  resolveGdeltSearchQuery,
  resolveHdxSearchQuery,
  resolveSearchQuery,
  type IngestionKeyword,
} from "@/lib/ingestionConstants";
import type { IngestionProviderId } from "@/types";

const GDELT_API_BASE_URL =
  process.env.GDELT_API_BASE_URL?.trim() ||
  "https://api.gdeltproject.org/api/v2/doc/doc";

const RELIEFWEB_APPNAME = process.env.RELIEFWEB_APPNAME || "crisis-mapper-ai";
const RELIEFWEB_API_BASE_URL =
  process.env.RELIEFWEB_API_BASE_URL?.trim() ||
  "https://api.reliefweb.int/v2/reports";

export function buildProviderRequestUrl(
  provider: IngestionProviderId,
  keyword: IngestionKeyword,
  limit: number
): string {
  const query = encodeURIComponent(resolveSearchQuery(keyword));

  switch (provider) {
    case "GDELT": {
      const gdeltQuery = encodeURIComponent(resolveGdeltSearchQuery(keyword));
      return `${GDELT_API_BASE_URL}?query=${gdeltQuery}&mode=ArtList&format=json&maxrecords=${limit}&timespan=7d`;
    }
    case "RELIEFWEB": {
      const base = RELIEFWEB_API_BASE_URL.replace(/\/$/, "");
      const hasQuery = base.includes("?");
      const root = hasQuery
        ? base.includes("appname=")
          ? base
          : `${base}&appname=${encodeURIComponent(RELIEFWEB_APPNAME)}`
        : `${base}?appname=${encodeURIComponent(RELIEFWEB_APPNAME)}`;
      return `${root}&query[value]=${query}&limit=${limit}`;
    }
    case "NEWSAPI":
      return `https://newsapi.org/v2/everything?q=${query}&language=en&sortBy=publishedAt&pageSize=${limit}&apiKey=***`;
    case "GUARDIAN":
      return `https://content.guardianapis.com/search?q=${query}&page-size=${limit}&api-key=***`;
    case "UNNEWS":
      return "https://news.un.org/feed/subscribe/en/news/all/rss.xml";
    case "GDACS":
      return "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=green;orange;red&limit=50";
    case "USGS":
      return "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
    case "EONET":
      return `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=${Math.min(limit, 50)}`;
    case "RSS":
      return "multiple-rss-feeds";
    case "OCHA":
      return "ocha-rss-feeds";
    case "ACLED":
      return `https://api.acleddata.com/acled/read?limit=${limit}&notes=${query}&key=***`;
    case "HDX": {
      const hdxQuery = encodeURIComponent(resolveHdxSearchQuery(keyword));
      return `https://data.humdata.org/api/3/action/package_search?q=${hdxQuery}&rows=${limit}`;
    }
    case "MANUAL":
      return "manual-import";
    default:
      return "unknown";
  }
}
