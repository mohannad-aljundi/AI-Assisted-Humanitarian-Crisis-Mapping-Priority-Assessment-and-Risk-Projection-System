import type { Prisma, PriorityLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  EvaluationReportsQuery,
  EvaluationSort,
  EvaluationStatusFilter,
} from "@/types/evaluation";

const ANALYSED_REPORT_FILTER = {
  priorityAssessment: { isNot: null },
  reliabilityAssessment: { isNot: null },
} as const;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function buildWhere(query: EvaluationReportsQuery): Prisma.ReportWhereInput {
  const where: Prisma.ReportWhereInput = {
    ...ANALYSED_REPORT_FILTER,
    OR: [
      { masterIncidentMember: null },
      { masterIncidentMember: { isCanonical: true } },
    ],
  };

  if (query.search?.trim()) {
    const term = query.search.trim();
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { incidentLabel: { contains: term, mode: "insensitive" } },
        ],
      },
    ];
  }

  if (query.crisisType) {
    where.extractedEntities = {
      some: {
        entityType: "CRISIS_TYPE",
        value: { equals: query.crisisType, mode: "insensitive" },
      },
    };
  }

  if (query.priority) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          {
            masterIncidentMember: {
              is: { masterIncident: { dynamicPriorityLevel: query.priority } },
            },
          },
          {
            masterIncidentMember: null,
            priorityAssessment: { is: { priorityLevel: query.priority } },
          },
        ],
      },
    ];
  }

  const reliabilityMin = query.reliabilityMin;
  const reliabilityMax = query.reliabilityMax;
  if (reliabilityMin !== undefined || reliabilityMax !== undefined) {
    where.reliabilityAssessment = {
      is: {
        finalScore: {
          ...(reliabilityMin !== undefined ? { gte: reliabilityMin } : {}),
          ...(reliabilityMax !== undefined ? { lte: reliabilityMax } : {}),
        },
      },
    };
  }

  if (query.dateFrom || query.dateTo) {
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
    if (dateTo) {
      dateTo.setHours(23, 59, 59, 999);
    }

    where.reportDate = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  if (query.sourceId) {
    where.sourceId = query.sourceId;
  }

  const status = query.evaluationStatus ?? "all";
  if (status !== "all") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      ...buildEvaluationStatusFilter(status),
    ];
  }

  return where;
}

function buildEvaluationStatusFilter(
  status: EvaluationStatusFilter
): Prisma.ReportWhereInput[] {
  switch (status) {
    case "validated":
      return [{ learningCase: { analystValidated: true } }];
    case "feedback":
      return [{ analystFeedback: { some: {} } }];
    case "pending":
      return [
        {
          OR: [
            { learningCase: null },
            { learningCase: { analystValidated: false } },
          ],
        },
        { analystFeedback: { none: {} } },
      ];
    default:
      return [];
  }
}

function buildOrderBy(sort: EvaluationSort = "newest"): Prisma.ReportOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ reportDate: "asc" }, { id: "asc" }];
    case "confirmation_desc":
      return [
        { masterIncidentMember: { masterIncident: { confidenceScore: "desc" } } },
        { masterIncidentMember: { masterIncident: { dynamicPriorityScore: "desc" } } },
        { reportDate: "desc" },
        { id: "desc" },
      ];
    case "dynamic_priority_desc":
      return [
        { masterIncidentMember: { masterIncident: { dynamicPriorityScore: "desc" } } },
        { reportDate: "desc" },
        { id: "desc" },
      ];
    case "linked_reports_desc":
      return [
        { masterIncidentMember: { masterIncident: { supportingReportCount: "desc" } } },
        { masterIncidentMember: { masterIncident: { dynamicPriorityScore: "desc" } } },
        { reportDate: "desc" },
        { id: "desc" },
      ];
    case "priority_desc":
      return [
        { masterIncidentMember: { masterIncident: { dynamicPriorityScore: "desc" } } },
        { priorityAssessment: { severityScore: "desc" } },
        { id: "desc" },
      ];
    case "priority_asc":
      return [
        { masterIncidentMember: { masterIncident: { dynamicPriorityScore: "asc" } } },
        { priorityAssessment: { severityScore: "asc" } },
        { id: "asc" },
      ];
    case "reliability_desc":
      return [{ reliabilityAssessment: { finalScore: "desc" } }, { id: "desc" }];
    case "reliability_asc":
      return [{ reliabilityAssessment: { finalScore: "asc" } }, { id: "asc" }];
    case "newest":
    default:
      // Prefer recently analysed/updated so live completions surface at the top.
      return [{ updatedAt: "desc" }, { reportDate: "desc" }, { id: "desc" }];
  }
}

const LIST_INCLUDE = {
  source: { select: { id: true, name: true } },
  priorityAssessment: true,
  reliabilityAssessment: true,
  extractedEntities: {
    where: {
      entityType: {
        in: ["CRISIS_TYPE", "LOCATION", "AFFECTED_POPULATION"],
      },
    },
  },
  learningCase: {
    select: { analystValidated: true },
  },
  masterIncidentMember: {
    include: {
      masterIncident: {
        include: { intelligence: true },
      },
    },
  },
  _count: { select: { analystFeedback: true } },
} as const;

export type EvaluationReportRow = Awaited<
  ReturnType<EvaluationReportRepository["findReports"]>
>["items"][number];

export class EvaluationReportRepository {
  async findById(reportId: string) {
    return prisma.report.findUnique({
      where: { id: reportId },
      include: LIST_INCLUDE,
    });
  }

  async findReports(query: EvaluationReportsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, query.limit ?? DEFAULT_LIMIT)
    );
    const skip = (page - 1) * limit;
    const where = buildWhere(query);
    const orderBy = buildOrderBy(query.sort);

    const [items, totalCount] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: LIST_INCLUDE,
      }),
      prisma.report.count({ where }),
    ]);

    const hasMore = skip + items.length < totalCount;

    return {
      items,
      page,
      nextPage: hasMore ? page + 1 : null,
      hasMore,
      totalCount,
    };
  }

  async getFilterOptions() {
    const [sources, crisisTypeGroups] = await Promise.all([
      prisma.source.findMany({
        where: { reports: { some: ANALYSED_REPORT_FILTER } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.extractedEntity.groupBy({
        by: ["value"],
        where: { entityType: "CRISIS_TYPE" },
        orderBy: { value: "asc" },
      }),
    ]);

    const crisisTypes = crisisTypeGroups
      .map((group) => group.value.trim())
      .filter(Boolean);

    const priorities: PriorityLevel[] = ["Critical", "High", "Medium", "Low"];

    return {
      sources,
      crisisTypes,
      priorities,
      evaluationStatuses: [
        { value: "all" as const, label: "All statuses" },
        { value: "validated" as const, label: "Analyst validated" },
        { value: "feedback" as const, label: "Feedback submitted" },
        { value: "pending" as const, label: "Pending review" },
      ],
    };
  }
}

export const evaluationReportRepository = new EvaluationReportRepository();
