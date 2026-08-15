"use client";

import { useState } from "react";
import { formatGroupedMessage } from "@/lib/syncWarningFormatter";
import type { GroupedWarning, WarningSeverity } from "@/types";

const SEVERITY_STYLES: Record<
  WarningSeverity,
  { badge: string; border: string; bg: string }
> = {
  info: {
    badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    border: "border-emerald-500/25",
    bg: "bg-emerald-500/5",
  },
  warning: {
    badge: "border-yellow-500/40 bg-yellow-500/15 text-yellow-300",
    border: "border-yellow-500/25",
    bg: "bg-yellow-500/5",
  },
  critical: {
    badge: "border-red-500/40 bg-red-500/15 text-red-300",
    border: "border-red-500/25",
    bg: "bg-red-500/5",
  },
};

const SEVERITY_LABELS: Record<WarningSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

const SHOW_TECHNICAL_DETAILS =
  process.env.NEXT_PUBLIC_SHOW_TECHNICAL_DETAILS === "true" ||
  process.env.NODE_ENV === "development";

interface SyncWarningsListProps {
  warnings: GroupedWarning[];
}

export function SyncWarningsList({ warnings }: SyncWarningsListProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  if (warnings.length === 0) return null;

  function toggleDetails(groupKey: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <p className="text-sm font-medium text-amber-100">Sync Warnings</p>
      <ul className="mt-3 space-y-2">
        {warnings.map((warning) => {
          const styles = SEVERITY_STYLES[warning.severity];
          const hasDetails = SHOW_TECHNICAL_DETAILS && Boolean(warning.technicalDetails);
          const expanded = expandedKeys.has(warning.groupKey);

          return (
            <li
              key={warning.groupKey}
              className={`rounded-lg border px-3 py-2 ${styles.border} ${styles.bg}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}
                    >
                      {SEVERITY_LABELS[warning.severity]}
                    </span>
                    <time
                      className="text-[10px] text-slate-500"
                      dateTime={warning.timestamp}
                    >
                      {new Date(warning.timestamp).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-200">
                    {formatGroupedMessage(warning)}
                  </p>
                </div>
                {hasDetails && (
                  <button
                    type="button"
                    onClick={() => toggleDetails(warning.groupKey)}
                    className="shrink-0 text-[10px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
                  >
                    {expanded ? "Hide technical details" : "View technical details"}
                  </button>
                )}
              </div>
              {hasDetails && expanded && (
                <pre className="mt-2 max-h-40 overflow-auto rounded border border-white/10 bg-black/30 p-2 text-[10px] leading-relaxed text-slate-400">
                  {warning.technicalDetails}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
