import { SectionCard } from "@/components/ui/SectionCard";

interface RiskProjectionLineChartProps {
  points: number[];
}

export function RiskProjectionLineChart({ points }: RiskProjectionLineChartProps) {
  const normalized = points.length > 0 ? points : [30, 35, 40, 45, 50, 55, 60];
  const max = 100;
  const min = 0;
  const coords = normalized.map((value, index) => {
    const x = (index / (normalized.length - 1)) * 100;
    const y = 100 - ((value - min) / (max - min)) * 100;
    return `${x},${y}`;
  });
  const polyline = coords.join(" ");

  return (
    <SectionCard title="Risk Projection" description="Next 7 Days">
      <div>
        <svg viewBox="0 0 100 100" className="h-44 w-full" preserveAspectRatio="none">
          {[25, 50, 75].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="rgba(255,255,255,0.05)"
            />
          ))}
          <polyline
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            points={polyline}
          />
          {coords.map((point, index) => {
            const [x, y] = point.split(",").map(Number);
            return <circle key={index} cx={x} cy={y} r="2.5" fill="#ef4444" />;
          })}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>Day 1</span>
          <span>Day 4</span>
          <span>Day 7</span>
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">Overall Risk Score</p>
      </div>
    </SectionCard>
  );
}
