import { NextResponse } from "next/server";
import { continuousHumanitarianLearningEngine } from "@/services/continuousHumanitarianLearningEngine";
import { invalidateIncidentCache } from "@/services/incidentCache";
import type { SubmitFeedbackInput } from "@/types/learning";
import type { CorrectionField } from "@prisma/client";

const VALID_FIELDS: CorrectionField[] = [
  "PRIORITY",
  "RISK",
  "RELIABILITY",
  "CRISIS_TYPE",
  "CONFIDENCE",
  "HUMANITARIAN_NEED",
  "REPORT_PURPOSE",
  "CRISIS_PHASE",
  "DISASTER_SEVERITY",
];

interface RouteParams {
  params: Promise<{ reportId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { reportId } = await params;
    const corrections = await continuousHumanitarianLearningEngine.listCorrections(reportId);
    return NextResponse.json({ reportId, corrections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load corrections";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { reportId } = await params;
    const body = (await request.json()) as Partial<SubmitFeedbackInput>;

    if (!Array.isArray(body.corrections) || body.corrections.length === 0) {
      return NextResponse.json(
        { error: "At least one correction is required" },
        { status: 400 }
      );
    }

    for (const correction of body.corrections) {
      if (!correction.field || !VALID_FIELDS.includes(correction.field)) {
        return NextResponse.json({ error: `Invalid correction field: ${correction.field}` }, { status: 400 });
      }
      if (correction.originalValue === undefined || correction.correctedValue === undefined) {
        return NextResponse.json(
          { error: "Each correction requires originalValue and correctedValue" },
          { status: 400 }
        );
      }
    }

    const result = await continuousHumanitarianLearningEngine.submitAnalystFeedback({
      reportId,
      analystId: body.analystId,
      summary: body.summary,
      corrections: body.corrections,
    });

    invalidateIncidentCache(reportId);

    return NextResponse.json({
      success: true,
      feedbackId: result.feedback.id,
      examplesCreated: result.examples.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit feedback";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
