import { PanelCard } from "./shared";

interface RecommendedActionsPanelProps {
  actions: string[];
}

export function RecommendedActionsPanel({ actions }: RecommendedActionsPanelProps) {
  return (
    <PanelCard title="Recommended Actions" className="lg:col-span-2">
      {actions.length === 0 ? (
        <p className="text-sm text-slate-500">
          No specific actions generated for this analysis.
        </p>
      ) : (
        <ol className="space-y-3">
          {actions.map((action, index) => (
            <li
              key={`${index}-${action.slice(0, 24)}`}
              className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-sm text-slate-300"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/80 text-xs font-semibold text-white">
                {index + 1}
              </span>
              <span>{action}</span>
            </li>
          ))}
        </ol>
      )}
    </PanelCard>
  );
}
