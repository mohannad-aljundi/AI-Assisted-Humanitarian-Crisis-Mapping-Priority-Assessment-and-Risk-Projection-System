"use client";

import { useEffect, useState } from "react";

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>;
  intervalMs?: number;
  initialData: T;
}

export function usePolling<T>({
  fetcher,
  intervalMs = 30_000,
  initialData,
}: UsePollingOptions<T>) {
  const [data, setData] = useState<T>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      setIsRefreshing(true);
      try {
        const next = await fetcher();
        if (!cancelled) setData(next);
      } catch {
        // Keep previous data on poll failure
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    }

    const timer = setInterval(refresh, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetcher, intervalMs]);

  return { data, isRefreshing };
}
