import type { DistributionItem, EvaluationMetrics } from "@/types";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { pageContainer } from "@/lib/uiClasses";
import { PriorityChart, RiskChart } from "@/components/dashboard/PriorityChart";
import { EvaluationReportsPanel } from "@/components/evaluation/EvaluationReportsPanel";

interface EvaluationViewProps {
  chartData: {
    priorityDistribution: DistributionItem[];
    riskDistribution: DistributionItem[];
  };
  metrics: EvaluationMetrics;
}

export function EvaluationView({ chartData, metrics }: EvaluationViewProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppTopBar title="Evaluation" showAddReport={false} />
      <div className={`app-page-content ${pageContainer} space-y-6`}>

        <SectionCard
          title="Location Extraction Accuracy"
          description="Percentage of analysed reports with validated geocoded locations"
        >
          <MetricDisplay value={metrics.locationExtractionAccuracy} label="extraction rate" />
        </SectionCard>

        <SectionCard
          title="Need Classification Accuracy"
          description="Percentage of reports with humanitarian needs successfully classified"
        >
          <MetricDisplay value={metrics.needClassificationAccuracy} label="classification rate" />
        </SectionCard>

        <SectionCard
          title="Priority Classification Accuracy"
          description="Percentage of reports with priority assessments assigned"
        >
          <MetricDisplay value={metrics.priorityClassificationAccuracy} label="classification rate" />
        </SectionCard>

        <SectionCard
          title="Risk Projection Accuracy"
          description="Coverage of risk projections across analysed crisis locations"
        >
          <MetricDisplay value={metrics.riskProjectionAccuracy} label="projection coverage" />
        </SectionCard>

        <SectionCard
          title="Source Agreement Metrics"
          description="Multi-source verification consensus across corroborated incidents"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Average Consensus Score
              </p>
              <p className="mt-2 text-3xl font-bold text-white">
                {metrics.sourceAgreementPercent}%
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Verified Incident Groups
              </p>
              <p className="mt-2 text-3xl font-bold text-white">
                {metrics.sourceAgreementCount}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="System Performance Metrics"
          description="Operational throughput and pipeline reliability"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PerfTile label="Reports Processed" value={String(metrics.systemPerformance.reportsProcessed)} />
            <PerfTile label="Active Crises" value={String(metrics.systemPerformance.activeCrises)} />
            <PerfTile label="Avg. Reliability" value={`${metrics.systemPerformance.averageReliability}%`} />
            <PerfTile label="Ingestion Success" value={`${metrics.systemPerformance.ingestionSuccessRate}%`} />
          </div>
        </SectionCard>

        <section className="grid gap-6 lg:grid-cols-2">
          <PriorityChart data={chartData.priorityDistribution} />
          <RiskChart data={chartData.riskDistribution} />
        </section>

        <EvaluationReportsPanel />
      </div>
    </div>
  );
}

function MetricDisplay({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-end gap-4">
      <p className="text-4xl font-bold text-white">{value}%</p>
      <div className="flex-1 pb-1">
        <ScoreBar
          label={label}
          value={value / 100}
          tone={value >= 75 ? "low" : value >= 50 ? "medium" : "high"}
        />
      </div>
    </div>
  );
}

function PerfTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
