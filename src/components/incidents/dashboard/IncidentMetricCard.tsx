"use client";

import { Activity, AlertTriangle, ShieldCheck, Target } from "lucide-react";
import {
  dashboardCard,
  dashboardCardHover,
  levelToSeverityGradient,
  priorityBadgeClass,
  severityBarColor,
} from "@/components/incidents/dashboard/incidentDashboardStyles";

interface IncidentMetricCardProps {
  label: string;
  value: string;
  sub: string;
  level: string;
  badgeLabel?: string;
  scorePercent: number;
  confidenceLabel?: string;
  icon: React.ReactNode;
}

export function IncidentMetricCard({
  label,
  value,
  sub,
  level,
  badgeLabel,
  scorePercent,
  confidenceLabel,
  icon,
}: IncidentMetricCardProps) {
  return (
    <article
      className={`${dashboardCard} ${dashboardCardHover} flex h-full flex-col bg-gradient-to-br p-5 ${levelToSeverityGradient(level)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {label}
        </p>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-black/20 ring-1 ring-white/10 ${priorityBadgeClass(level as "Critical")}`}
          aria-hidden
        >
          {icon}
        </span>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-white lg:text-3xl">{value}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${priorityBadgeClass(level as "Critical")}`}
        >
          {badgeLabel ?? level}
        </span>
        <span className="text-xs text-slate-400">{sub}</span>
      </div>

      <footer className="mt-auto border-t border-white/5 pt-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-slate-500">{confidenceLabel ?? "Assessment score"}</span>
          <span className="font-semibold text-white">{Math.round(scorePercent)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/25">
          <div
            className={`h-full rounded-full transition-all duration-500 ${severityBarColor(level)}`}
            style={{ width: `${Math.min(100, Math.max(0, scorePercent))}%` }}
          />
        </div>
      </footer>
    </article>
  );
}

export const INCIDENT_METRIC_ICONS = {
  priority: <Target className="h-5 w-5" />,
  reliability: <ShieldCheck className="h-5 w-5" />,
  risk: <AlertTriangle className="h-5 w-5" />,
  impact: <Activity className="h-5 w-5" />,
};
