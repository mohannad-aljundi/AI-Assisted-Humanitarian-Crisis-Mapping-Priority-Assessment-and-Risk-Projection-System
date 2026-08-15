import type { PriorityLevel, RiskLevel } from "@prisma/client";

/** Academic dashboard palette — consistent across incident intelligence UI */
export const INCIDENT_COLORS = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", fill: "#ef4444" },
  high: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", fill: "#f97316" },
  medium: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", fill: "#eab308" },
  low: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", fill: "#22c55e" },
  info: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", fill: "#3b82f6" },
  verified: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-300", fill: "#10b981" },
  neutral: { bg: "bg-slate-800/50", border: "border-white/10", text: "text-slate-300", fill: "#64748b" },
} as const;

export function priorityPalette(level: PriorityLevel) {
  switch (level) {
    case "Critical": return INCIDENT_COLORS.critical;
    case "High": return INCIDENT_COLORS.high;
    case "Medium": return INCIDENT_COLORS.medium;
    default: return INCIDENT_COLORS.low;
  }
}

export function riskPalette(level: RiskLevel) {
  switch (level) {
    case "Critical": return INCIDENT_COLORS.critical;
    case "High": return INCIDENT_COLORS.high;
    case "Medium": return INCIDENT_COLORS.medium;
    default: return INCIDENT_COLORS.info;
  }
}

export function reliabilityPalette(score: number) {
  if (score >= 0.8) return INCIDENT_COLORS.verified;
  if (score >= 0.6) return INCIDENT_COLORS.info;
  if (score >= 0.4) return INCIDENT_COLORS.medium;
  return INCIDENT_COLORS.high;
}

export function starsFromScore(score: number): number {
  if (score >= 0.9) return 5;
  if (score >= 0.75) return 4;
  if (score >= 0.6) return 3;
  if (score >= 0.4) return 2;
  return 1;
}

export function renderStars(count: number): string {
  return "★".repeat(count) + "☆".repeat(5 - count);
}
