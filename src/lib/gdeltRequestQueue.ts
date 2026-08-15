import type { IngestionKeyword } from "@/lib/ingestionConstants";
import type { IngestedArticle } from "@/types";

export const GDELT_RATE_LIMIT_MS = 6000;
export const GDELT_CACHE_TTL_MS = 10 * 60 * 1000;
export const GDELT_RATE_LIMIT_MESSAGE =
  "GDELT rate limit reached. Please wait a few seconds before running another ingestion.";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GdeltCacheEntry {
  articles: IngestedArticle[];
  expiresAt: number;
}

class GdeltRequestQueue {
  private lastRequestFinishedAt = 0;
  private lastRateLimitAt = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, GdeltCacheEntry>();

  markRateLimited(): void {
    this.lastRateLimitAt = Date.now();
  }

  isRecentlyRateLimited(windowMs: number): boolean {
    if (this.lastRateLimitAt === 0) return false;
    return Date.now() - this.lastRateLimitAt < windowMs;
  }

  private cacheKey(keyword: IngestionKeyword, limit: number): string {
    return `${keyword}::${limit}`;
  }

  getCached(keyword: IngestionKeyword, limit: number): IngestedArticle[] | null {
    const key = this.cacheKey(keyword, limit);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.articles;
  }

  setCached(
    keyword: IngestionKeyword,
    limit: number,
    articles: IngestedArticle[]
  ): void {
    this.cache.set(this.cacheKey(keyword, limit), {
      articles,
      expiresAt: Date.now() + GDELT_CACHE_TTL_MS,
    });
  }

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    // Serialise requests and enforce the inter-request delay required by GDELT.
    const run = async (): Promise<T> => {
      if (this.lastRequestFinishedAt > 0) {
        await sleep(GDELT_RATE_LIMIT_MS);
      }

      try {
        return await task();
      } finally {
        this.lastRequestFinishedAt = Date.now();
      }
    };

    const result = this.chain.then(run, run);
    this.chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

export const gdeltRequestQueue = new GdeltRequestQueue();

export function isGdeltRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("gdelt ratelimiterror") ||
    lower.includes("please limit requests") ||
    lower.includes("too many requests")
  );
}

export function toGdeltFriendlyError(message: string): string {
  if (isGdeltRateLimitError(message)) {
    return GDELT_RATE_LIMIT_MESSAGE;
  }
  return message;
}
