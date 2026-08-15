import type { SourceType } from "@prisma/client";
import https from "node:https";
import { URL } from "node:url";
import {
  DEFAULT_INGESTION_LIMIT,
  isFallbackIngestionSource,
  isReliefWebIngestionEnabled,
  MAX_INGESTION_LIMIT,
  matchesIngestionKeywordForProvider,
  parseJsonResponse,
  resolveGdeltSearchQuery,
  resolveSearchQuery,
  type IngestionKeyword,
  type IngestionSource,
} from "@/lib/ingestionConstants";
import {
  gdeltRequestQueue,
  sleep,
} from "@/lib/gdeltRequestQueue";
import { GdeltRateLimitError } from "@/lib/ingestionErrors";
import { retryWithBackoff } from "@/lib/retryWithBackoff";
import { classifyIngestionFailure } from "@/lib/ingestionFailureClassifier";
import { logIngestionSource, logIngestionSummary } from "@/lib/ingestionLogger";
import { buildProviderRequestUrl } from "@/lib/ingestionSourceUrls";
import {
  classifyZeroReasonFromError,
  formatZeroReason,
  type IngestionZeroReason,
} from "@/lib/ingestionZeroReasons";
import {
  getOperationalProviderIds,
  getProviderStatus,
} from "@/lib/ingestionSourceRegistry";
import { ingestionRepository } from "@/repositories/ingestionRepository";
import { reportImportService } from "@/services/reportImportService";
import { requestWorkerStart } from "@/lib/workerLauncher";
import { createSyncTiming, logSyncTiming } from "@/lib/syncTimingLogger";
import { resolvePendingLocations } from "@/services/locationResolver";
import {
  buildManualArticles,
  fetchFromAcled,
  fetchFromEonet,
  fetchFromGdacs,
  fetchFromGuardian,
  fetchFromHdx,
  fetchFromNewsApi,
  fetchFromOcha,
  fetchFromRssFeeds,
  fetchFromUnNews,
  fetchFromUsgs,
} from "@/services/ingestionSourceFetchers";
import { sourceHealthRepository } from "@/repositories/sourceHealthRepository";
import type {
  IngestedArticle,
  IngestionProviderId,
  IngestionRunResult,
  IngestionSourceRunStatus,
  IngestionSourceSummary,
  IngestionSyncSummary,
  ManualImportArticle,
  ReportInput,
  SourceFetchResult,
} from "@/types";

const RELIEFWEB_APPNAME =
  process.env.RELIEFWEB_APPNAME || "crisis-mapper-ai";

const RELIEFWEB_API_BASE_URL =
  process.env.RELIEFWEB_API_BASE_URL?.trim() ||
  "https://api.reliefweb.int/v2/reports";
const GDELT_API_BASE_URL =
  process.env.GDELT_API_BASE_URL?.trim() ||
  "https://api.gdeltproject.org/api/v2/doc/doc";
const FETCH_TIMEOUT_MS = 20_000;
const RELIEFWEB_APPNAME_REQUEST_URL =
  "https://apidoc.reliefweb.int/parameters#appname";

function reliefWebHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "User-Agent": `Crisis-Mapper-AI/1.0 (humanitarian-crisis-mapping; appname=${RELIEFWEB_APPNAME})`,
  };
}

function buildReliefWebUrl(additionalQuery = ""): string {
  const base = RELIEFWEB_API_BASE_URL.replace(/\/$/, "");
  const hasQuery = base.includes("?");
  let url: string;

  if (hasQuery) {
    url = base.includes("appname=")
      ? base
      : `${base}&appname=${encodeURIComponent(RELIEFWEB_APPNAME)}`;
  } else {
    url = `${base}?appname=${encodeURIComponent(RELIEFWEB_APPNAME)}`;
  }

  if (additionalQuery) {
    const suffix = additionalQuery.startsWith("&")
      ? additionalQuery
      : `&${additionalQuery}`;
    url += suffix;
  }

  return url;
}

function withTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}

function requestReliefWeb(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      req.destroy(new Error("ReliefWeb request timed out"));
      reject(new Error("ReliefWeb request timed out"));
    }, timeoutMs);

    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: reliefWebHeaders(),
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({ status: res.statusCode ?? 0, body });
        });
      }
    );

    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    req.end();
  });
}

function parseReliefWebError(status: number, body: string): string {
  if (status === 403 && body.includes("approved appname")) {
    return (
      `ReliefWeb API rejected appname "${RELIEFWEB_APPNAME}". ` +
      `Request a pre-approved appname at ${RELIEFWEB_APPNAME_REQUEST_URL}`
    );
  }

  if (status === 406 && body.includes("bot activity")) {
    return (
      "ReliefWeb API blocked the request as automated traffic. " +
      "Ensure RELIEFWEB_APPNAME is registered and contact hdx@un.org if this persists."
    );
  }

  return `ReliefWeb API failed (${status}): ${body.slice(0, 200)}`;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function buildReportInput(article: IngestedArticle): ReportInput {
  return {
    title: article.title,
    content: article.content,
    reportDate: article.reportDate,
    articleUrl: article.url,
    externalArticleId: article.externalId,
    source: article.source,
  };
}

function isRateLimitMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("429") || lower.includes("rate limit");
}

function resolveRunStatusFromError(error: unknown): IngestionSourceRunStatus {
  if (error instanceof GdeltRateLimitError) return "rate_limited";
  const message = error instanceof Error ? error.message : "";
  if (isRateLimitMessage(message)) return "rate_limited";
  return "failed";
}

function resolveProvidersForSource(
  source: IngestionSource,
  enabledProviders?: IngestionProviderId[]
): IngestionProviderId[] {
  let providers: IngestionProviderId[];
  if (isFallbackIngestionSource(source)) {
    providers = [...getOperationalProviderIds(), "MANUAL"];
  } else {
    providers = [source as IngestionProviderId];
  }

  if (enabledProviders?.length) {
    const allowed = new Set(enabledProviders);
    providers = providers.filter((p) => allowed.has(p));
  }

  return providers;
}

function resolveZeroReason(
  summary: Pick<
    IngestionSourceSummary,
    "status" | "rawFetchedCount" | "fetchedCount" | "error"
  >
): { zeroReason?: IngestionZeroReason; zeroReasonLabel?: string } {
  if (summary.status === "requires_api_key") {
    return {
      zeroReason: "requires_api_key",
      zeroReasonLabel: formatZeroReason("requires_api_key"),
    };
  }
  if (summary.status === "skipped" && summary.error?.includes("disabled")) {
    return {
      zeroReason: "disabled",
      zeroReasonLabel: formatZeroReason("disabled", summary.error),
    };
  }
  if (summary.status === "skipped") {
    return {
      zeroReason: "skipped",
      zeroReasonLabel: formatZeroReason("skipped", summary.error),
    };
  }
  if (summary.status === "rate_limited") {
    return {
      zeroReason: "rate_limited",
      zeroReasonLabel: formatZeroReason("rate_limited", summary.error),
    };
  }
  if (summary.status === "failed" && summary.error) {
    const reason = classifyZeroReasonFromError(summary.error);
    return {
      zeroReason: reason,
      zeroReasonLabel: formatZeroReason(reason, summary.error),
    };
  }
  if ((summary.fetchedCount ?? 0) === 0) {
    if ((summary.rawFetchedCount ?? 0) > 0) {
      return {
        zeroReason: "keyword_filtered",
        zeroReasonLabel: formatZeroReason("keyword_filtered"),
      };
    }
    return {
      zeroReason: "no_events_found",
      zeroReasonLabel: formatZeroReason("no_events_found"),
    };
  }
  return {};
}

function providerFromArticle(article: IngestedArticle): IngestionProviderId | null {
  if (article.providerId) return article.providerId;
  const prefix = article.externalId.split(":")[0]?.toLowerCase();
  const map: Record<string, IngestionProviderId> = {
    gdelt: "GDELT",
    reliefweb: "RELIEFWEB",
    newsapi: "NEWSAPI",
    unnews: "UNNEWS",
    gdacs: "GDACS",
    usgs: "USGS",
    eonet: "EONET",
    guardian: "GUARDIAN",
    rss: "RSS",
    ocha: "OCHA",
    acled: "ACLED",
    hdx: "HDX",
    manual: "MANUAL",
  };
  return prefix ? map[prefix] ?? null : null;
}

export class NewsIngestionService {
  private ingestionRunLock: Promise<void> = Promise.resolve();

  async runIngestion(options: {
    source: IngestionSource;
    keyword: IngestionKeyword;
    limit?: number;
    manualArticles?: ManualImportArticle[];
    enabledProviders?: IngestionProviderId[];
    onProviderWarning?: (message: string) => void;
    fastImport?: boolean;
  }): Promise<IngestionRunResult> {
    const syncStarted = Date.now();
    let releaseLock!: () => void;
    const previousLock = this.ingestionRunLock;
    this.ingestionRunLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    await previousLock;

    try {
      const limit = Math.min(
        options.limit ?? DEFAULT_INGESTION_LIMIT,
        MAX_INGESTION_LIMIT
      );
      const timing = createSyncTiming();
      const fetchStarted = Date.now();
      const { articles, sourceSummaries } = await this.fetchArticles(
        options.source,
        options.keyword,
        limit,
        options.manualArticles,
        options.enabledProviders,
        options.onProviderWarning
      );
      timing.fetchMs = Date.now() - fetchStarted;

      const insertedByProvider = new Map<IngestionProviderId, number>();
      const duplicatesByProvider = new Map<IngestionProviderId, number>();

      const result: IngestionRunResult = {
        fetchedCount: articles.length,
        analysedCount: 0,
        savedCount: 0,
        skippedCount: 0,
        failedDuplicateCount: 0,
        failedMissingCoordsCount: 0,
        failedDbErrorCount: 0,
        failedAiInvalidJsonCount: 0,
        locationPendingCount: 0,
        locationVerifiedCount: 0,
        locationApproximateCount: 0,
        errors: [],
        reportIds: [],
        sourceSummaries,
        manualImportSuggested:
          articles.length === 0 &&
          isFallbackIngestionSource(options.source) &&
          !options.manualArticles?.length,
        queuedCount: 0,
        previouslyAnalysedCount: 0,
        newImportCount: 0,
        requeuedCount: 0,
        pendingAnalysisCount: 0,
        syncTiming: timing,
      };

      const saveStarted = Date.now();
      const enqueueStarted = Date.now();

      if (options.fastImport !== false) {
        const reconciled = await reportImportService.reconcilePendingReports();
        if (reconciled > 0) {
          result.requeuedCount = (result.requeuedCount ?? 0) + reconciled;
          result.queuedCount = (result.queuedCount ?? 0) + reconciled;
        }

        for (const article of articles) {
          const provider = providerFromArticle(article);
          try {
            const importResult = await reportImportService.importArticle(article);

            if (importResult.reason === "already_processed") {
              result.skippedCount += 1;
              result.previouslyAnalysedCount =
                (result.previouslyAnalysedCount ?? 0) + 1;
              if (provider) {
                duplicatesByProvider.set(
                  provider,
                  (duplicatesByProvider.get(provider) ?? 0) + 1
                );
              }
              continue;
            }

            if (importResult.skipped) {
              result.skippedCount += 1;
              result.failedDuplicateCount = (result.failedDuplicateCount ?? 0) + 1;
              continue;
            }

            if (!importResult.reportId) continue;

            if (importResult.reason === "imported") {
              result.newImportCount = (result.newImportCount ?? 0) + 1;
              result.savedCount += 1;
            } else if (importResult.reason === "requeued") {
              result.requeuedCount = (result.requeuedCount ?? 0) + 1;
            }

            result.queuedCount = (result.queuedCount ?? 0) + 1;
            result.analysedCount += 1;
            result.reportIds.push(importResult.reportId);
            if (provider) {
              insertedByProvider.set(
                provider,
                (insertedByProvider.get(provider) ?? 0) + 1
              );
            }
          } catch (error) {
            const failure = classifyIngestionFailure(error);
            if (failure.kind === "db_error") {
              result.failedDbErrorCount = (result.failedDbErrorCount ?? 0) + 1;
            }
            result.errors.push({
              title: article.title,
              message: failure.message,
            });
          }
        }

        timing.saveMs = Date.now() - saveStarted;
        timing.enqueueMs = Date.now() - enqueueStarted;
        result.pendingAnalysisCount = await reportImportService.countPendingAnalysis();
        void requestWorkerStart("ingestion-sync");

        console.info("[ImportPipeline] sync_summary", {
          fetched: result.fetchedCount,
          previouslyAnalysed: result.previouslyAnalysedCount,
          newImports: result.newImportCount,
          requeued: result.requeuedCount,
          queuedForAnalysis: result.analysedCount,
          pendingAnalysis: result.pendingAnalysisCount,
        });
      } else {
        const { analysisService } = await import("@/services/analysisService");
        for (const article of articles) {
          const provider = providerFromArticle(article);
          try {
            const exists = await ingestionRepository.isDuplicateArticle(article);
            if (exists) {
              result.skippedCount += 1;
              result.failedDuplicateCount = (result.failedDuplicateCount ?? 0) + 1;
              if (provider) {
                duplicatesByProvider.set(
                  provider,
                  (duplicatesByProvider.get(provider) ?? 0) + 1
                );
              }
              continue;
            }

            const saved = await analysisService.analyseAndPersist(
              buildReportInput(article)
            );
            result.analysedCount += 1;

            if (saved.saved) {
              const created = saved.incidentsCreated ?? 1;
              result.savedCount += created;
              if (saved.locationPending) {
                result.locationPendingCount =
                  (result.locationPendingCount ?? 0) + created;
              } else if (saved.locationApproximate) {
                result.locationApproximateCount =
                  (result.locationApproximateCount ?? 0) + created;
              } else {
                result.locationVerifiedCount =
                  (result.locationVerifiedCount ?? 0) + created;
              }
              result.reportIds.push(
                ...(saved.incidentReportIds ?? [saved.reportId])
              );
              if (provider) {
                insertedByProvider.set(
                  provider,
                  (insertedByProvider.get(provider) ?? 0) + 1
                );
              }
            }

            await sleep(500);
          } catch (error) {
            const failure = classifyIngestionFailure(error);
            switch (failure.kind) {
              case "ai_invalid_json":
                result.failedAiInvalidJsonCount =
                  (result.failedAiInvalidJsonCount ?? 0) + 1;
                break;
              case "db_error":
                result.failedDbErrorCount = (result.failedDbErrorCount ?? 0) + 1;
                break;
              case "missing_coords":
                result.failedMissingCoordsCount =
                  (result.failedMissingCoordsCount ?? 0) + 1;
                break;
              default:
                break;
            }
            result.errors.push({
              title: article.title,
              message: failure.message,
            });
          }
        }
        timing.saveMs = Date.now() - saveStarted;
      }

      timing.totalMs = Date.now() - syncStarted;
      result.syncTiming = timing;
      logSyncTiming("ingestion", timing);
      let duplicatesRemoved = 0;
      result.sourceSummaries = sourceSummaries.map((summary) => {
        const insertedCount = insertedByProvider.get(summary.source) ?? 0;
        const duplicatesSkipped = duplicatesByProvider.get(summary.source) ?? 0;
        duplicatesRemoved += duplicatesSkipped;
        const zeroMeta = resolveZeroReason({
          ...summary,
          fetchedCount: summary.fetchedCount,
        });
        return {
          ...summary,
          insertedCount,
          duplicatesSkipped,
          ...zeroMeta,
        };
      });

      const successfulSources = result.sourceSummaries.filter(
        (s) => s.status === "success" && s.fetchedCount > 0
      ).length;
      const failedSources = result.sourceSummaries.filter(
        (s) => s.status === "failed" || s.status === "rate_limited"
      ).length;
      const skippedSources = result.sourceSummaries.filter(
        (s) => s.status === "skipped" || s.status === "requires_api_key"
      ).length;

      const syncSummary: IngestionSyncSummary = {
        totalSources: result.sourceSummaries.length,
        successfulSources,
        failedSources,
        skippedSources,
        fetchedArticles: result.fetchedCount,
        insertedIncidents: result.savedCount,
        duplicatesRemoved,
        durationMs: Date.now() - syncStarted,
      };

      result.syncSummary = syncSummary;
      logIngestionSummary(syncSummary, result);

      try {
        const retry = await resolvePendingLocations();
        if (retry.resolved > 0) {
          console.info(
            `[INGESTION] Background location retry resolved ${retry.resolved} pending location(s)`
          );
        }
      } catch (error) {
        console.warn(
          `[INGESTION] Background location retry failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      try {
        const { ensurePipelineVersionCurrent } = await import(
          "@/services/pipelineMigrationService"
        );
        void ensurePipelineVersionCurrent();
      } catch (error) {
        console.warn(
          `[INGESTION] Pipeline migration check failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      for (const summary of result.sourceSummaries) {
        if (summary.status === "success") {
          await sourceHealthRepository.recordSuccess(
            summary.source,
            summary.fetchedCount,
            summary.insertedCount ?? 0,
            summary.duplicatesSkipped ?? 0
          );
        } else if (summary.status === "failed" || summary.status === "rate_limited") {
          await sourceHealthRepository.recordFailure(
            summary.source,
            summary.error ?? summary.zeroReasonLabel ?? "Fetch failed"
          );
        }
      }

      return result;
    } finally {
      releaseLock();
    }
  }

  async fetchArticles(
    source: IngestionSource,
    keyword: IngestionKeyword,
    limit: number,
    manualArticles?: ManualImportArticle[],
    enabledProviders?: IngestionProviderId[],
    onProviderWarning?: (message: string) => void
  ): Promise<{ articles: IngestedArticle[]; sourceSummaries: IngestionSourceSummary[] }> {
    const providers = resolveProvidersForSource(source, enabledProviders);
    const perSourceLimit = limit;
    const sourceSummaries: IngestionSourceSummary[] = [];
    const collected: IngestedArticle[] = [];

    const fetchJobs: Array<{
      provider: IngestionProviderId;
      run: () => Promise<{ summary: IngestionSourceSummary; articles: IngestedArticle[] }>;
    }> = [];

    for (const provider of providers) {
      if (provider === "MANUAL") {
        const manual = buildManualArticles(manualArticles);
        sourceSummaries.push({
          source: provider,
          status: manual.length > 0 ? "success" : "skipped",
          fetchedCount: manual.length,
          rawFetchedCount: manual.length,
          afterDedupCount: manual.length,
          error:
            manual.length === 0
              ? "No manual articles provided — use the form below or /reports"
              : undefined,
        });
        collected.push(...manual);
        continue;
      }

      const providerStatus = getProviderStatus(provider);
      const requestUrl = buildProviderRequestUrl(provider, keyword, perSourceLimit);

      if (providerStatus === "requires_api_key") {
        sourceSummaries.push({
          source: provider,
          status: "requires_api_key",
          fetchedCount: 0,
          rawFetchedCount: 0,
          requestUrl,
          zeroReason: "requires_api_key",
          zeroReasonLabel: formatZeroReason("requires_api_key"),
        });
        continue;
      }

      if (providerStatus === "disabled") {
        sourceSummaries.push({
          source: provider,
          status: "skipped",
          fetchedCount: 0,
          rawFetchedCount: 0,
          requestUrl,
          error: "Source disabled in current configuration",
          zeroReason: "disabled",
          zeroReasonLabel: formatZeroReason("disabled"),
        });
        continue;
      }

      if (provider === "GDELT" && providerStatus === "rate_limited") {
        const cached = gdeltRequestQueue.getCached(keyword, perSourceLimit);
        if (cached?.length) {
          const tagged = cached.map((a) => ({ ...a, providerId: "GDELT" as const }));
          sourceSummaries.push({
            source: provider,
            status: "success",
            fetchedCount: tagged.length,
            rawFetchedCount: tagged.length,
            afterDedupCount: tagged.length,
            requestUrl,
            error: "Used cached GDELT results (rate limited)",
          });
          collected.push(...tagged);
          continue;
        }

        sourceSummaries.push({
          source: provider,
          status: "rate_limited",
          fetchedCount: 0,
          rawFetchedCount: 0,
          requestUrl,
          error: "GDELT rate limit reached",
          zeroReason: "rate_limited",
          zeroReasonLabel: formatZeroReason("rate_limited"),
        });
        continue;
      }

      fetchJobs.push({
        provider,
        run: () =>
          this.executeProviderFetch(provider, keyword, perSourceLimit, requestUrl, onProviderWarning),
      });
    }

    const settled = await Promise.allSettled(fetchJobs.map((job) => job.run()));

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      const provider = fetchJobs[i].provider;

      if (outcome.status === "fulfilled") {
        sourceSummaries.push(outcome.value.summary);
        collected.push(...outcome.value.articles);
        continue;
      }

      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : "Unknown fetch error";
      const runStatus = resolveRunStatusFromError(outcome.reason);
      if (outcome.reason instanceof GdeltRateLimitError) {
        gdeltRequestQueue.markRateLimited();
      }
      sourceSummaries.push({
        source: provider,
        status: runStatus,
        fetchedCount: 0,
        rawFetchedCount: 0,
        requestUrl: buildProviderRequestUrl(provider, keyword, perSourceLimit),
        error: message,
        ...resolveZeroReason({
          status: runStatus,
          fetchedCount: 0,
          rawFetchedCount: 0,
          error: message,
        }),
      });
      onProviderWarning?.(`${provider}: ${message}`);
    }

    const merged = this.dedupeArticles(collected);
    const beforeFilter = merged.length;
    const filtered = merged.filter((article) =>
      matchesIngestionKeywordForProvider(
        `${article.title} ${article.content}`,
        keyword,
        article.providerId ?? providerFromArticle(article) ?? undefined
      )
    );
    const duplicatesRemoved = collected.length - merged.length;

    if (beforeFilter > filtered.length) {
      for (const summary of sourceSummaries) {
        if (summary.status === "success" && summary.fetchedCount > 0) {
          const providerArticles = filtered.filter(
            (a) => providerFromArticle(a) === summary.source
          );
          if (providerArticles.length === 0 && !summary.zeroReason) {
            summary.zeroReason = "keyword_filtered";
            summary.zeroReasonLabel = formatZeroReason("keyword_filtered");
          }
        }
      }
    }

    if (duplicatesRemoved > 0) {
      console.info(
        `[INGESTION] Cross-source deduplication removed ${duplicatesRemoved} duplicate article(s)`
      );
    }

    return {
      articles: filtered.slice(0, limit),
      sourceSummaries: sourceSummaries.map((summary) => {
        const zeroMeta = resolveZeroReason(summary);
        return { ...summary, ...zeroMeta };
      }),
    };
  }

  private async executeProviderFetch(
    provider: IngestionProviderId,
    keyword: IngestionKeyword,
    limit: number,
    requestUrl: string,
    onProviderWarning?: (message: string) => void
  ): Promise<{ summary: IngestionSourceSummary; articles: IngestedArticle[] }> {
    const started = Date.now();
    logIngestionSource({ source: provider, phase: "started", requestUrl });

    try {
      const fetchResult = await this.fetchFromProviderResult(provider, keyword, limit);
      const afterDedup = fetchResult.articles.length;
      const durationMs = Date.now() - started;

      logIngestionSource({
        source: provider,
        phase: "completed",
        requestUrl: fetchResult.requestUrl,
        responseStatus: fetchResult.responseStatus,
        rawFetchedCount: fetchResult.rawCount,
        afterDedupCount: afterDedup,
        durationMs,
      });

      const summary: IngestionSourceSummary = {
        source: provider,
        status: "success",
        fetchedCount: afterDedup,
        rawFetchedCount: fetchResult.rawCount,
        afterDedupCount: afterDedup,
        requestUrl: fetchResult.requestUrl,
        responseStatus: fetchResult.responseStatus,
        durationMs,
      };

      if (afterDedup === 0) {
        const zeroMeta = resolveZeroReason(summary);
        return {
          summary: { ...summary, ...zeroMeta },
          articles: [],
        };
      }

      return { summary, articles: fetchResult.articles };
    } catch (error) {
      const durationMs = Date.now() - started;
      const message = error instanceof Error ? error.message : "Unknown fetch error";
      const runStatus = resolveRunStatusFromError(error);

      if (error instanceof GdeltRateLimitError) {
        gdeltRequestQueue.markRateLimited();
      }

      logIngestionSource({
        source: provider,
        phase: "failed",
        requestUrl,
        durationMs,
        error: message,
      });

      onProviderWarning?.(`${provider}: ${message}`);

      return {
        summary: {
          source: provider,
          status: runStatus,
          fetchedCount: 0,
          rawFetchedCount: 0,
          requestUrl,
          durationMs,
          error: message,
          ...resolveZeroReason({
            status: runStatus,
            fetchedCount: 0,
            rawFetchedCount: 0,
            error: message,
          }),
        },
        articles: [],
      };
    }
  }

  private async fetchFromProviderResult(
    provider: IngestionProviderId,
    keyword: IngestionKeyword,
    limit: number
  ): Promise<SourceFetchResult> {
    switch (provider) {
      case "GDELT":
        return this.fetchFromGdelt(keyword, limit);
      case "RELIEFWEB":
        return this.fetchFromReliefWeb(keyword, limit);
      case "NEWSAPI":
        return fetchFromNewsApi(keyword, limit);
      case "UNNEWS":
        return fetchFromUnNews(keyword, limit);
      case "GDACS":
        return fetchFromGdacs(keyword, limit);
      case "USGS":
        return fetchFromUsgs(keyword, limit);
      case "EONET":
        return fetchFromEonet(keyword, limit);
      case "GUARDIAN":
        return fetchFromGuardian(keyword, limit);
      case "RSS":
        return fetchFromRssFeeds(keyword, limit);
      case "OCHA":
        return fetchFromOcha(keyword, limit);
      case "ACLED":
        return fetchFromAcled(keyword, limit);
      case "HDX":
        return fetchFromHdx(keyword, limit);
      default:
        return {
          articles: [],
          requestUrl: "unknown",
          responseStatus: 0,
          rawCount: 0,
        };
    }
  }

  private async fetchFromReliefWeb(
    keyword: IngestionKeyword,
    limit: number
  ): Promise<SourceFetchResult> {
    if (!isReliefWebIngestionEnabled()) {
      throw new Error("ReliefWeb ingestion is disabled");
    }

    const query = encodeURIComponent(resolveSearchQuery(keyword));
    const url = buildReliefWebUrl(
      `query[value]=${query}` +
        `&limit=${limit}` +
        "&sort[]=date:desc" +
        "&fields[include][]=title" +
        "&fields[include][]=body" +
        "&fields[include][]=date" +
        "&fields[include][]=url" +
        "&fields[include][]=source"
    );

    const response = await requestReliefWeb(url);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(parseReliefWebError(response.status, response.body));
    }

    const payload = parseJsonResponse<{
      data?: Array<{
        id: string;
        fields?: {
          title?: string;
          body?: string;
          date?: { created?: string; original?: string };
          url?: string;
          source?: Array<{ name?: string; shortname?: string }>;
        };
      }>;
    }>(response.body, "ReliefWeb API");

    const rawCount = payload.data?.length ?? 0;
    const articles = (payload.data ?? [])
      .map((item) => {
        const fields = item.fields;
        const title = fields?.title?.trim();
        const body = stripHtml(fields?.body ?? "");
        if (!title || !body) return null;

        const sourceName =
          fields?.source?.[0]?.name ||
          fields?.source?.[0]?.shortname ||
          "ReliefWeb";

        return {
          externalId: `reliefweb:${item.id}`,
          title,
          content: body.slice(0, 8000),
          reportDate: toIsoDate(fields?.date?.original || fields?.date?.created),
          url: fields?.url,
          providerId: "RELIEFWEB" as const,
          source: {
            name: sourceName,
            type: "NGO" as SourceType,
            credibilityScore: 0.85,
            url: fields?.url,
          },
        };
      })
      .filter((article) => article !== null) as IngestedArticle[];

    return {
      articles,
      requestUrl: url,
      responseStatus: response.status,
      rawCount,
    };
  }

  private async fetchFromGdelt(
    keyword: IngestionKeyword,
    limit: number
  ): Promise<SourceFetchResult> {
    const cached = gdeltRequestQueue.getCached(keyword, limit);
    if (cached) {
      return {
        articles: cached.map((a) => ({ ...a, providerId: "GDELT" as const })),
        requestUrl: buildProviderRequestUrl("GDELT", keyword, limit),
        responseStatus: 200,
        rawCount: cached.length,
      };
    }

    return gdeltRequestQueue.enqueue(async (): Promise<SourceFetchResult> => {
      const cachedAfterWait = gdeltRequestQueue.getCached(keyword, limit);
      if (cachedAfterWait) {
        return {
          articles: cachedAfterWait.map((a) => ({ ...a, providerId: "GDELT" as const })),
          requestUrl: buildProviderRequestUrl("GDELT", keyword, limit),
          responseStatus: 200,
          rawCount: cachedAfterWait.length,
        };
      }

      const query = encodeURIComponent(resolveGdeltSearchQuery(keyword));
      const url =
        `${GDELT_API_BASE_URL}?query=${query}` +
        `&mode=ArtList&format=json&maxrecords=${limit}&timespan=7d`;

      const response = await this.requestGdelt(url);
      const payload = parseJsonResponse<{
        articles?: Array<{
          url?: string;
          title?: string;
          seendate?: string;
          domain?: string;
          sourcecountry?: string;
        }>;
      }>(response.body, "GDELT API");

      const rawCount = payload.articles?.length ?? 0;
      const articles = (payload.articles ?? [])
        .map((item, index) => {
          const title = item.title?.trim();
          if (!title) return null;

          const country = item.sourcecountry?.trim() || "Unknown";
          const domain = item.domain?.trim() || "GDELT";
          const content = [
            title,
            `Source domain: ${domain}.`,
            `Source country: ${country}.`,
            item.url ? `Reference: ${item.url}` : "",
          ]
            .filter(Boolean)
            .join("\n\n");

          return {
            externalId: `gdelt:${item.url ?? `${title}-${index}`}`,
            title,
            content,
            reportDate: toIsoDate(item.seendate),
            url: item.url,
            providerId: "GDELT" as const,
            source: {
              name: domain,
              type: "MEDIA" as SourceType,
              credibilityScore: 0.65,
              url: item.url,
            },
          };
        })
        .filter((article) => article !== null) as IngestedArticle[];

      gdeltRequestQueue.setCached(keyword, limit, articles);
      return {
        articles,
        requestUrl: url,
        responseStatus: response.status,
        rawCount,
      };
    });
  }

  private async requestGdelt(url: string): Promise<{ status: number; body: string }> {
    return retryWithBackoff(
      async () => {
        const response = await withTimeout(url, {
          headers: { Accept: "application/json" },
        });
        const body = await response.text();

        if (response.status === 429 || isGdeltRateLimitBody(body)) {
          gdeltRequestQueue.markRateLimited();
          throw new GdeltRateLimitError();
        }

        if (!response.ok) {
          throw new Error(
            `GDELT API failed (${response.status}): ${body.slice(0, 500)}`
          );
        }

        if (!body.trim().startsWith("{")) {
          throw new Error(
            `GDELT API returned non-JSON response: ${body.slice(0, 500)}`
          );
        }

        return { status: response.status, body };
      },
      {
        maxAttempts: 3,
        retryable: (error) => {
          if (error instanceof GdeltRateLimitError) return false;
          if (error instanceof Error && error.name === "AbortError") return true;
          const msg =
            error instanceof Error ? error.message.toLowerCase() : "";
          return (
            msg.includes("timeout") ||
            msg.includes("fetch failed") ||
            msg.includes("econnreset") ||
            msg.includes("network")
          );
        },
      }
    );
  }

  private dedupeArticles(articles: IngestedArticle[]): IngestedArticle[] {
    const seen = new Set<string>();
    const unique: IngestedArticle[] = [];

    for (const article of articles) {
      const dateKey = article.reportDate.slice(0, 10);
      const key = `${article.title.toLowerCase()}::${article.source.name.toLowerCase()}::${dateKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(article);
    }

    return unique;
  }
}

function isGdeltRateLimitBody(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.includes("please limit requests") ||
    lower.includes("too many requests")
  );
}

export const newsIngestionService = new NewsIngestionService();
