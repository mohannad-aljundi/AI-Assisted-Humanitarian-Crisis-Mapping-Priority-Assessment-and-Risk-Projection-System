interface ScoreBarProps {
  label: string;
  value: number;
  max?: number;
  tone?: "low" | "medium" | "high" | "critical" | "blue" | "orange";
  showPercent?: boolean;
}

const TONE_COLORS = {
  low: "bg-blue-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-600",
  blue: "bg-cyan-500",
  orange: "bg-orange-500",
};

export function ScoreBar({
  label,
  value,
  max = 1,
  tone = "blue",
  showPercent = true,
}: ScoreBarProps) {
  const percent = Math.round((value / max) * 100);
  const width = Math.min(100, Math.max(0, percent));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-200">
          {showPercent ? `${percent}%` : value.toLocaleString()}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${TONE_COLORS[tone]}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
