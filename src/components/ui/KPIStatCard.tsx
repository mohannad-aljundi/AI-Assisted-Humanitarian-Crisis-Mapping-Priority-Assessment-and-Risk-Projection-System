import { TrendingDown, TrendingUp } from "lucide-react";
import { Sparkline } from "./Sparkline";

type KPIAccent = "blue" | "red" | "orange" | "yellow" | "green" | "purple" | "neutral";

const accentBorders: Record<KPIAccent, string> = {
  blue: "border-l-blue-500",
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  yellow: "border-l-yellow-500",
  green: "border-l-green-500",
  purple: "border-l-purple-500",
  neutral: "border-l-slate-500",
};

const sparkColors: Record<KPIAccent, string> = {
  blue: "#3b82f6",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  purple: "#a855f7",
  neutral: "#64748b",
};

interface KPIStatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendPercent?: number | null;
  trendLabel?: string;
  sparkline?: number[];
  accent?: KPIAccent;
  icon?: React.ReactNode;
}

export function KPIStatCard({
  label,
  value,
  trend,
  trendPercent,
  trendLabel = "from last 7 days",
  sparkline,
  accent = "neutral",
  icon,
}: KPIStatCardProps) {
  const trendUp = trendPercent === null || trendPercent === undefined || trendPercent >= 0;
  const hasTrend = trendPercent !== null && trendPercent !== undefined;

  return (
    <article
      className={`enterprise-kpi-card border-l-[3px] ${accentBorders[accent]}`}
    >
      <div className="enterprise-kpi-card__header">
        <p className="enterprise-kpi-card__label">{label}</p>
        {icon ? <div className="text-slate-400">{icon}</div> : <span />}
      </div>

      <p className="enterprise-kpi-card__value">{value}</p>

      <div className="enterprise-kpi-card__footer">
        {hasTrend ? (
          <p
            className={`enterprise-kpi-card__trend ${
              trendUp ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {trendUp ? (
              <TrendingUp size={13} strokeWidth={1.75} aria-hidden />
            ) : (
              <TrendingDown size={13} strokeWidth={1.75} aria-hidden />
            )}
            <span>
              {Math.abs(trendPercent)}% {trendLabel}
            </span>
          </p>
        ) : trend ? (
          <p className="enterprise-kpi-card__meta">{trend}</p>
        ) : (
          <p className="enterprise-kpi-card__meta">Based on persisted records</p>
        )}

        <div className="enterprise-kpi-card__sparkline">
          {sparkline ? (
            <Sparkline points={sparkline} color={sparkColors[accent]} />
          ) : null}
        </div>
      </div>
    </article>
  );
}
