import type { CrisisTypeDistributionItem } from "@/types";
import { CountryName } from "@/components/ui/CountryFlag";
import { SectionCard } from "@/components/ui/SectionCard";

interface CountryDistributionChartProps {
  data: CrisisTypeDistributionItem[];
}

export function CountryDistributionChart({ data }: CountryDistributionChartProps) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <SectionCard title="Incidents by Country" description="Geographic distribution">
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">No country data available.</p>
      ) : (
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-300">
                  <CountryName country={item.label} />
                </span>
                <span className="text-slate-500">{item.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-700"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
