import type { DistributionItem } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";

const barColors: Record<DistributionItem["tone"], string> = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

export function PriorityChart({ data }: { data: DistributionItem[] }) {
  const maxCount = Math.max(...data.map((item) => item.count), 1);

  return (
    <SectionCard title="Priority Distribution" description="Incident priority breakdown.">
      <div className="space-y-4">
        {data.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-300">{item.label}</span>
              <span className="text-slate-500">{item.count}</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/5">
              <div
                className={`h-2.5 rounded-full ${barColors[item.tone]}`}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function RiskChart({ data }: { data: DistributionItem[] }) {
  const maxCount = Math.max(...data.map((item) => item.count), 1);

  return (
    <SectionCard title="Risk Distribution" description="Projected risk level breakdown.">
      <div className="space-y-4">
        {data.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-300">{item.label}</span>
              <span className="text-slate-500">{item.count}</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/5">
              <div
                className={`h-2.5 rounded-full ${barColors[item.tone]}`}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
