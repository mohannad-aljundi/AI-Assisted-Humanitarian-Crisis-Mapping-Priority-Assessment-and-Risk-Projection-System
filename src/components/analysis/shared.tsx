export {
  InfoBadge,
  RiskBadge,
  StatusBadge,
  priorityTone,
  riskTone,
} from "@/components/ui/badges";
export type { BadgeTone } from "@/components/ui/badges";

import type { BadgeTone } from "@/components/ui/badges";

const toneStyles: Record<BadgeTone, string> = {
  critical: "border-red-500/30 bg-red-500/15 text-red-300",
  high: "border-orange-500/30 bg-orange-500/15 text-orange-300",
  medium: "border-yellow-500/30 bg-yellow-500/15 text-yellow-300",
  low: "border-green-500/30 bg-green-500/15 text-green-300",
  info: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  neutral: "border-white/10 bg-white/5 text-slate-300",
};

export type LevelTone = BadgeTone;

export function levelTone(level: string): LevelTone {
  switch (level) {
    case "Critical":
      return "critical";
    case "High":
      return "high";
    case "Medium":
      return "medium";
    case "Low":
      return "low";
    default:
      return "neutral";
  }
}

export function LevelBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: LevelTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${toneStyles[tone]}`}
    >
      {children}
    </span>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const percentage = Math.round(value * 100);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-200">{percentage}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/5">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function PanelCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`rounded-2xl border border-white/10 bg-slate-900/55 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl ${className}`}
    >
      <h3 className="mb-4 text-base font-semibold text-white">{title}</h3>
      {children}
    </article>
  );
}
