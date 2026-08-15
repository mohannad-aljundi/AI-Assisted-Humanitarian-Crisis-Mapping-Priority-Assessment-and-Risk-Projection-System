import type { PriorityLevel, RiskLevel } from "@prisma/client";

export type BadgeTone = "critical" | "high" | "medium" | "low" | "info" | "neutral";

const toneStyles: Record<BadgeTone, string> = {
  critical: "border-red-500/30 bg-red-500/15 text-red-300",
  high: "border-orange-500/30 bg-orange-500/15 text-orange-300",
  medium: "border-yellow-500/30 bg-yellow-500/15 text-yellow-300",
  low: "border-green-500/30 bg-green-500/15 text-green-300",
  info: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  neutral: "border-white/10 bg-white/5 text-slate-300",
};

export function priorityTone(level: string): BadgeTone {
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

export function riskTone(level: string): BadgeTone {
  return priorityTone(level);
}

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

function Badge({ children, tone = "neutral", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${toneStyles[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  level,
  children,
}: {
  level: PriorityLevel | string;
  children?: React.ReactNode;
}) {
  return <Badge tone={priorityTone(level)}>{children ?? level}</Badge>;
}

export function RiskBadge({
  level,
  children,
  className,
}: {
  level: RiskLevel | string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge tone={riskTone(level)} className={className}>
      {children ?? level}
    </Badge>
  );
}

export function InfoBadge({ children }: { children: React.ReactNode }) {
  return <Badge tone="info">{children}</Badge>;
}
