import type { IngestionSourceInfo, IngestionSourceStatus } from "@/types";

const STATUS_STYLES: Record<
  IngestionSourceStatus,
  { label: string; badge: string; dot: string }
> = {
  available: {
    label: "Active",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  requires_api_key: {
    label: "Requires API key",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-400",
  },
  rate_limited: {
    label: "Connected",
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-200",
    dot: "bg-orange-400",
  },
  disabled: {
    label: "Disabled",
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-400",
    dot: "bg-slate-500",
  },
};

interface SourceStatusGridProps {
  sources: IngestionSourceInfo[];
}

export function SourceStatusGrid({ sources = [] }: SourceStatusGridProps) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No operational data sources are configured yet.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {sources.map((source) => {
        const style = STATUS_STYLES[source.status];
        return (
          <div
            key={source.id}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-white">{source.name}</p>
                <p className="mt-1 text-xs text-slate-500">{source.statusMessage}</p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${style.badge}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                {style.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
