import type { PersistedAnalysisView } from "@/types";
import { CrisisIcon } from "@/components/crisis/CrisisIcon";
import { LocationWithFlag } from "@/components/ui/CountryFlag";
import { formatLocationDisplay } from "@/lib/locationDisplay";
import { CrisisTypeBadge } from "@/components/ui/CrisisTypeBadge";
import { StatusBadge } from "@/components/ui/badges";
import { DashboardCard } from "@/components/ui/DashboardCard";

interface AnalysisSummaryCardProps {
  analysis: PersistedAnalysisView;
}

export function AnalysisSummaryCard({ analysis }: AnalysisSummaryCardProps) {
  const { report, priorityAssessment, reliabilityAssessment, crisis } = analysis;
  const primaryLocation =
    analysis.riskProjection?.location.name ?? analysis.locations[0]?.name ?? null;

  return (
    <DashboardCard className="border border-blue-500/20 bg-gradient-to-br from-slate-900/80 to-blue-950/30 p-6 shadow-[0_0_40px_rgba(59,130,246,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-400">
            Analysis Results
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white lg:text-3xl">
            {report.title}
          </h1>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Report Date</dt>
              <dd className="font-medium text-slate-200">
                {new Date(report.reportDate).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Source</dt>
              <dd className="font-medium text-slate-200">
                {report.source.name} ({report.source.type})
              </dd>
            </div>
            {primaryLocation && (
              <div>
                <dt className="text-slate-500">Location</dt>
                <dd className="font-medium text-slate-200">
                  <LocationWithFlag location={formatLocationDisplay(primaryLocation)} />
                </dd>
              </div>
            )}
            {crisis?.crisisType && (
              <div>
                <dt className="text-slate-500">Crisis Type</dt>
                <dd className="flex items-center gap-2 font-medium text-slate-200">
                  <CrisisIcon
                    crisisType={crisis.crisisType}
                    riskLevel={priorityAssessment?.priorityLevel ?? null}
                    size={18}
                  />
                  <CrisisTypeBadge crisisType={crisis.crisisType} />
                </dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500">Source Credibility</dt>
              <dd className="font-medium text-slate-200">
                {Math.round(report.source.credibilityScore * 100)}%
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Report ID</dt>
              <dd className="font-mono text-xs text-slate-400">{report.id}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge level={priorityAssessment.priorityLevel} />
          <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
            Reliability {Math.round(reliabilityAssessment.finalScore * 100)}%
          </span>
        </div>
      </div>
    </DashboardCard>
  );
}
