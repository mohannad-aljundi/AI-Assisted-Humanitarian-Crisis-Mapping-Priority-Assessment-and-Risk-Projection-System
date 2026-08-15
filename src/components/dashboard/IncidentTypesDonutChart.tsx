import type { CrisisTypeDistributionItem } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";
import { getCrisisTypeColor } from "@/lib/crisisTypeColors";

interface IncidentTypesDonutChartProps {
  data: CrisisTypeDistributionItem[];
}

export function IncidentTypesDonutChart({ data }: IncidentTypesDonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const segments = buildSegments(data, total);

  return (
    <SectionCard title="Incident Types" description="This Week">
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No incident data yet.</p>
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="relative h-36 w-36 shrink-0">
            <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
              <circle
                cx="21"
                cy="21"
                r="15.9155"
                fill="transparent"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="4"
              />
              {segments.map((segment) => (
                <circle
                  key={segment.label}
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="transparent"
                  stroke={segment.color}
                  strokeWidth="4"
                  strokeDasharray={`${segment.percent} ${100 - segment.percent}`}
                  strokeDashoffset={segment.offset}
                  strokeLinecap="butt"
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{total}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                Total
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            {segments.map((segment) => (
              <div key={segment.label} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className="truncate text-slate-300">{segment.label}</span>
                </div>
                <span className="shrink-0 text-slate-500">
                  {Math.round((segment.count / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function buildSegments(data: CrisisTypeDistributionItem[], total: number) {
  let offset = 25;
  return data.map((item) => {
    const percent = total > 0 ? (item.count / total) * 100 : 0;
    const segment = {
      ...item,
      color: item.color || getCrisisTypeColor(item.label),
      percent,
      offset,
    };
    offset -= percent;
    return segment;
  });
}
