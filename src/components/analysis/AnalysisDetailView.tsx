import Link from "next/link";
import type { PersistedAnalysisView } from "@/types";
import { buildNlpViewReadOnly } from "@/lib/analysisView";
import { buildHumanitarianNeedsReadOnly, buildRiskProjectionReadOnly } from "@/lib/incidentEnrichment";
import { RiskProjectionAnalystPanel } from "@/components/incidents/RiskProjectionAnalystPanel";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { btnGhost, pageContainer } from "@/lib/uiClasses";
import { AiIntelligencePanel } from "@/components/intelligence/AiIntelligencePanel";
import { AiInsightsPanel } from "@/components/analysis/AiInsightsPanel";
import { AnalysisSummaryCard } from "@/components/analysis/AnalysisSummaryCard";
import { DecisionExplainabilityPanel } from "@/components/analysis/DecisionExplainabilityPanel";
import { ExtractedInformationPanel } from "@/components/analysis/ExtractedInformationPanel";
import { DisasterSeverityPanel } from "@/components/analysis/DisasterSeverityPanel";
import { HumanitarianMetricsPanel } from "@/components/analysis/HumanitarianMetricsPanel";
import { PriorityAssessmentPanel } from "@/components/analysis/PriorityAssessmentPanel";
import { RecommendedActionsPanel } from "@/components/analysis/RecommendedActionsPanel";
import { ReliabilityAssessmentPanel } from "@/components/analysis/ReliabilityAssessmentPanel";

interface AnalysisDetailViewProps {
  analysis: PersistedAnalysisView;
}

export function AnalysisDetailView({ analysis }: AnalysisDetailViewProps) {
  const nlp =
    analysis.nlp ??
    buildNlpViewReadOnly(analysis.extractedEntities, analysis.crisis);
  const humanitarianNeedsView = buildHumanitarianNeedsReadOnly(nlp);
  const riskProjection = buildRiskProjectionReadOnly(analysis, analysis.insight ?? null);

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopBar title="Analysis Results" />
      <div className={`app-page-content ${pageContainer} space-y-5`}>
        <div className="flex flex-wrap justify-between gap-3">
          <Link href={`/incidents/${analysis.report.id}`} className={btnGhost}>
            Open Incident Intelligence →
          </Link>
          <Link href="/analysis" className={btnGhost}>
            ← Back to Analysis List
          </Link>
        </div>

        <AnalysisSummaryCard analysis={analysis} />

        {analysis.insight && <AiInsightsPanel insight={analysis.insight} />}
        {analysis.insight && (
          <DisasterSeverityPanel assessment={analysis.insight.disasterSeverity ?? null} />
        )}
        <AiIntelligencePanel
          insight={analysis.insight}
          nlp={nlp}
          humanitarianNeeds={humanitarianNeedsView.all}
        />

        <div className="grid gap-5 lg:grid-cols-2">
          <ExtractedInformationPanel nlp={nlp} />
          <HumanitarianMetricsPanel nlp={nlp} needs={humanitarianNeedsView.all} />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <PriorityAssessmentPanel
            assessment={analysis.priorityAssessment}
            reasons={analysis.insight?.priorityExplanation.reasons}
            riskLevel={analysis.riskProjection?.riskLevel}
            insight={analysis.insight}
            reliabilityAssessment={analysis.reliabilityAssessment}
          />
          <ReliabilityAssessmentPanel
            assessment={analysis.reliabilityAssessment}
            insight={analysis.insight}
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6">
          <h2 className="mb-1 text-lg font-semibold text-white">Risk Projection</h2>
          <p className="mb-5 text-sm text-slate-400">
            Evidence-based temporal forecast and analyst reasoning
          </p>
          <RiskProjectionAnalystPanel projection={riskProjection} />
        </div>

        <RecommendedActionsPanel actions={analysis.recommendedActions} />

        {analysis.insight && (
          <DecisionExplainabilityPanel insight={analysis.insight} />
        )}
      </div>
    </div>
  );
}
