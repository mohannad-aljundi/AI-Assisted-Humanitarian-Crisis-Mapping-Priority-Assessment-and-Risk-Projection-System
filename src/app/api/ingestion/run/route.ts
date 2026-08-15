import { NextResponse } from "next/server";
import {
  assertIngestionSourceAllowed,
  DEFAULT_INGESTION_LIMIT,
  DEFAULT_INGESTION_SOURCE,
  INGESTION_KEYWORDS,
  MAX_INGESTION_LIMIT,
  normaliseIngestionSource,
  type IngestionKeyword,
} from "@/lib/ingestionConstants";
import {
  getIngestionErrorStatus,
  IngestionValidationError,
  normalizeIngestionError,
} from "@/lib/ingestionErrors";
import { invalidateCache } from "@/lib/simpleCache";
import { syncMonitoringService } from "@/services/syncMonitoringService";
import { newsIngestionService } from "@/services/newsIngestionService";
import type { ManualImportArticle } from "@/types";

const VALID_KEYWORDS: IngestionKeyword[] = ["all", ...INGESTION_KEYWORDS];

function parseManualArticles(value: unknown): ManualImportArticle[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new IngestionValidationError("manualArticles must be an array");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new IngestionValidationError(
        `manualArticles[${index}] must be an object`
      );
    }

    const article = item as Record<string, unknown>;
    if (typeof article.title !== "string" || !article.title.trim()) {
      throw new IngestionValidationError(
        `manualArticles[${index}].title is required`
      );
    }
    if (typeof article.content !== "string" || !article.content.trim()) {
      throw new IngestionValidationError(
        `manualArticles[${index}].content is required`
      );
    }

    return {
      title: article.title.trim(),
      content: article.content.trim(),
      reportDate:
        typeof article.reportDate === "string" ? article.reportDate : undefined,
      sourceName:
        typeof article.sourceName === "string" ? article.sourceName : undefined,
      sourceType:
        typeof article.sourceType === "string"
          ? (article.sourceType as ManualImportArticle["sourceType"])
          : undefined,
      sourceCredibility:
        typeof article.sourceCredibility === "number"
          ? article.sourceCredibility
          : undefined,
      sourceUrl:
        typeof article.sourceUrl === "string" ? article.sourceUrl : undefined,
    };
  });
}

function parseIngestionRequest(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new IngestionValidationError("Request body must be a JSON object");
  }

  const input = body as {
    source?: string;
    keyword?: string;
    limit?: number;
    manualArticles?: unknown;
  };

  const source = normaliseIngestionSource(input.source ?? DEFAULT_INGESTION_SOURCE);
  const keyword = (input.keyword ?? "all") as IngestionKeyword;
  const limit = Math.min(
    input.limit ?? DEFAULT_INGESTION_LIMIT,
    MAX_INGESTION_LIMIT
  );
  const manualArticles = parseManualArticles(input.manualArticles);

  if (!source) {
    throw new IngestionValidationError(
      "Invalid ingestion source. Use FALLBACK, GDELT, NEWSAPI, GUARDIAN, RSS, RELIEFWEB, MANUAL, or ALL."
    );
  }

  assertIngestionSourceAllowed(source);

  if (!VALID_KEYWORDS.includes(keyword)) {
    throw new IngestionValidationError("Invalid ingestion keyword");
  }

  if (!Number.isFinite(limit) || limit < 1) {
    throw new IngestionValidationError("Limit must be at least 1");
  }

  return { source, keyword, limit, manualArticles };
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      throw new IngestionValidationError(
        parseError instanceof Error
          ? `Invalid JSON request body: ${parseError.message}`
          : "Invalid JSON request body"
      );
    }

    const { source, keyword, limit, manualArticles } = parseIngestionRequest(body);

    await syncMonitoringService.beginManualIngestion();

    try {
      await syncMonitoringService.finishManualIngestionPhase("analyzing");
      const result = await newsIngestionService.runIngestion({
        source,
        keyword,
        limit,
        manualArticles,
      });

      if (result.savedCount > 0) {
        invalidateCache("dashboard:");
        invalidateCache("map:");
      }

      const status = await syncMonitoringService.recordManualIngestionResult(result);
      await syncMonitoringService.resetIdlePhase();

      return NextResponse.json({ ...result, syncStatus: status }, { status: 200 });
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : "Ingestion failed";
      const status = await syncMonitoringService.recordManualIngestionResult(
        {
          fetchedCount: 0,
          analysedCount: 0,
          savedCount: 0,
          skippedCount: 0,
          errors: [{ title: "Ingestion", message }],
          reportIds: [],
          sourceSummaries: [],
          manualImportSuggested: false,
        },
        { failed: true, errorMessage: message }
      );
      await syncMonitoringService.resetIdlePhase();
      throw runError;
    }
  } catch (error) {
    const err = normalizeIngestionError(error);
    const status = getIngestionErrorStatus(error);

    console.error("INGESTION ERROR:", err.message);

    let syncStatus;
    try {
      syncStatus = await syncMonitoringService.getStatusAsync();
    } catch {
      syncStatus = undefined;
    }

    return NextResponse.json(
      {
        error: err.message,
        errorType: err.name,
        status: syncStatus,
        stack:
          process.env.NODE_ENV === "development" ? err.stack : undefined,
      },
      { status }
    );
  }
}
