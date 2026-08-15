"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { logClientPerf } from "@/lib/perfTrace";

export function NavigationPerfTracker() {
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);
  const navigatedAt = useRef<number>(0);

  useEffect(() => {
    const started = performance.now();
    navigatedAt.current = started;

    logClientPerf("route:mount", {
      pathname,
      previousPath: previousPath.current,
    });

    return () => {
      const unmountMs = Math.round(performance.now() - started);
      logClientPerf("route:unmount", {
        pathname,
        unmountMs,
        sinceNavigationMs: Math.round(performance.now() - navigatedAt.current),
      });
    };
  }, [pathname]);

  useEffect(() => {
    previousPath.current = pathname;
  }, [pathname]);

  return null;
}
