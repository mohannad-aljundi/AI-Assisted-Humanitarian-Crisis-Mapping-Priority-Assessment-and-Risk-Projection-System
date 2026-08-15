import type { DistributionItem } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";

const TONE_COLORS: Record<DistributionItem["tone"], string> = {
  low: "bg-emerald-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

interface ReliabilityDistributionChartProps {
  data: DistributionItem[];
}

export function ReliabilityDistributionChart({
  data,
}: ReliabilityDistributionChartProps) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <SectionCard title="Reliability Distribution" description="Report confidence bands">
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-300">{item.label}</span>
              <span className="text-slate-500">{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-700 ${TONE_COLORS[item.tone]}`}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
