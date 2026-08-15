"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SimilarIncidentMatch } from "@/types/learning";
import { createCancellableRequest, swallowAbortError } from "@/lib/cancellableFetch";
import { logClientPerf } from "@/lib/perfTrace";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";

interface SimilarIncidentsPanelProps {
  reportId: string;
}

export function SimilarIncidentsPanel({ reportId }: SimilarIncidentsPanelProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [matches, setMatches] = useState<SimilarIncidentMatch[]>([]);
  const [influenceSummary, setInfluenceSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;

    const request = createCancellableRequest();
    const started = performance.now();
    setLoading(true);
    logClientPerf("fetch:start", {
      pathname: window.location.pathname,
      url: `/api/reports/${reportId}/learning/similar`,
    });

    async function load() {
      try {
        const res = await request.fetch(`/api/reports/${reportId}/learning/similar`);
        if (!res.ok) return;
        const data = await res.json();
        if (!mountedRef.current) return;
        setMatches(data.similarIncidents ?? []);
        setInfluenceSummary(data.learningInfluence?.summary ?? null);
        logClientPerf("fetch:complete", {
          url: `/api/reports/${reportId}/learning/similar`,
          ms: Math.round(performance.now() - started),
          aborted: false,
        });
      } catch (error) {
        if (swallowAbortError(error, request.signal)) {
          logClientPerf("fetch:aborted", {
            url: `/api/reports/${reportId}/learning/similar`,
            ms: Math.round(performance.now() - started),
          });
          return;
        }
        console.error("[SimilarIncidents] fetch failed:", error);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    void load();
    return () => {
      request.abort();
    };
  }, [reportId, shouldLoad]);

  if (!shouldLoad) {
    return (
      <section ref={containerRef} className={`${dashboardCard} h-48 animate-pulse`} />
    );
  }

  if (loading) {
    return <div className={`${dashboardCard} h-48 animate-pulse`} />;
  }

  return (
    <section ref={containerRef} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Similar Incidents</h2>
        <p className="mt-1 text-sm text-slate-500">
          Case-based reasoning from validated historical humanitarian cases
        </p>
      </div>

      {influenceSummary && (
        <div className={`${dashboardCard} border-blue-500/20 bg-blue-500/5 p-4 text-sm text-slate-300`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">
            Learning influence
          </p>
          <p className="mt-2">{influenceSummary}</p>
        </div>
      )}

      {matches.length === 0 ? (
        <div className={`${dashboardCard} p-6 text-sm text-slate-500`}>
          No similar historical cases yet. Learning accumulates as more reports are analysed and
          validated.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {matches.map((match) => (
            <article key={match.reportId} className={`${dashboardCard} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-emerald-400">
                    {Math.round(match.similarityScore * 100)}% similar
                    {match.analystValidated ? " · Validated" : ""}
                  </p>
                  <h3 className="mt-1 font-medium text-white">{match.title}</h3>
                </div>
                <Link
                  href={`/incidents/${match.reportId}`}
                  className="shrink-0 text-xs text-blue-400 hover:text-blue-300"
                >
                  View →
                </Link>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {match.crisisType ?? "—"} · {match.reportPurpose ?? "—"} · Phase:{" "}
                {match.crisisPhase ?? "—"}
              </p>
              <p className="mt-3 text-sm text-slate-400">
                <span className="text-slate-500">Why similar: </span>
                {match.similarityReasons.join("; ")}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                <span className="text-slate-500">Assessment difference: </span>
                {match.assessmentDifference}
              </p>
              {match.humanitarianNeeds.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Needs: {match.humanitarianNeeds.map((n) => n.needType).join(", ")}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
