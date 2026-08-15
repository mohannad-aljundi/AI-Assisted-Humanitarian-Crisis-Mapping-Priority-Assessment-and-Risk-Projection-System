import type { RiskProjectionDetail } from "@/lib/incidentEnrichment";
import type { RiskTrajectoryTrend } from "@/types";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";
import { TrendChart } from "@/components/incidents/charts/IncidentCharts";

const TRAJECTORY_STYLES: Record<
  RiskTrajectoryTrend,
  { label: string; className: string }
> = {
  improving: { label: "Improving", className: "text-emerald-300" },
  stable: { label: "Stable", className: "text-amber-300" },
  worsening: { label: "Worsening", className: "text-orange-300" },
};

interface RiskProjectionAnalystPanelProps {
  projection: RiskProjectionDetail;
}

function ForecastTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`${dashboardCard} p-4 ${
        highlight ? "border-cyan-500/30 bg-cyan-500/10" : ""
      }`}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function ReasonCard({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div className={`${dashboardCard} border-white/10 p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
    </div>
  );
}

function BulletList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "risk" | "mitigate" | "uncertain" | "history";
}) {
  if (items.length === 0) return null;
  const border =
    tone === "risk"
      ? "border-orange-500/20 bg-orange-500/5"
      : tone === "mitigate"
        ? "border-emerald-500/20 bg-emerald-500/5"
        : tone === "history"
          ? "border-cyan-500/20 bg-cyan-500/5"
          : "border-slate-500/20 bg-slate-500/5";
  const heading =
    tone === "risk"
      ? "text-orange-300"
      : tone === "mitigate"
        ? "text-emerald-300"
        : tone === "history"
          ? "text-cyan-300"
          : "text-slate-400";

  return (
    <div className={`${dashboardCard} ${border} p-5`}>
      <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${heading}`}>
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-sm text-slate-300">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RiskProjectionAnalystPanel({
  projection,
}: RiskProjectionAnalystPanelProps) {
  const analytical = projection.analytical;
  const trajectory = analytical?.trend;
  const trajectoryStyle = trajectory ? TRAJECTORY_STYLES[trajectory] : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <ForecastTile label="Current Risk" value={projection.currentScore} highlight />
        <ForecastTile label="24h Forecast" value={projection.forecast24h} />
        <ForecastTile label="72h Forecast" value={projection.forecast72h} />
        <ForecastTile label="7 Day Forecast" value={projection.forecast7d} />
        <div className={`${dashboardCard} p-4`}>
          <p className="text-xs text-slate-500">Trend</p>
          <p
            className={`mt-1 text-xl font-bold ${
              trajectoryStyle?.className ?? "text-white"
            }`}
          >
            {trajectoryStyle?.label ?? projection.trend}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Confidence: {Math.round(projection.confidence * 100)}%
          </p>
        </div>
      </div>

      {(projection.trajectorySummary || analytical?.riskNarrative) && (
        <div className={`${dashboardCard} border-cyan-500/20 bg-cyan-500/5 p-5`}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
            Risk trajectory summary
          </p>
          <p className="text-sm leading-relaxed text-slate-200">
            {projection.trajectorySummary ?? analytical?.riskNarrative}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <BulletList
          title="Main risk drivers"
          items={analytical?.riskDrivers ?? projection.reasoning.slice(1, 4)}
          tone="risk"
        />
        <BulletList
          title="What could reduce risk"
          items={analytical?.riskMitigatingFactors ?? []}
          tone="mitigate"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BulletList
          title="What could make it worse"
          items={analytical?.uncertainties ?? []}
          tone="uncertain"
        />
        {analytical?.similarCasesInfluence && analytical.similarCasesInfluence.length > 0 ? (
          <BulletList
            title="Similar historical cases (CHLE)"
            items={analytical.similarCasesInfluence}
            tone="history"
          />
        ) : null}
      </div>

      {analytical ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ReasonCard title="Current risk" body={analytical.currentRiskReason} />
          <ReasonCard title="24-hour outlook" body={analytical.forecast24hReason} />
          <ReasonCard title="72-hour outlook" body={analytical.forecast72hReason} />
          <ReasonCard title="7-day outlook" body={analytical.forecast7dReason} />
        </div>
      ) : (
        <div className={`${dashboardCard} border-orange-500/20 bg-orange-500/5 p-5`}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-orange-300">
            Analyst reasoning
          </p>
          <ul className="space-y-1.5">
            {projection.reasoning.map((reason) => (
              <li key={reason} className="text-sm text-slate-300">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <TrendChart
        points={[
          { label: "Now", value: projection.currentScore },
          { label: "24h", value: projection.forecast24h },
          { label: "72h", value: projection.forecast72h },
          { label: "7d", value: projection.forecast7d },
        ]}
      />
    </div>
  );
}
