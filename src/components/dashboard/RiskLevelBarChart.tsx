import type { DistributionItem } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";

const barColors: Record<DistributionItem["tone"], string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

const order = ["Critical", "High", "Medium", "Low"];

interface RiskLevelBarChartProps {
  data: DistributionItem[];
}

export function RiskLevelBarChart({ data }: RiskLevelBarChartProps) {
  const sorted = order
    .map((label) => data.find((item) => item.label === label))
    .filter((item): item is DistributionItem => item !== undefined);
  const maxCount = Math.max(...sorted.map((item) => item.count), 1);

  return (
    <SectionCard title="Risk Level Distribution" description="Current incidents">
      <div className="flex h-48 items-end justify-between gap-3 px-2 pt-4">
        {sorted.map((item) => (
          <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-sm font-semibold text-white">{item.count}</span>
            <div className="flex h-32 w-full items-end justify-center">
              <div
                className="w-full max-w-[52px] rounded-t-lg transition-all"
                style={{
                  height: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0)}%`,
                  backgroundColor: barColors[item.tone],
                  boxShadow: `0 0 20px ${barColors[item.tone]}44`,
                }}
              />
            </div>
            <span className="text-xs text-slate-400">{item.label}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
