"use client";

import dynamic from "next/dynamic";
import type { IncidentIntelligenceData } from "@/services/incidentService";
import { EvidenceVerificationCard } from "@/components/incidents/EvidenceVerificationCard";
import { MasterIncidentCorrelationPanel } from "@/components/incidents/MasterIncidentCorrelationPanel";
import { MasterIncidentIntelligencePanel } from "@/components/incidents/MasterIncidentIntelligencePanel";
import { hasSafeCoordinates } from "@/lib/coordinates";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";
import { RiskProjectionAnalystPanel } from "@/components/incidents/RiskProjectionAnalystPanel";
import { SectionSkeleton } from "@/components/incidents/IncidentSectionSkeletons";
import { reliabilityPalette, renderStars } from "@/lib/incidentPalette";
import { getCrisisTypeColor } from "@/lib/crisisTypeColors";
import { LocationWithFlag } from "@/components/ui/CountryFlag";
import type { ExtendedAnalysisInsight } from "@/types";

const HumanitarianNeedsSection = dynamic(
  () =>
    import("@/components/incidents/dashboard/HumanitarianNeedsSection").then(
      (m) => m.HumanitarianNeedsSection
    ),
  { loading: () => <SectionSkeleton className="h-72" /> }
);

const EvidenceChipRow = dynamic(
  () =>
    import("@/components/incidents/dashboard/EvidenceChipRow").then(
      (m) => m.EvidenceChipRow
    ),
  { loading: () => <SectionSkeleton className="h-24" /> }
);

const IncidentReasoningPanel = dynamic(
  () =>
    import("@/components/incidents/dashboard/IncidentReasoningPanel").then(
      (m) => m.IncidentReasoningPanel
    ),
  { loading: () => <SectionSkeleton className="h-96" /> }
);

const DisasterSeverityPanel = dynamic(
  () =>
    import("@/components/analysis/DisasterSeverityPanel").then(
      (m) => m.DisasterSeverityPanel
    ),
  { loading: () => <SectionSkeleton className="h-40" /> }
);

const AcademicTransparencyPanel = dynamic(
  () =>
    import("@/components/intelligence/AcademicTransparencyPanel").then(
      (m) => m.AcademicTransparencyPanel
    ),
  { loading: () => <SectionSkeleton className="h-48" /> }
);

const SimilarIncidentsPanel = dynamic(
  () =>
    import("@/components/learning/SimilarIncidentsPanel").then(
      (m) => m.SimilarIncidentsPanel
    ),
  { loading: () => <SectionSkeleton className="h-56" /> }
);

const AnalystFeedbackPanel = dynamic(
  () =>
    import("@/components/learning/AnalystFeedbackPanel").then(
      (m) => m.AnalystFeedbackPanel
    ),
  { loading: () => <SectionSkeleton className="h-64" /> }
);

const GaugeChart = dynamic(
  () => import("@/components/incidents/charts/IncidentCharts").then((m) => m.GaugeChart),
  { loading: () => <SectionSkeleton className="h-40 w-40" /> }
);

const InteractiveMapPanel = dynamic(
  () =>
    import("@/components/crisis-map/InteractiveMapPanel").then(
      (m) => m.InteractiveMapPanel
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] animate-pulse rounded-[22px] bg-slate-900/80" />
    ),
  }
);

const DecisionExplainabilityPanel = dynamic(
  () =>
    import("@/components/analysis/DecisionExplainabilityPanel").then(
      (m) => m.DecisionExplainabilityPanel
    ),
  { loading: () => <SectionSkeleton className="h-64" /> }
);

const AiInsightsPanel = dynamic(
  () => import("@/components/analysis/AiInsightsPanel").then((m) => m.AiInsightsPanel),
  { loading: () => <SectionSkeleton className="h-48" /> }
);

const PriorityAssessmentPanel = dynamic(
  () =>
    import("@/components/analysis/PriorityAssessmentPanel").then(
      (m) => m.PriorityAssessmentPanel
    ),
  { loading: () => <SectionSkeleton className="h-48" /> }
);

const ReliabilityAssessmentPanel = dynamic(
  () =>
    import("@/components/analysis/ReliabilityAssessmentPanel").then(
      (m) => m.ReliabilityAssessmentPanel
    ),
  { loading: () => <SectionSkeleton className="h-48" /> }
);

const ExtractedInformationPanel = dynamic(
  () =>
    import("@/components/analysis/ExtractedInformationPanel").then(
      (m) => m.ExtractedInformationPanel
    ),
  { loading: () => <SectionSkeleton className="h-64" /> }
);

interface IncidentIntelligenceReportBodyProps {
  data: IncidentIntelligenceData;
  insight: ExtendedAnalysisInsight | null | undefined;
  timeline: IncidentIntelligenceData["timeline"];
  transparency: IncidentIntelligenceData["transparency"];
  deferredLoading: boolean;
}

export function IncidentIntelligenceReportBody({
  data,
  insight,
  timeline,
  transparency,
  deferredLoading,
}: IncidentIntelligenceReportBodyProps) {
  const { analysis } = data;
  const reliabilityStyle = reliabilityPalette(data.assessmentOverview.reliability);

  return (
    <div className="space-y-10">
      <IncidentSection
        number="01"
        title="Executive Summary"
        description="Structured briefing from verified source evidence"
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.executiveSummary.map((item) => (
            <li key={item.label} className={`${dashboardCard} px-5 py-4`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-200">{item.value}</p>
            </li>
          ))}
        </ul>
      </IncidentSection>

      <IncidentSection
        number="02"
        title="Initial Evaluation"
        description="Explainable priority, reliability, and humanitarian risk assessment"
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <PriorityAssessmentPanel
            assessment={analysis.priorityAssessment}
            reasons={insight?.priorityExplanation.reasons}
            riskLevel={analysis.riskProjection?.riskLevel}
            insight={insight}
            reliabilityAssessment={analysis.reliabilityAssessment}
          />
          <div className="space-y-6">
            <ReliabilityAssessmentPanel
              assessment={analysis.reliabilityAssessment}
              insight={insight}
            />
            {insight?.disasterSeverity ? (
              <DisasterSeverityPanel assessment={insight.disasterSeverity} />
            ) : (
              <ExtractedInformationPanel nlp={data.nlp} />
            )}
          </div>
        </div>
      </IncidentSection>

      <IncidentSection
        number="03"
        title="Humanitarian Needs"
        description="All detected requirements — select a card for evidence and AI interpretation"
      >
        <HumanitarianNeedsSection view={data.humanitarianNeedsView} />
      </IncidentSection>

      <IncidentSection
        number="04"
        title="AI Interpretation"
        description="Extended NLP analysis, decision rationale, and explainability"
      >
        <div className="space-y-6">
          {insight ? <AiInsightsPanel insight={insight} /> : null}
          {insight ? <DecisionExplainabilityPanel insight={insight} /> : null}
          <div className="xl:hidden">
            <IncidentReasoningPanel insight={insight ?? null} />
          </div>
        </div>
      </IncidentSection>

      <IncidentSection
        number="05"
        title="Evidence"
        description="Extracted facts, corroboration, and source verification"
      >
        <div className="space-y-6">
          <EvidenceChipRow insight={insight ?? null} needs={data.humanitarianNeedsView.all} />
          <EvidenceVerificationCard
            status={data.verificationDetail.status}
            reason={data.verificationDetail.statusReason}
          />
          {data.masterIncident ? (
            <MasterIncidentCorrelationPanel cluster={data.masterIncident} />
          ) : null}
          {data.masterIncidentIntelligence ? (
            <MasterIncidentIntelligencePanel intelligence={data.masterIncidentIntelligence} />
          ) : null}
          {insight?.crossSourceAnalysis ? (
            <div className={`${dashboardCard} border-cyan-500/20 bg-cyan-500/5 p-5`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                Cross-Source Reasoning
              </p>
              <p className="mt-2 text-sm text-slate-300">{insight.crossSourceAnalysis.narrative}</p>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatBox
              label="Source Agreement"
              value={`${data.verificationDetail.agreementPercent}%`}
            />
            <StatBox
              label="Independent Sources"
              value={String(data.verificationDetail.independentSources)}
            />
            <StatBox
              label="Most Trusted"
              value={data.verificationDetail.mostTrustedSource ?? "Primary source only"}
              small
            />
          </div>
          <div className="space-y-3">
            {data.verificationDetail.sources.map((source) => (
              <div
                key={source.name}
                className={`${dashboardCard} flex items-center justify-between px-5 py-3`}
              >
                <span className="font-medium text-white">{source.name}</span>
                <div className="text-right">
                  <span className="text-amber-400">{renderStars(source.stars)}</span>
                  <p className="text-xs text-slate-500">{source.credibilityPercent}% credibility</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </IncidentSection>

      <IncidentSection
        number="06"
        title="Recommended Actions"
        description="Evidence-based response recommendations"
      >
        <RecommendedActionsList actions={analysis.recommendedActions} />
      </IncidentSection>

      <IncidentSection
        number="07"
        title="Source & Reliability"
        description="Primary source credentials and trust assessment"
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <dl className="grid gap-4 sm:grid-cols-2">
            <InfoField label="Source Name" value={analysis.report.source.name} />
            <InfoField label="Source Type" value={analysis.report.source.type} />
            <InfoField
              label="Credibility Score"
              value={`${Math.round(analysis.report.source.credibilityScore * 100)}%`}
            />
            <InfoField
              label="Report Date"
              value={new Date(analysis.report.reportDate).toLocaleString()}
            />
          </dl>
          <GaugeChart
            value={analysis.reliabilityAssessment.finalScore}
            label="Source Reliability"
            color={reliabilityStyle.fill}
          />
        </div>
      </IncidentSection>

      <IncidentSection
        number="08"
        title="Crisis & Location"
        description="Extracted geography and crisis classification"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <LocationField
              label="Detected Location"
              value={data.location?.displayName ?? "—"}
              showFlag
            />
            <div className="grid grid-cols-2 gap-4">
              <LocationField
                label="Latitude"
                value={
                  data.location && hasSafeCoordinates(data.location)
                    ? data.location.latitude!.toFixed(3)
                    : "—"
                }
              />
              <LocationField
                label="Longitude"
                value={
                  data.location && hasSafeCoordinates(data.location)
                    ? data.location.longitude!.toFixed(3)
                    : "—"
                }
              />
            </div>
            <LocationField label="Extraction Method" value={data.location.extractionMethod} />
            <LocationField label="Confidence" value={`${data.location.confidence}%`} />
          </div>
          <div className={`${dashboardCard} p-5`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Crisis Classification
            </p>
            <p
              className="mt-2 text-2xl font-bold"
              style={{ color: getCrisisTypeColor(data.nlp.crisisType) }}
            >
              {data.nlp.crisisType ?? "Unclassified"}
            </p>
            {data.nlp.affectedPopulation !== null && (
              <p className="mt-3 text-sm text-slate-400">
                Affected population:{" "}
                <span className="font-semibold text-white">
                  {data.nlp.affectedPopulation.toLocaleString()}
                </span>
              </p>
            )}
          </div>
        </div>
      </IncidentSection>

      {data.mapZone ? (
        <IncidentSection
          number="09"
          title="Incident Map"
          description="Geospatial view with risk zone"
        >
          <div className="overflow-hidden rounded-[22px] border border-white/[0.08]">
            <InteractiveMapPanel
              zones={[data.mapZone]}
              showHeader={false}
              heightClass="h-[420px]"
            />
          </div>
        </IncidentSection>
      ) : null}

      <IncidentSection
        number="10"
        title="Risk Projection"
        description="Evidence-based temporal forecast and analyst reasoning"
      >
        <RiskProjectionAnalystPanel projection={data.riskProjection} />
      </IncidentSection>

      {insight?.priorityReasoning?.severityReductionReasons?.length ||
      insight?.finalReasoning?.evidenceDecreasing?.length ? (
        <IncidentSection
          number="11"
          title="Why Not Higher Severity?"
          description="AI explanation for moderated priority assessments"
        >
          <ul className={`${dashboardCard} space-y-2 p-5`}>
            {(
              insight.priorityReasoning?.severityReductionReasons ??
              insight.finalReasoning?.evidenceDecreasing ??
              []
            ).map((reason) => (
              <li key={reason} className="text-sm text-slate-300">
                • {reason}
              </li>
            ))}
          </ul>
        </IncidentSection>
      ) : null}

      <IncidentSection
        number="12"
        title="Incident Timeline"
        description="Chronological events from source material"
      >
        <TimelineContent timeline={timeline} deferredLoading={deferredLoading} />
      </IncidentSection>

      <div className={`${dashboardCard} p-5`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Evaluation Status
        </p>
        <p className="mt-2 text-lg font-semibold text-white">{data.evaluationStatus}</p>
        <p className="mt-2 text-sm text-slate-400">
          Analyst validation and feedback inform CHLE for future assessments.
        </p>
      </div>

      <SimilarIncidentsPanel reportId={analysis.report.id} />

      <AnalystFeedbackPanel
        reportId={analysis.report.id}
        currentPriority={analysis.priorityAssessment.priorityLevel}
        currentCrisisType={data.nlp.crisisType}
        currentReportPurpose={insight?.humanitarianReasoning?.reportPurpose ?? null}
      />

      <AcademicTransparencyPanel
        transparency={transparency}
        aiConclusion={insight?.finalReasoning?.conclusion ?? insight?.situationSummary}
      />

      <details className={`${dashboardCard} overflow-hidden`}>
        <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-slate-400 hover:text-white">
          View original source report
        </summary>
        <div className="border-t border-white/[0.06] px-6 py-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
            {analysis.report.content}
          </p>
        </div>
      </details>
    </div>
  );
}

function IncidentSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="border-b border-white/[0.06] pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500/70">
          Section {number}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white lg:text-xl">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function LocationField({
  label,
  value,
  showFlag = false,
}: {
  label: string;
  value: string;
  showFlag?: boolean;
}) {
  return (
    <div className={`${dashboardCard} px-4 py-3`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">
        {showFlag ? <LocationWithFlag location={value} /> : value}
      </p>
    </div>
  );
}

function StatBox({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className={`${dashboardCard} p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-bold text-white ${small ? "text-sm" : "text-xl"}`}>{value}</p>
    </div>
  );
}

function TimelineContent({
  timeline,
  deferredLoading,
}: {
  timeline: IncidentIntelligenceData["timeline"];
  deferredLoading: boolean;
}) {
  return (
    <div className="relative space-y-0 pl-6">
      <div className="absolute bottom-2 left-[11px] top-2 w-px bg-white/10" />
      {deferredLoading ? (
        <SectionSkeleton className="h-40" />
      ) : timeline.length === 0 ? (
        <p className="text-sm text-slate-500">No timeline events saved for this incident.</p>
      ) : (
        timeline.map((event, i) => (
          <div key={i} className="relative pb-8 last:pb-0">
            <div className="absolute -left-6 top-1 h-[9px] w-[9px] rounded-full border-2 border-blue-500 bg-[#060a12]" />
            {event.time && <p className="font-mono text-xs text-blue-400">{event.time}</p>}
            <p className="mt-0.5 font-medium text-white">{event.title}</p>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">{event.description}</p>
          </div>
        ))
      )}
    </div>
  );
}

function RecommendedActionsList({ actions }: { actions: string[] }) {
  return (
    <div className={`${dashboardCard} p-5`}>
      {actions.length === 0 ? (
        <p className="text-sm text-slate-500">
          No specific humanitarian actions were identified from the available evidence.
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
    </div>
  );
}
