"use client";

import Link from "next/link";
import { useEffect } from "react";
import { btnPrimary, pageContainer } from "@/lib/uiClasses";

export default function CrisisMapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Crisis map error:", error);
  }, [error]);

  return (
    <div className={`${pageContainer} flex min-h-[60vh] flex-col items-center justify-center text-center`}>
      <h1 className="text-2xl font-semibold text-white">Unable to Load Crisis Map</h1>
      <p className="mt-3 max-w-md text-slate-400">
        Geospatial data could not be retrieved from Supabase.
      </p>
      <p className="mt-2 text-sm text-red-300">{error.message}</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className={btnPrimary}>
          Retry
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
