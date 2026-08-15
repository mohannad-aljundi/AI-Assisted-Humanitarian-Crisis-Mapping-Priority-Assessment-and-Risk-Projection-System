import { NextResponse } from "next/server";
import {
  getIngestionErrorStatus,
  IngestionValidationError,
  normalizeIngestionError,
} from "@/lib/ingestionErrors";
import { syncMonitoringService } from "@/services/syncMonitoringService";
import type { ManualImportArticle } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      sourceUrl:
        typeof article.sourceUrl === "string" ? article.sourceUrl : undefined,
    };
  });
}

export async function POST(request: Request) {
  try {
    let manualArticles: ManualImportArticle[] | undefined;

    try {
      const body = await request.json();
      manualArticles = parseManualArticles(
        (body as { manualArticles?: unknown })?.manualArticles
      );
    } catch (parseError) {
      if (parseError instanceof IngestionValidationError) {
        throw parseError;
      }
      // Empty body is fine for sync-now
    }

    const result = await syncMonitoringService.runSync({ manualArticles });
    const status = await syncMonitoringService.getStatusAsync();

    return NextResponse.json({ result, status }, { status: 200 });
  } catch (error) {
    const err = normalizeIngestionError(error);
    const httpStatus = getIngestionErrorStatus(error);

    console.error("SYNC ERROR:", err.message);

    const status = await syncMonitoringService.getStatusAsync();

    return NextResponse.json(
      {
        error: err.message,
        errorType: err.name,
        status,
      },
      { status: httpStatus }
    );
  }
}
