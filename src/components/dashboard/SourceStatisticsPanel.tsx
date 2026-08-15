"use client";

import type { SourceStatisticsDashboard } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScoreBar } from "@/components/ui/ScoreBar";

interface SourceStatisticsPanelProps {
  statistics: SourceStatisticsDashboard;
}

const STATUS_DOT: Record<string, string> = {
  available: "bg-emerald-400",
  requires_api_key: "bg-amber-400",
  rate_limited: "bg-orange-400",
  disabled: "bg-slate-500",
};

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

export function SourceStatisticsPanel({ statistics }: SourceStatisticsPanelProps) {
  return (
    <SectionCard
      title="Source Performance"
      description={`${statistics.connectedSources} sources connected · ${statistics.totalReportsToday} reports today`}
    >
      <div className="mb-6 flex h-16 items-end gap-1">
        {statistics.weeklyIngestionTrend.map((count, i) => {
          const max = Math.max(...statistics.weeklyIngestionTrend, 1);
          const height = Math.max(8, (count / max) * 100);
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-cyan-500/70 transition-all duration-500"
                style={{ height: `${height}%` }}
              />
              <span className="text-[10px] text-slate-500">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="pb-3 pr-4">Source</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3 pr-4">Fetched</th>
              <th className="pb-3 pr-4">Inserted</th>
              <th className="pb-3 pr-4">Duplicates</th>
              <th className="pb-3 pr-4">Failed</th>
              <th className="pb-3 pr-4">Uptime</th>
              <th className="pb-3 pr-4">Last Success</th>
              <th className="pb-3">Last Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {statistics.sources.map((source) => (
              <tr key={source.providerId} className="text-slate-300">
                <td className="py-3 pr-4 font-medium text-white">{source.name}</td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[source.status]}`} />
                    {source.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="py-3 pr-4">{source.totalFetched}</td>
                <td className="py-3 pr-4 text-emerald-300">{source.totalSaved}</td>
                <td className="py-3 pr-4">{source.duplicatesSkipped}</td>
                <td className="py-3 pr-4 text-red-400">{source.failedRequests}</td>
                <td className="w-28 py-3 pr-4">
                  <ScoreBar
                    label=""
                    value={source.uptimeScore}
                    tone={
                      source.uptimeScore >= 0.8
                        ? "low"
                        : source.uptimeScore >= 0.5
                          ? "medium"
                          : "critical"
                    }
                  />
                </td>
                <td className="py-3 pr-4 text-xs text-slate-500">
                  {formatDate(source.lastSuccessAt)}
                </td>
                <td className="max-w-xs py-3 text-xs text-red-300">
                  {source.lastError ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
