import type { RiskProjectionResult } from "@/types";
import { formatLocationDisplay } from "@/lib/locationDisplay";
import { LocationWithFlag } from "@/components/ui/CountryFlag";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { LevelBadge, levelTone, PanelCard } from "./shared";

interface RiskProjectionPanelProps {
  risk: RiskProjectionResult;
  locationName?: string;
}

function resolveProjections(risk: RiskProjectionResult) {
  if (risk.horizons && risk.horizons.length >= 4) {
    return [
      { label: "Current Risk", value: risk.horizons[0]!.score, highlight: true },
      { label: "24 Hour", value: risk.horizons[1]!.score, highlight: false },
      { label: "72 Hour", value: risk.horizons[2]!.score, highlight: false },
      { label: "7 Day", value: risk.horizons[3]!.score, highlight: false },
    ];
  }

  const current = risk.currentScore ?? RISK_SCORES[risk.riskLevel];
  return [
    { label: "Current Risk", value: current, highlight: true },
    { label: "24 Hour", value: projectRisk(current, risk.trend, 24), highlight: false },
    { label: "72 Hour", value: projectRisk(current, risk.trend, 72), highlight: false },
    { label: "7 Day", value: projectRisk(current, risk.trend, 168), highlight: false },
  ];
}

const RISK_SCORES = { Low: 22, Medium: 42, High: 68, Critical: 88 };

function projectRisk(
  current: number,
  trend: RiskProjectionResult["trend"],
  hours: number
): number {
  const factor = trend === "Increasing" ? 1.08 : trend === "Decreasing" ? 0.94 : 1;
  const multiplier = Math.pow(factor, hours / 24);
  return Math.min(100, Math.max(0, Math.round(current * multiplier)));
}

const TREND_ICONS = {
  Increasing: "↑",
  Stable: "→",
  Decreasing: "↓",
};

export function RiskProjectionPanel({
  risk,
  locationName,
}: RiskProjectionPanelProps) {
  const projections = resolveProjections(risk);

  return (
    <PanelCard title="Risk Projection">
      <div className="mb-4 flex items-center justify-between">
        <LevelBadge tone={levelTone(risk.riskLevel)}>{risk.riskLevel}</LevelBadge>
        <span className="text-sm text-slate-400">
          Trend: {TREND_ICONS[risk.trend]} {risk.trend}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {projections.map((p) => (
          <div
            key={p.label}
            className={`rounded-xl border p-3 ${
              p.highlight
                ? "border-cyan-500/30 bg-cyan-500/10"
                : "border-white/5 bg-white/[0.03]"
            }`}
          >
            <p className="text-xs text-slate-500">{p.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{p.value}</p>
            <ScoreBar
              label=""
              value={p.value / 100}
              tone={
                p.value >= 75 ? "critical" : p.value >= 55 ? "high" : p.value >= 35 ? "medium" : "low"
              }
            />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <ScoreBar
          label="Projection Confidence"
          value={risk.confidenceScore}
          tone="blue"
        />
      </div>

      {locationName && (
        <p className="mt-4 text-sm text-slate-500">
          Projected for:{" "}
          <span className="font-medium text-slate-300">
            <LocationWithFlag location={formatLocationDisplay(locationName)} />
          </span>
        </p>
      )}
    </PanelCard>
  );
}
