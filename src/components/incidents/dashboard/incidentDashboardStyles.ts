import type { PriorityLevel } from "@prisma/client";

export const dashboardCard =
  "rounded-[22px] border border-white/[0.08] bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl transition duration-300";

export const dashboardCardHover =
  "hover:border-white/15 hover:shadow-[0_16px_48px_rgba(0,0,0,0.55)] hover:-translate-y-0.5";

export function severityGradient(severity: string): string {
  switch (severity) {
    case "Critical":
      return "from-red-950/80 via-red-900/40 to-slate-950/90 border-red-500/25";
    case "High":
      return "from-orange-950/70 via-orange-900/35 to-slate-950/90 border-orange-500/25";
    case "Medium":
      return "from-amber-950/60 via-amber-900/25 to-slate-950/90 border-amber-500/20";
    default:
      return "from-emerald-950/60 via-emerald-900/25 to-slate-950/90 border-emerald-500/20";
  }
}

export function levelToSeverityGradient(level: string): string {
  return severityGradient(
    level === "Critical" || level === "High" || level === "Medium" || level === "Low"
      ? level
      : "Low"
  );
}

export function severityBarColor(severity: string): string {
  switch (severity) {
    case "Critical":
      return "bg-gradient-to-r from-red-500 to-rose-400";
    case "High":
      return "bg-gradient-to-r from-orange-500 to-amber-400";
    case "Medium":
      return "bg-gradient-to-r from-amber-500 to-yellow-400";
    default:
      return "bg-gradient-to-r from-emerald-500 to-teal-400";
  }
}

export function severityIconAccent(severity: string): {
  glow: string;
  container: string;
  badge: string;
  bar: string;
} {
  switch (severity) {
    case "Critical":
      return {
        glow: "bg-red-500/30",
        container: "shadow-[0_0_48px_rgba(239,68,68,0.22)]",
        badge: "bg-red-500/15 text-red-200/90 ring-red-500/25",
        bar: severityBarColor(severity),
      };
    case "High":
      return {
        glow: "bg-orange-500/28",
        container: "shadow-[0_0_48px_rgba(249,115,22,0.2)]",
        badge: "bg-orange-500/15 text-orange-200/90 ring-orange-500/25",
        bar: severityBarColor(severity),
      };
    case "Medium":
      return {
        glow: "bg-amber-500/25",
        container: "shadow-[0_0_44px_rgba(245,158,11,0.18)]",
        badge: "bg-amber-500/15 text-amber-200/90 ring-amber-500/25",
        bar: severityBarColor(severity),
      };
    default:
      return {
        glow: "bg-emerald-500/22",
        container: "shadow-[0_0_44px_rgba(16,185,129,0.18)]",
        badge: "bg-emerald-500/15 text-emerald-200/90 ring-emerald-500/25",
        bar: severityBarColor(severity),
      };
  }
}

export function priorityBadgeClass(level: PriorityLevel): string {
  switch (level) {
    case "Critical":
      return "bg-red-500/20 text-red-200 ring-red-500/40";
    case "High":
      return "bg-orange-500/20 text-orange-200 ring-orange-500/40";
    case "Medium":
      return "bg-amber-500/20 text-amber-200 ring-amber-500/40";
    default:
      return "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40";
  }
}

export function kpiAccent(level: string): {
  ring: string;
  glow: string;
  text: string;
} {
  switch (level) {
    case "Critical":
      return {
        ring: "ring-red-500/30",
        glow: "shadow-[0_0_32px_rgba(239,68,68,0.15)]",
        text: "text-red-300",
      };
    case "High":
      return {
        ring: "ring-orange-500/30",
        glow: "shadow-[0_0_32px_rgba(249,115,22,0.15)]",
        text: "text-orange-300",
      };
    case "Medium":
      return {
        ring: "ring-amber-500/25",
        glow: "shadow-[0_0_32px_rgba(245,158,11,0.12)]",
        text: "text-amber-300",
      };
    default:
      return {
        ring: "ring-emerald-500/25",
        glow: "shadow-[0_0_32px_rgba(16,185,129,0.12)]",
        text: "text-emerald-300",
      };
  }
}

export function evidenceChipClass(importance: "high" | "medium" | "low"): string {
  switch (importance) {
    case "high":
      return "border-red-500/35 bg-red-500/10 text-red-100";
    case "medium":
      return "border-blue-500/30 bg-blue-500/10 text-blue-100";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}
