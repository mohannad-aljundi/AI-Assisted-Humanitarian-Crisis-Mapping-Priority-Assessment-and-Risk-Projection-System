import type { SourceType } from "@prisma/client";
import {
  matchesIngestionKeywordForProvider,
  parseJsonResponse,
  resolveHdxSearchQuery,
  resolveSearchQuery,
  type IngestionKeyword,
} from "@/lib/ingestionConstants";
import { retryWithBackoff } from "@/lib/retryWithBackoff";
import { HUMANITARIAN_RSS_FEEDS } from "@/lib/rssFeeds";
import { parseRssFeed } from "@/lib/rssParser";
import type {
  IngestedArticle,
  IngestionProviderId,
  ManualImportArticle,
  SourceFetchResult,
} from "@/types";

const FETCH_TIMEOUT_MS = 20_000;

function withTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  return retryWithBackoff(() => withTimeout(url, init), { maxAttempts: 3 });
}

function toIsoDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagArticles(
  articles: IngestedArticle[],
  providerId: IngestionProviderId
): IngestedArticle[] {
  return articles.map((article) => ({ ...article, providerId }));
}

function buildResult(
  articles: IngestedArticle[],
  providerId: IngestionProviderId,
  requestUrl: string,
  responseStatus: number,
  rawCount: number
): SourceFetchResult {
  return {
    articles: tagArticles(articles, providerId),
    requestUrl,
    responseStatus,
    rawCount,
  };
}

export async function fetchFromNewsApi(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const apiKey = process.env.NEWS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("NewsAPI key is not configured");
  }

  const query = encodeURIComponent(resolveSearchQuery(keyword));
  const url =
    `https://newsapi.org/v2/everything?q=${query}` +
    `&language=en&sortBy=publishedAt&pageSize=${limit}` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });
  const body = await response.text();

  if (response.status === 429) {
    throw new Error("NewsAPI rate limit reached (HTTP 429)");
  }

  if (!response.ok) {
    throw new Error(`NewsAPI failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = parseJsonResponse<{
    articles?: Array<{
      title?: string;
      description?: string;
      content?: string;
      url?: string;
      publishedAt?: string;
      source?: { name?: string };
    }>;
  }>(body, "NewsAPI");

  const rawCount = payload.articles?.length ?? 0;
  const articles = (payload.articles ?? [])
    .map((item, index) => {
      const title = item.title?.trim();
      const content = stripHtml(
        [item.description, item.content, item.url ? `Reference: ${item.url}` : ""]
          .filter(Boolean)
          .join("\n\n")
      );
      if (!title || !content) return null;

      return {
        externalId: `newsapi:${item.url ?? `${title}-${index}`}`,
        title,
        content: content.slice(0, 8000),
        reportDate: toIsoDate(item.publishedAt),
        url: item.url,
        source: {
          name: item.source?.name || "NewsAPI",
          type: "MEDIA" as SourceType,
          credibilityScore: 0.7,
          url: item.url,
        },
      };
    })
    .filter((article) => article !== null) as IngestedArticle[];

  return buildResult(articles, "NEWSAPI", url.replace(apiKey, "***"), response.status, rawCount);
}

export async function fetchFromGuardian(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const apiKey = process.env.GUARDIAN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Guardian API key is not configured");
  }

  const query = encodeURIComponent(resolveSearchQuery(keyword));
  const url =
    `https://content.guardianapis.com/search?q=${query}` +
    `&page-size=${limit}&order-by=newest&show-fields=trailText,body` +
    `&api-key=${encodeURIComponent(apiKey)}`;

  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });
  const body = await response.text();

  if (response.status === 429) {
    throw new Error("Guardian API rate limit reached (HTTP 429)");
  }

  if (!response.ok) {
    throw new Error(
      `Guardian API failed (${response.status}): ${body.slice(0, 200)}`
    );
  }

  const payload = parseJsonResponse<{
    response?: {
      results?: Array<{
        id?: string;
        webTitle?: string;
        webUrl?: string;
        webPublicationDate?: string;
        fields?: { trailText?: string; body?: string };
      }>;
    };
  }>(body, "Guardian API");

  const rawCount = payload.response?.results?.length ?? 0;
  const articles = (payload.response?.results ?? [])
    .map((item) => {
      const title = item.webTitle?.trim();
      const bodyText = stripHtml(item.fields?.body || item.fields?.trailText || "");
      if (!title || !bodyText) return null;

      return {
        externalId: `guardian:${item.id ?? item.webUrl ?? title}`,
        title,
        content: bodyText.slice(0, 8000),
        reportDate: toIsoDate(item.webPublicationDate),
        url: item.webUrl,
        source: {
          name: "The Guardian",
          type: "MEDIA" as SourceType,
          credibilityScore: 0.75,
          url: item.webUrl,
        },
      };
    })
    .filter((article) => article !== null) as IngestedArticle[];

  return buildResult(articles, "GUARDIAN", url.replace(apiKey, "***"), response.status, rawCount);
}

export async function fetchFromOcha(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const articles: IngestedArticle[] = [];
  let rawCount = 0;
  const errors: string[] = [];
  const ochaFeeds = HUMANITARIAN_RSS_FEEDS.filter((f) =>
    f.name.toLowerCase().includes("ocha")
  );
  const requestUrl = ochaFeeds.map((f) => f.url).join(", ") || "ocha-rss-feeds";

  for (const feed of ochaFeeds) {
    if (articles.length >= limit) break;
    try {
      const response = await fetchWithRetry(feed.url, {
        headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      });
      if (!response.ok) {
        errors.push(`${feed.name}: HTTP ${response.status}`);
        continue;
      }

      const xml = await response.text();
      const items = parseRssFeed(xml);
      rawCount += items.length;

      for (const item of items) {
        if (articles.length >= limit) break;
        const content = stripHtml(
          [item.description, item.link ? `Reference: ${item.link}` : ""]
            .filter(Boolean)
            .join("\n\n")
        );
        const text = `${item.title} ${content}`;
        if (!matchesIngestionKeywordForProvider(text, keyword, "OCHA")) continue;

        articles.push({
          externalId: `ocha:${item.link || item.title}`,
          title: item.title,
          content: content.slice(0, 8000) || item.title,
          reportDate: toIsoDate(item.pubDate),
          url: item.link || undefined,
          source: {
            name: "UN OCHA",
            type: "OFFICIAL" as SourceType,
            credibilityScore: 0.92,
            url: item.link || undefined,
          },
        });
      }
    } catch (error) {
      errors.push(
        `${feed.name}: ${error instanceof Error ? error.message : "fetch failed"}`
      );
    }
  }

  if (articles.length === 0 && errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  return buildResult(articles, "OCHA", requestUrl, 200, rawCount);
}

export async function fetchFromAcled(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const email = process.env.ACLED_EMAIL?.trim();
  const apiKey = process.env.ACLED_API_KEY?.trim();
  if (!email || !apiKey) {
    throw new Error("ACLED requires ACLED_EMAIL and ACLED_API_KEY");
  }

  const query = encodeURIComponent(resolveSearchQuery(keyword));
  const url =
    `https://api.acleddata.com/acled/read?key=${encodeURIComponent(apiKey)}` +
    `&email=${encodeURIComponent(email)}` +
    `&limit=${limit}&event_type=Battles|Explosions/Remote violence|Violence against civilians` +
    `&notes=${query}`;

  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`ACLED API failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = parseJsonResponse<{
    data?: Array<{
      event_id_cnty?: string;
      event_date?: string;
      country?: string;
      admin1?: string;
      location?: string;
      event_type?: string;
      sub_event_type?: string;
      fatalities?: string;
      notes?: string;
      source?: string;
    }>;
  }>(body, "ACLED API");

  const rawCount = payload.data?.length ?? 0;
  const articles = (payload.data ?? [])
    .map((item) => {
      const location = [item.location, item.admin1, item.country]
        .filter(Boolean)
        .join(", ");
      const title = `${item.event_type ?? "Conflict"} in ${location || "Unknown"}`;
      const content = [
        item.notes,
        item.sub_event_type ? `Sub-type: ${item.sub_event_type}` : "",
        item.fatalities ? `Fatalities: ${item.fatalities}` : "",
        item.source ? `Source: ${item.source}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      if (!content.trim()) return null;

      return {
        externalId: `acled:${item.event_id_cnty ?? title}`,
        title,
        content: content.slice(0, 8000),
        reportDate: toIsoDate(item.event_date),
        source: {
          name: "ACLED",
          type: "OFFICIAL" as SourceType,
          credibilityScore: 0.88,
        },
      };
    })
    .filter((article) => article !== null) as IngestedArticle[];

  return buildResult(articles, "ACLED", url.replace(apiKey, "***"), response.status, rawCount);
}

export async function fetchFromHdx(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const query = encodeURIComponent(resolveHdxSearchQuery(keyword));
  const url =
    `https://data.humdata.org/api/3/action/package_search?q=${query}&rows=${limit}`;

  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HDX API failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = parseJsonResponse<{
    result?: {
      results?: Array<{
        id?: string;
        title?: string;
        notes?: string;
        metadata_modified?: string;
        organization?: { title?: string };
      }>;
    };
  }>(body, "HDX API");

  const rawCount = payload.result?.results?.length ?? 0;
  const articles = (payload.result?.results ?? [])
    .map((item) => {
      const title = item.title?.trim();
      const content = stripHtml(item.notes ?? "");
      if (!title) return null;

      return {
        externalId: `hdx:${item.id ?? title}`,
        title,
        content: (content || title).slice(0, 8000),
        reportDate: toIsoDate(item.metadata_modified),
        url: item.id ? `https://data.humdata.org/dataset/${item.id}` : undefined,
        source: {
          name: item.organization?.title || "HDX",
          type: "NGO" as SourceType,
          credibilityScore: 0.85,
          url: item.id ? `https://data.humdata.org/dataset/${item.id}` : undefined,
        },
      };
    })
    .filter((article) => article !== null) as IngestedArticle[];

  return buildResult(articles, "HDX", url, response.status, rawCount);
}

export async function fetchFromRssFeeds(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const articles: IngestedArticle[] = [];
  let rawCount = 0;
  const requestUrl = "multiple-rss-feeds";

  for (const feed of HUMANITARIAN_RSS_FEEDS) {
    if (articles.length >= limit) break;

    try {
      const response = await fetchWithRetry(feed.url, {
        headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      });

      if (!response.ok) {
        console.warn(`[RSS] ${feed.name} failed (${response.status})`);
        continue;
      }

      const xml = await response.text();
      const items = parseRssFeed(xml);
      rawCount += items.length;

      for (const item of items) {
        if (articles.length >= limit) break;

        const content = stripHtml(
          [item.description, item.link ? `Reference: ${item.link}` : ""]
            .filter(Boolean)
            .join("\n\n")
        );
        const text = `${item.title} ${content}`;
        if (!matchesIngestionKeywordForProvider(text, keyword, "RSS")) continue;

        articles.push({
          externalId: `rss:${feed.name}:${item.link || item.title}`,
          title: item.title,
          content: content.slice(0, 8000) || item.title,
          reportDate: toIsoDate(item.pubDate),
          url: item.link || undefined,
          source: {
            name: feed.name,
            type: "NGO" as SourceType,
            credibilityScore: 0.8,
            url: item.link || undefined,
          },
        });
      }
    } catch (error) {
      console.warn(
        `[RSS] ${feed.name} error:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return buildResult(articles, "RSS", requestUrl, 200, rawCount);
}

export function buildManualArticles(
  manualArticles: ManualImportArticle[] | undefined
): IngestedArticle[] {
  if (!manualArticles?.length) return [];

  return manualArticles
    .map((item, index) => {
      const title = item.title?.trim();
      const content = item.content?.trim();
      if (!title || !content) return null;

      return {
        externalId: `manual:${index}:${title}`,
        title,
        content: content.slice(0, 8000),
        reportDate: toIsoDate(item.reportDate),
        url: item.sourceUrl,
        providerId: "MANUAL" as IngestionProviderId,
        source: {
          name: item.sourceName?.trim() || "Manual Import",
          type: (item.sourceType ?? "FIELD") as SourceType,
          credibilityScore: item.sourceCredibility ?? 0.9,
          url: item.sourceUrl,
        },
      };
    })
    .filter((article) => article !== null) as IngestedArticle[];
}

const UN_NEWS_RSS = "https://news.un.org/feed/subscribe/en/news/all/rss.xml";

export async function fetchFromUnNews(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const articles: IngestedArticle[] = [];

  const response = await fetchWithRetry(UN_NEWS_RSS, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!response.ok) {
    throw new Error(`UN News RSS failed (${response.status})`);
  }

  const xml = await response.text();
  const items = parseRssFeed(xml);
  const rawCount = items.length;

  for (const item of items) {
    if (articles.length >= limit) break;

    const content = stripHtml(
      [item.description, item.link ? `Reference: ${item.link}` : ""]
        .filter(Boolean)
        .join("\n\n")
    );
    const text = `${item.title} ${content}`;
    if (!matchesIngestionKeywordForProvider(text, keyword, "UNNEWS")) continue;

    articles.push({
      externalId: `unnews:${item.link || item.title}`,
      title: item.title,
      content: content.slice(0, 8000) || item.title,
      reportDate: toIsoDate(item.pubDate),
      url: item.link || undefined,
      source: {
        name: "UN News",
        type: "OFFICIAL" as SourceType,
        credibilityScore: 0.93,
        url: item.link || undefined,
      },
    });
  }

  return buildResult(articles, "UNNEWS", UN_NEWS_RSS, response.status, rawCount);
}

export async function fetchFromGdacs(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const url =
    "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=green;orange;red&limit=50";

  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`GDACS API failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = parseJsonResponse<{
    features?: Array<{
      properties?: {
        eventid?: number;
        eventname?: string;
        description?: string;
        htmldescription?: string;
        alertlevel?: string;
        alertscore?: number;
        country?: string;
        fromdate?: string;
        url?: { report?: string; details?: string };
        severitydata?: { severitytext?: string; severityunit?: string };
      };
    }>;
  }>(body, "GDACS API");

  const rawCount = payload.features?.length ?? 0;
  const articles: IngestedArticle[] = [];

  for (const feature of payload.features ?? []) {
    if (articles.length >= limit) break;

    const props = feature.properties;
    const title = props?.eventname?.trim() || props?.description?.trim();
    if (!title) continue;

    const content = stripHtml(
      [
        props?.htmldescription || props?.description,
        props?.country ? `Country: ${props.country}` : "",
        props?.alertlevel ? `Alert level: ${props.alertlevel}` : "",
        props?.severitydata?.severitytext
          ? `Severity: ${props.severitydata.severitytext} ${props.severitydata.severityunit ?? ""}`
          : "",
        props?.url?.report ? `Report: ${props.url.report}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    );

    const text = `${title} ${content}`;
    if (!matchesIngestionKeywordForProvider(text, keyword, "GDACS")) continue;

    const reportUrl = props?.url?.report || props?.url?.details;

    articles.push({
      externalId: `gdacs:${props?.eventid ?? title}`,
      title,
      content: (content || title).slice(0, 8000),
      reportDate: toIsoDate(props?.fromdate),
      url: reportUrl,
      source: {
        name: "GDACS",
        type: "OFFICIAL" as SourceType,
        credibilityScore: 0.9,
        url: reportUrl,
      },
    });
  }

  return buildResult(articles, "GDACS", url, response.status, rawCount);
}

export async function fetchFromUsgs(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const url =
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/geo+json, application/json" },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`USGS API failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = parseJsonResponse<{
    features?: Array<{
      id?: string;
      properties?: {
        title?: string;
        place?: string;
        mag?: number;
        time?: number;
        url?: string;
        alert?: string;
        tsunami?: number;
        type?: string;
      };
    }>;
  }>(body, "USGS Earthquake API");

  const rawCount = payload.features?.length ?? 0;
  const articles: IngestedArticle[] = [];

  for (const feature of payload.features ?? []) {
    if (articles.length >= limit) break;

    const props = feature.properties;
    const title = props?.title?.trim();
    if (!title) continue;

    const content = [
      `Magnitude ${props?.mag ?? "unknown"} earthquake near ${props?.place ?? "unknown location"}.`,
      props?.alert ? `Alert level: ${props.alert}` : "",
      props?.tsunami ? "Tsunami warning possible." : "",
      props?.url ? `Reference: ${props.url}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const text = `${title} ${content}`;
    if (!matchesIngestionKeywordForProvider(text, keyword, "USGS")) continue;

    articles.push({
      externalId: `usgs:${feature.id ?? title}`,
      title,
      content: content.slice(0, 8000),
      reportDate: props?.time
        ? new Date(props.time).toISOString()
        : new Date().toISOString(),
      url: props?.url,
      source: {
        name: "USGS Earthquakes",
        type: "OFFICIAL" as SourceType,
        credibilityScore: 0.95,
        url: props?.url,
      },
    });
  }

  return buildResult(articles, "USGS", url, response.status, rawCount);
}

export async function fetchFromEonet(
  keyword: IngestionKeyword,
  limit: number
): Promise<SourceFetchResult> {
  const url = `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=${Math.min(limit, 50)}`;

  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`NASA EONET API failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = parseJsonResponse<{
    events?: Array<{
      id?: string;
      title?: string;
      description?: string;
      categories?: Array<{ title?: string }>;
      sources?: Array<{ url?: string }>;
      geometry?: Array<{ date?: string }>;
    }>;
  }>(body, "NASA EONET API");

  const rawCount = payload.events?.length ?? 0;
  const articles: IngestedArticle[] = [];

  for (const event of payload.events ?? []) {
    if (articles.length >= limit) break;

    const title = event.title?.trim();
    if (!title) continue;

    const category = event.categories?.map((c) => c.title).filter(Boolean).join(", ");
    const sourceUrl = event.sources?.[0]?.url;
    const eventDate = event.geometry?.[0]?.date;

    const content = [
      event.description,
      category ? `Categories: ${category}` : "",
      sourceUrl ? `Reference: ${sourceUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const text = `${title} ${content}`;
    if (!matchesIngestionKeywordForProvider(text, keyword, "EONET")) continue;

    articles.push({
      externalId: `eonet:${event.id ?? title}`,
      title,
      content: (content || title).slice(0, 8000),
      reportDate: toIsoDate(eventDate),
      url: sourceUrl,
      source: {
        name: "NASA EONET",
        type: "OFFICIAL" as SourceType,
        credibilityScore: 0.88,
        url: sourceUrl,
      },
    });
  }

  return buildResult(articles, "EONET", url, response.status, rawCount);
}
