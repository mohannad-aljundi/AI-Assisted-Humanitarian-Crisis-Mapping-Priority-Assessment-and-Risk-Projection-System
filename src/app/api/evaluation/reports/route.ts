import { NextRequest, NextResponse } from "next/server";
import type { PriorityLevel } from "@prisma/client";
import { evaluationReportService } from "@/services/evaluationReportService";
import type {
  EvaluationSort,
  EvaluationStatusFilter,
} from "@/types/evaluation";

export const dynamic = "force-dynamic";

const VALID_SORTS: EvaluationSort[] = [
  "newest",
  "oldest",
  "priority_desc",
  "priority_asc",
  "reliability_desc",
  "reliability_asc",
];

const VALID_PRIORITIES: PriorityLevel[] = ["Critical", "High", "Medium", "Low"];

const VALID_STATUSES: EvaluationStatusFilter[] = [
  "all",
  "validated",
  "feedback",
  "pending",
];

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const sortParam = params.get("sort") as EvaluationSort | null;
  const sort = sortParam && VALID_SORTS.includes(sortParam) ? sortParam : "newest";

  const priorityParam = params.get("priority") as PriorityLevel | null;
  const priority =
    priorityParam && VALID_PRIORITIES.includes(priorityParam)
      ? priorityParam
      : undefined;

  const statusParam = params.get("evaluationStatus") as EvaluationStatusFilter | null;
  const evaluationStatus =
    statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : "all";

  const reliabilityMin = parseNumber(params.get("reliabilityMin"));
  const reliabilityMax = parseNumber(params.get("reliabilityMax"));

  const result = await evaluationReportService.listReports({
    page: parseNumber(params.get("page")) ?? 1,
    limit: parseNumber(params.get("limit")) ?? 25,
    search: params.get("search") ?? undefined,
    crisisType: params.get("crisisType") ?? undefined,
    priority,
    reliabilityMin:
      reliabilityMin !== undefined ? reliabilityMin / 100 : undefined,
    reliabilityMax:
      reliabilityMax !== undefined ? reliabilityMax / 100 : undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    sourceId: params.get("sourceId") ?? undefined,
    evaluationStatus,
    sort,
  });

  return NextResponse.json(result);
}
