import { severityIconAccent } from "@/components/incidents/dashboard/incidentDashboardStyles";

interface HumanitarianNeedCardHeroProps {
  icon: string;
  severity: string;
  title: string;
  confidencePct: number;
  source?: string | null;
}

export function HumanitarianNeedCardHero({
  icon,
  severity,
  title,
  confidencePct,
  source,
}: HumanitarianNeedCardHeroProps) {
  const accent = severityIconAccent(severity);
  const sourceLabel =
    source === "Inferred" ? "Inferred" : source === "Observed" ? "Observed" : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center text-center">
      <div
        className={`relative flex h-32 w-32 shrink-0 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] ${accent.container}`}
      >
        <div
          className={`pointer-events-none absolute inset-4 rounded-2xl blur-2xl ${accent.glow}`}
          aria-hidden
        />
        <span
          className="relative select-none text-[4rem] leading-none drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
          role="img"
          aria-hidden
        >
          {icon}
        </span>
      </div>

      <h3 className="mt-6 max-w-full px-1 text-lg font-semibold leading-snug tracking-tight text-white">
        {title}
      </h3>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-90 ring-1 ${accent.badge}`}
        >
          {severity}
        </span>
        {sourceLabel ? (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-slate-500">
            {sourceLabel}
          </span>
        ) : null}
        <span className="text-[9px] font-medium tabular-nums text-slate-500">{confidencePct}%</span>
      </div>
    </div>
  );
}

export function HumanitarianNeedCardProgressFooter({
  barWidth,
  severity,
}: {
  barWidth: number;
  severity: string;
}) {
  const accent = severityIconAccent(severity);

  return (
    <footer className="mt-auto w-full shrink-0 border-t border-white/5 pt-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
        <div
          className={`h-full rounded-full transition-all duration-500 ${accent.bar}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </footer>
  );
}
