"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PriorityLevel } from "@prisma/client";
import type {
  EvaluationFilterOptions,
  EvaluationReportListItem,
  EvaluationSort,
  EvaluationStatusFilter,
} from "@/types/evaluation";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  btnGhost,
  btnPrimary,
  inputDark,
  selectDark,
  tableCell,
  tableHead,
} from "@/lib/uiClasses";
import {
  formatConfidencePercent,
  formatReportCount,
  formatSourceCount,
} from "@/lib/evaluationTableStatus";
import { EvaluationRowInspector } from "@/components/evaluation/EvaluationRowInspector";
import { EvaluationVerificationCell } from "@/components/evaluation/EvaluationVerificationCell";
import {
  ANALYSIS_COMPLETED_EVENT,
  useAnalysisLiveOptional,
} from "@/contexts/AnalysisLiveContext";
import type { CompletedAnalysisCard } from "@/lib/analysisEventBus";
import { CurrentProcessingCard } from "@/components/analysis/CurrentProcessingCard";
import { LastSuccessfulSyncCard } from "@/components/analysis/LastSuccessfulSyncCard";
import { ProcessingQueuePanel } from "@/components/analysis/ProcessingQueuePanel";
import { RecentlyCompletedIntelligencePanel } from "@/components/analysis/RecentlyCompletedIntelligencePanel";

const COMPACT_CELL = `${tableCell} px-2 py-2 align-middle text-xs`;
const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;

interface ReportFilters {
  search: string;
  crisisType: string;
  priority: string;
  reliabilityMin: string;
  reliabilityMax: string;
  dateFrom: string;
  dateTo: string;
  sourceId: string;
  evaluationStatus: EvaluationStatusFilter;
  sort: EvaluationSort;
}

const DEFAULT_FILTERS: ReportFilters = {
  search: "",
  crisisType: "",
  priority: "",
  reliabilityMin: "",
  reliabilityMax: "",
  dateFrom: "",
  dateTo: "",
  sourceId: "",
  evaluationStatus: "all",
  sort: "confirmation_desc",
};

function buildQueryParams(
  filters: ReportFilters,
  page: number
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));
  params.set("sort", filters.sort);

  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.crisisType) params.set("crisisType", filters.crisisType);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.reliabilityMin) params.set("reliabilityMin", filters.reliabilityMin);
  if (filters.reliabilityMax) params.set("reliabilityMax", filters.reliabilityMax);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.sourceId) params.set("sourceId", filters.sourceId);
  if (filters.evaluationStatus !== "all") {
    params.set("evaluationStatus", filters.evaluationStatus);
  }

  return params;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CompactPriorityBadge({ level }: { level: PriorityLevel }) {
  const tone =
    level === "Critical"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : level === "High"
        ? "border-orange-500/30 bg-orange-500/10 text-orange-200"
        : level === "Medium"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";

  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${tone}`}
    >
      {level}
    </span>
  );
}

function NumericCell({
  value,
  title,
}: {
  value: string;
  title?: string;
}) {
  return (
    <span className="block text-center tabular-nums text-slate-300" title={title}>
      {value}
    </span>
  );
}

function TableSkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <tr key={index} className="animate-pulse">
          {Array.from({ length: 9 }).map((__, cellIndex) => (
            <td key={cellIndex} className={`${COMPACT_CELL}`}>
              <div className="h-3 rounded bg-white/10" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

interface EvaluationReportsPanelProps {
  title?: string;
  description?: string;
  viewLabel?: string;
  viewHref?: (reportId: string) => string;
}

export function EvaluationReportsPanel({
  title = "Evaluation Test Cases",
  description = "Search, filter, and review all analysed reports used as dissertation evaluation samples",
  viewLabel = "Evaluate",
  viewHref = (reportId) => `/incidents/${reportId}`,
}: EvaluationReportsPanelProps) {
  const [filterOptions, setFilterOptions] = useState<EvaluationFilterOptions | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<EvaluationReportListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<EvaluationReportListItem | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const live = useAnalysisLiveOptional();

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreLockRef = useRef(false);
  const filtersRef = useRef(filters);
  const itemIdsRef = useRef<Set<string>>(new Set());
  filtersRef.current = filters;

  useEffect(() => {
    itemIdsRef.current = new Set(items.map((item) => item.id));
  }, [items]);

  useEffect(() => {
    async function insertLiveRow(report: CompletedAnalysisCard) {
      let row: EvaluationReportListItem | null = null;

      try {
        const res = await fetch(`/api/evaluation/reports/${report.id}`, {
          cache: "no-store",
        });
        const payload = (await res.json()) as {
          item: EvaluationReportListItem | null;
          listVisible: boolean;
          reason: string | null;
        };

        if (!payload.item) {
          console.error(
            `[EvaluationUI] Completed report ${report.id} not added to table: ${payload.reason ?? res.statusText}`
          );
          // Fall back to optimistic card so the user still sees it.
          row = {
            id: report.id,
            incidentLabel: report.incidentLabel,
            originalTitle: report.originalTitle,
            title: report.incidentLabel,
            reportDate: report.completedAt,
            analysedAt: report.completedAt,
            sourceId: "",
            sourceName: "Live analysis",
            crisisType: report.crisisType,
            location: null,
            priorityLevel: report.priorityLevel,
            reliabilityScore: report.reliabilityPercent / 100,
            affectedPopulation: null,
            evaluationStatus: "Pending review",
            supportingReportCount: 1,
            independentSourceCount: 1,
            confidenceScore: report.reliabilityPercent,
            displayStatus: { label: "Just completed", kind: "pending" },
          };
        } else {
          if (!payload.listVisible && payload.reason) {
            console.warn(`[EvaluationUI] ${payload.reason}`);
          }
          row = {
            ...payload.item,
            displayStatus: {
              label: "Just completed",
              kind: payload.item.displayStatus?.kind ?? "pending",
            },
          };
          console.info(
            `[EvaluationUI] evaluation_row_added ${report.id} (${report.incidentLabel})`
          );
        }
      } catch (error) {
        console.error(
          `[EvaluationUI] Failed to load completed report ${report.id} for table:`,
          error
        );
        return;
      }

      if (!row) return;

      const isNew = !itemIdsRef.current.has(row.id);
      itemIdsRef.current.add(row.id);

      setItems((prev) => {
        if (!isNew) {
          return prev.map((item) => (item.id === row!.id ? { ...item, ...row! } : item));
        }
        return [row!, ...prev];
      });
      if (isNew) {
        setTotalCount((count) => count + 1);
      }
      setHighlightedIds((prev) => new Set(prev).add(row!.id));
      window.setTimeout(() => {
        setHighlightedIds((prev) => {
          const next = new Set(prev);
          next.delete(row!.id);
          return next;
        });
      }, 4000);
    }

    function onCompleted(event: Event) {
      const report = (event as CustomEvent<CompletedAnalysisCard>).detail;
      if (!report?.id) {
        console.error(
          "[EvaluationUI] analysis_completed event missing report id — row not added"
        );
        return;
      }
      void insertLiveRow(report);
    }

    window.addEventListener(ANALYSIS_COMPLETED_EVENT, onCompleted);
    return () => window.removeEventListener(ANALYSIS_COMPLETED_EVENT, onCompleted);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      try {
        const res = await fetch("/api/evaluation/filter-options");
        if (!res.ok) return;
        const data = (await res.json()) as EvaluationFilterOptions;
        if (!cancelled) setFilterOptions(data);
      } catch {
        // Filter dropdowns fall back to empty options
      }
    }
    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(
    async (pageToLoad: number, replace: boolean) => {
      const params = buildQueryParams(
        { ...filtersRef.current, search: debouncedSearch },
        pageToLoad
      );

      const res = await fetch(`/api/evaluation/reports?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load evaluation reports");
      }

      const data = (await res.json()) as {
        items: EvaluationReportListItem[];
        page: number;
        nextPage: number | null;
        hasMore: boolean;
        totalCount: number;
      };

      setTotalCount(data.totalCount);
      setHasMore(data.hasMore);
      setPage(data.page);

      setItems((prev) =>
        replace ? data.items : [...prev, ...data.items]
      );

      return data;
    },
    [debouncedSearch]
  );

  const loadFirstPage = useCallback(async () => {
    setError(null);
    setInitialLoading(true);
    setHasMore(true);
    try {
      await fetchPage(1, true);
    } catch {
      setError("Could not load evaluation reports.");
      setItems([]);
      setTotalCount(0);
      setHasMore(false);
    } finally {
      setInitialLoading(false);
    }
  }, [fetchPage]);

  const loadNextPage = useCallback(async () => {
    if (loadMoreLockRef.current || !hasMore || initialLoading || loadingMore) {
      return;
    }

    loadMoreLockRef.current = true;
    setLoadingMore(true);
    setError(null);

    try {
      await fetchPage(page + 1, false);
    } catch {
      setError("Could not load more reports.");
    } finally {
      setLoadingMore(false);
      loadMoreLockRef.current = false;
    }
  }, [fetchPage, hasMore, initialLoading, loadingMore, page]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFirstPage();
    } finally {
      setRefreshing(false);
    }
  }, [loadFirstPage]);

  useEffect(() => {
    void loadFirstPage();
  }, [
    debouncedSearch,
    filters.crisisType,
    filters.priority,
    filters.reliabilityMin,
    filters.reliabilityMax,
    filters.dateFrom,
    filters.dateTo,
    filters.sourceId,
    filters.evaluationStatus,
    filters.sort,
    loadFirstPage,
  ]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || initialLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNextPage();
        }
      },
      { rootMargin: "240px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, initialLoading, loadNextPage, items.length]);

  const updateFilter = <K extends keyof ReportFilters>(
    key: K,
    value: ReportFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setDebouncedSearch("");
  };

  const hasActiveFilters =
    debouncedSearch.trim() !== "" ||
    filters.crisisType !== "" ||
    filters.priority !== "" ||
    filters.reliabilityMin !== "" ||
    filters.reliabilityMax !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.sourceId !== "" ||
    filters.evaluationStatus !== "all";

  return (
    <SectionCard
      title={title}
      description={description}
      action={
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing || initialLoading}
          className={btnGhost}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-5">
            <ProcessingQueuePanel />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:col-span-3 xl:grid-cols-1">
            <CurrentProcessingCard />
            <LastSuccessfulSyncCard />
          </div>
          <div className="xl:col-span-4">
            <RecentlyCompletedIntelligencePanel />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          <label className="lg:col-span-2">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Search incidents
            </span>
            <input
              type="search"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search by AI label or headline…"
              className={inputDark}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Crisis type
            </span>
            <select
              value={filters.crisisType}
              onChange={(event) => updateFilter("crisisType", event.target.value)}
              className={selectDark}
            >
              <option value="">All crisis types</option>
              {filterOptions?.crisisTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Priority
            </span>
            <select
              value={filters.priority}
              onChange={(event) =>
                updateFilter("priority", event.target.value as PriorityLevel | "")
              }
              className={selectDark}
            >
              <option value="">All priorities</option>
              {filterOptions?.priorities.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Reliability min (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={filters.reliabilityMin}
              onChange={(event) => updateFilter("reliabilityMin", event.target.value)}
              placeholder="0"
              className={inputDark}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Reliability max (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={filters.reliabilityMax}
              onChange={(event) => updateFilter("reliabilityMax", event.target.value)}
              placeholder="100"
              className={inputDark}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Date from
            </span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => updateFilter("dateFrom", event.target.value)}
              className={inputDark}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Date to
            </span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => updateFilter("dateTo", event.target.value)}
              className={inputDark}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Source
            </span>
            <select
              value={filters.sourceId}
              onChange={(event) => updateFilter("sourceId", event.target.value)}
              className={selectDark}
            >
              <option value="">All sources</option>
              {filterOptions?.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Evaluation status
            </span>
            <select
              value={filters.evaluationStatus}
              onChange={(event) =>
                updateFilter(
                  "evaluationStatus",
                  event.target.value as EvaluationStatusFilter
                )
              }
              className={selectDark}
            >
              {filterOptions?.evaluationStatuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              )) ?? (
                <>
                  <option value="all">All statuses</option>
                  <option value="validated">Analyst validated</option>
                  <option value="feedback">Feedback submitted</option>
                  <option value="pending">Pending review</option>
                </>
              )}
            </select>
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Sort by
            </span>
            <select
              value={filters.sort}
              onChange={(event) =>
                updateFilter("sort", event.target.value as EvaluationSort)
              }
              className={selectDark}
            >
              <option value="confirmation_desc">Most confirmed</option>
              <option value="dynamic_priority_desc">Highest dynamic priority</option>
              <option value="linked_reports_desc">Most linked reports</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="priority_desc">Highest priority</option>
              <option value="priority_asc">Lowest priority</option>
              <option value="reliability_desc">Highest reliability</option>
              <option value="reliability_asc">Lowest reliability</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {initialLoading
              ? "Loading reports…"
              : `${items.length} of ${totalCount} report${totalCount === 1 ? "" : "s"} shown`}
          </p>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className={btnGhost}>
              Clear filters
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className={`${btnPrimary} ml-3 px-3 py-1.5 text-xs`}
            >
              Retry
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[8%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
              <col className="w-[22%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/40">
                <th className={`${tableHead} px-2 py-2 align-bottom`}>AI Incident</th>
                <th className={`${tableHead} whitespace-nowrap px-2 py-2 align-bottom`}>Date</th>
                <th className={`${tableHead} px-2 py-2 align-bottom`}>Crisis</th>
                <th className={`${tableHead} whitespace-nowrap px-2 py-2 align-bottom`}>Priority</th>
                <th className={`${tableHead} px-2 py-2 align-bottom`}>Verification</th>
                <th
                  className={`${tableHead} whitespace-nowrap px-3 py-2 text-center align-bottom leading-tight`}
                >
                  Confidence
                </th>
                <th
                  className={`${tableHead} whitespace-nowrap px-3 py-2 text-center align-bottom leading-tight`}
                >
                  Sources
                </th>
                <th
                  className={`${tableHead} whitespace-nowrap px-3 py-2 text-center align-bottom leading-tight`}
                >
                  Reports
                </th>
                <th
                  className={`${tableHead} whitespace-nowrap px-3 py-2 text-center align-bottom leading-tight`}
                >
                  View
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {initialLoading ? (
                <TableSkeletonRows count={8} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <p className="text-base font-medium text-slate-300">
                      No reports match your filters.
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Try adjusting search terms or clearing filters to see more results.
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className={`${btnGhost} mt-4`}
                      >
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((report) => (
                  <tr
                    key={report.id}
                    className={`cursor-pointer transition-colors duration-500 hover:bg-white/[0.03] ${
                      highlightedIds.has(report.id) || live?.pinnedReportId === report.id
                        ? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/30"
                        : ""
                    }`}
                    onClick={() => setSelectedReport(report)}
                  >
                    <td className={`${COMPACT_CELL} align-top`}>
                      <div className="flex min-w-0 items-start gap-1.5">
                        {report.masterIncidentId ? (
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400"
                            title="Master incident cluster"
                            aria-hidden
                          />
                        ) : null}
                        <p
                          className="min-w-0 truncate text-sm font-bold leading-snug text-white"
                          title={report.originalTitle}
                        >
                          {report.incidentLabel}
                        </p>
                      </div>
                    </td>
                    <td className={`${COMPACT_CELL} align-top whitespace-nowrap text-slate-400`}>
                      {formatDate(report.reportDate)}
                    </td>
                    <td className={`${COMPACT_CELL} align-top`}>
                      <span className="block break-words text-xs leading-snug text-slate-300">
                        {report.crisisType ?? "—"}
                      </span>
                    </td>
                    <td className={`${COMPACT_CELL} align-top whitespace-nowrap`}>
                      <CompactPriorityBadge level={report.priorityLevel} />
                    </td>
                    <td className={`${COMPACT_CELL} align-top`}>
                      <EvaluationVerificationCell report={report} />
                    </td>
                    <td className={`${COMPACT_CELL} align-top whitespace-nowrap`}>
                      <NumericCell
                        value={formatConfidencePercent(report)}
                        title={`Cluster confidence ${formatConfidencePercent(report)}`}
                      />
                    </td>
                    <td className={`${COMPACT_CELL} align-top whitespace-nowrap`}>
                      <NumericCell
                        value={formatSourceCount(report)}
                        title={`${formatSourceCount(report)} independent source${formatSourceCount(report) === "1" ? "" : "s"}`}
                      />
                    </td>
                    <td className={`${COMPACT_CELL} align-top whitespace-nowrap`}>
                      <NumericCell
                        value={formatReportCount(report)}
                        title={`${formatReportCount(report)} linked report${formatReportCount(report) === "1" ? "" : "s"}`}
                      />
                    </td>
                    <td className={`${COMPACT_CELL} align-middle text-center`}>
                      <Link
                        href={viewHref(report.id)}
                        className="inline-flex min-w-[4.5rem] items-center justify-center whitespace-nowrap px-2 py-1 text-xs font-medium text-blue-400 hover:text-blue-300"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {viewLabel}
                      </Link>
                    </td>
                  </tr>
                ))
              )}

              {loadingMore && <TableSkeletonRows count={3} />}
            </tbody>
          </table>
        </div>

        <div ref={sentinelRef} className="h-1" aria-hidden />

        {!initialLoading && items.length > 0 && !hasMore && (
          <p className="text-center text-sm text-slate-500">No more reports</p>
        )}

        {!initialLoading && items.length > 0 && hasMore && loadingMore && (
          <p className="text-center text-sm text-slate-500">Loading more reports…</p>
        )}
      </div>

      {selectedReport ? (
        <EvaluationRowInspector
          report={selectedReport}
          viewHref={viewHref}
          viewLabel={viewLabel}
          onClose={() => setSelectedReport(null)}
        />
      ) : null}
    </SectionCard>
  );
}
