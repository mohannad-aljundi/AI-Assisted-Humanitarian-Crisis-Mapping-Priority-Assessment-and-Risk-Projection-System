import { NextResponse } from "next/server";
import { parseReportDate } from "@/lib/utils";
import { analysisService } from "@/services/analysisService";
import type { ReportInput } from "@/types";
import type { SourceType } from "@prisma/client";

const VALID_SOURCE_TYPES: SourceType[] = [
  "OFFICIAL",
  "MEDIA",
  "NGO",
  "SOCIAL",
  "FIELD",
  "OTHER",
];

function validateReportInput(body: unknown): ReportInput {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object");
  }

  const input = body as Partial<ReportInput>;

  if (!input.title?.trim()) {
    throw new Error("Report title is required");
  }

  if (!input.content?.trim()) {
    throw new Error("Report content is required");
  }

  if (!input.reportDate?.trim()) {
    throw new Error("Report date is required");
  }

  parseReportDate(input.reportDate);

  if (input.source) {
    if (!input.source.name?.trim()) {
      throw new Error("Source name is required when source is provided");
    }
    if (!VALID_SOURCE_TYPES.includes(input.source.type)) {
      throw new Error("Invalid source type");
    }
    if (
      input.source.credibilityScore !== undefined &&
      (input.source.credibilityScore < 0 || input.source.credibilityScore > 1)
    ) {
      throw new Error("Source credibility score must be between 0 and 1");
    }
  }

  return {
    title: input.title.trim(),
    content: input.content.trim(),
    reportDate: input.reportDate.trim(),
    source: input.source
      ? {
          name: input.source.name.trim(),
          type: input.source.type,
          credibilityScore: input.source.credibilityScore,
          url: input.source.url?.trim(),
        }
      : undefined,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reportInput = validateReportInput(body);

    const result = await analysisService.analyseAndPersist(reportInput);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyse report";

    const status = message.includes("database") ? 500 : 400;
    return NextResponse.json({ error: message, saved: false }, { status });
  }
}
