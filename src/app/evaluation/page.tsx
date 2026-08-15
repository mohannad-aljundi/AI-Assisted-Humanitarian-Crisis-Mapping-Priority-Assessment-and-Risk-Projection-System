import { evaluationMetricsService } from "@/services/evaluationMetricsService";
import { dashboardService } from "@/services/dashboardService";
import { EvaluationView } from "@/components/evaluation/EvaluationView";
import { logPerfRouteLoaded } from "@/lib/perfLogs";

export const dynamic = "force-dynamic";

export default async function EvaluationPage() {
  logPerfRouteLoaded("/evaluation");
  const [chartData, metrics] = await Promise.all([
    dashboardService.getChartSummaries(),
    evaluationMetricsService.getMetrics(),
  ]);

  return <EvaluationView chartData={chartData} metrics={metrics} />;
}
