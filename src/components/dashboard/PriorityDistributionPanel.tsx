import type { DistributionItem } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";

interface PriorityDistributionPanelProps {
  data: DistributionItem[];
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#2563eb",
};

export function PriorityDistributionPanel({ data }: PriorityDistributionPanelProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0) || 1;

  return (
    <SectionCard
      title="Priority Distribution"
      description="Incident priority classification across analysed reports"
      className="h-full"
      fill
    >
      <div className="space-y-3">
        {data.map((item) => {
          const pct = Math.round((item.count / total) * 100);
          const color = PRIORITY_COLORS[item.label] ?? "#64748b";
          return (
            <div key={item.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-300">{item.label}</span>
                <span className="text-slate-500">
                  {item.count} ({pct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
