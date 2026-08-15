import type { ResearchAnalytics } from "@/types";
import { CountryName } from "@/components/ui/CountryFlag";
import { SectionCard } from "@/components/ui/SectionCard";

interface ResearchAnalyticsPanelProps {
  analytics: ResearchAnalytics;
}

export function ResearchAnalyticsPanel({ analytics }: ResearchAnalyticsPanelProps) {
  return (
    <SectionCard
      title="Research Analytics"
      description="Multi-source verification metrics for dissertation evaluation and novelty assessment."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Total Sources Analysed"
          value={analytics.totalSourcesAnalysed.toLocaleString()}
        />
        <MetricCard
          label="Average Source Agreement"
          value={`${Math.round(analytics.averageSourceAgreement)}%`}
        />
        <MetricCard
          label="Most Verified Crisis"
          value={analytics.mostVerifiedCrisis ?? "Pending verification"}
        />
        <MetricCard
          label="Highest Reliability Incident"
          value={
            analytics.highestReliabilityIncident
              ? `${Math.round(analytics.highestReliabilityIncident.score * 100)}% · ${analytics.highestReliabilityIncident.title.slice(0, 40)}${analytics.highestReliabilityIncident.title.length > 40 ? "…" : ""}`
              : "No data yet"
          }
        />
      </div>

      {analytics.topCountries.length > 0 && (
        <div className="mt-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Countries With Most Verified Incidents
          </p>
          <div className="space-y-2">
            {analytics.topCountries.map((entry) => (
              <div
                key={entry.country}
                className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm"
              >
                <span className="text-slate-200">
                  <CountryName country={entry.country} />
                </span>
                <span className="font-semibold text-white">{entry.incidentCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-snug text-white">{value}</p>
    </div>
  );
}
