"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardAlert } from "@/types";
import { AlertCard } from "@/components/alerts/AlertCard";
import { SectionCard } from "@/components/ui/SectionCard";
import { btnGhost } from "@/lib/uiClasses";

const PAGE_SIZE = 25;

export function AlertsListPanel() {
  const [items, setItems] = useState<DashboardAlert[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);

  const fetchPage = useCallback(async (pageToLoad: number, replace: boolean) => {
    const res = await fetch(`/api/alerts?page=${pageToLoad}&limit=${PAGE_SIZE}`);
    if (!res.ok) throw new Error("Failed to load alerts");
    const data = await res.json();
    setTotalCount(data.totalCount);
    setHasMore(data.hasMore);
    setPage(data.page);
    setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
  }, []);

  const loadFirst = useCallback(async () => {
    setInitialLoading(true);
    try {
      await fetchPage(1, true);
    } finally {
      setInitialLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (lockRef.current || !hasMore || initialLoading || loadingMore) return;
    lockRef.current = true;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1, false);
    } finally {
      setLoadingMore(false);
      lockRef.current = false;
    }
  }, [fetchPage, hasMore, initialLoading, loadingMore, page]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || initialLoading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, initialLoading, loadMore, items.length]);

  return (
    <SectionCard
      title="Intelligence Alerts"
      description="Automated alerts from crisis analysis, escalation detection, and multi-source verification."
      action={
        <button type="button" className={btnGhost} onClick={() => void loadFirst()}>
          Refresh
        </button>
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        {initialLoading
          ? "Loading alerts…"
          : `${items.length} of ${totalCount} alert${totalCount === 1 ? "" : "s"} shown`}
      </p>

      {initialLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          No alerts yet. Analyse or ingest reports to generate smart alerts.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" aria-hidden />
      {loadingMore && (
        <p className="mt-4 text-center text-sm text-slate-500">Loading more alerts…</p>
      )}
      {!initialLoading && items.length > 0 && !hasMore && (
        <p className="mt-4 text-center text-sm text-slate-500">No more alerts</p>
      )}
    </SectionCard>
  );
}
