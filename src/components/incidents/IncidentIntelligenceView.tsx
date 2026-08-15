"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useRef, useState } from "react";
import type { IncidentIntelligenceData } from "@/services/incidentService";
import { deriveIncidentLabelFallback } from "@/services/incidentLabelService";
import { ANALYSIS_COMPLETED_EVENT } from "@/contexts/AnalysisLiveContext";
import type { CompletedAnalysisCard } from "@/lib/analysisEventBus";
import { createCancellableRequest, swallowAbortError } from "@/lib/cancellableFetch";
import { logClientPerf } from "@/lib/perfTrace";
import { IncidentKpiCards } from "@/components/incidents/dashboard/IncidentKpiCards";
import { IncidentFinalAssessmentCard } from "@/components/incidents/dashboard/IncidentFinalAssessmentCard";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { AiProviderWarningBanner } from "@/components/ui/AiProviderWarningBanner";
import type { AiRuntimeStatusInput } from "@/lib/initialEvaluationPresentation";
import { btnGhost, pageContainer } from "@/lib/uiClasses";
import { EvaluationStatusBadge } from "@/components/incidents/EvaluationStatusBadge";
import { IncidentIntelligenceReportBody } from "@/components/incidents/IncidentIntelligenceTabPanels";
import { IncidentReasoningPanel } from "@/components/incidents/dashboard/IncidentReasoningPanel";

const MemoizedKpiCards = memo(IncidentKpiCards);
const MemoizedFinalAssessment = memo(IncidentFinalAssessmentCard);

interface IncidentIntelligenceViewProps {
  data: IncidentIntelligenceData;
  aiRuntime?: AiRuntimeStatusInput | null;
}

export function IncidentIntelligenceView({
  data,
  aiRuntime,
}: IncidentIntelligenceViewProps) {
  const router = useRouter();
  const { analysis } = data;
  const insight = analysis.insight;

  const assessmentMethod = insight?.assessmentMethod ?? null;

  const [deferred, setDeferred] = useState<{
    timeline: IncidentIntelligenceData["timeline"];
    transparency: IncidentIntelligenceData["transparency"];
  } | null>(null);
  const [deferredLoading, setDeferredLoading] = useState(data.timeline.length === 0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    function onCompleted(event: Event) {
      const report = (event as CustomEvent<CompletedAnalysisCard>).detail;
      if (report?.id === analysis.report.id) {
        router.refresh();
      }
    }
    window.addEventListener(ANALYSIS_COMPLETED_EVENT, onCompleted);
    return () => window.removeEventListener(ANALYSIS_COMPLETED_EVENT, onCompleted);
  }, [analysis.report.id, router]);

  useEffect(() => {
    if (data.timeline.length > 0) {
      setDeferredLoading(false);
      return;
    }

    const request = createCancellableRequest();
    const started = performance.now();
    logClientPerf("fetch:start", {
      pathname: window.location.pathname,
      url: `/api/incidents/${analysis.report.id}/deferred`,
    });

    async function loadDeferred() {
      try {
        const res = await request.fetch(`/api/incidents/${analysis.report.id}/deferred`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          timeline: IncidentIntelligenceData["timeline"];
          transparency: IncidentIntelligenceData["transparency"];
        };
        if (mountedRef.current) setDeferred(json);
        logClientPerf("fetch:complete", {
          url: `/api/incidents/${analysis.report.id}/deferred`,
          ms: Math.round(performance.now() - started),
          aborted: false,
        });
      } catch (error) {
        if (!swallowAbortError(error, request.signal)) {
          console.error("[IncidentIntelligence] deferred fetch failed:", error);
          return;
        }
        logClientPerf("fetch:aborted", {
          url: `/api/incidents/${analysis.report.id}/deferred`,
          ms: Math.round(performance.now() - started),
        });
      } finally {
        if (mountedRef.current) setDeferredLoading(false);
      }
    }

    void loadDeferred();
    return () => {
      request.abort();
    };
  }, [analysis.report.id, data.timeline.length]);

  const timeline = deferred?.timeline ?? data.timeline;
  const transparency = deferred?.transparency ?? data.transparency;

  const incidentLabel =
    analysis.report.incidentLabel?.trim() ||
    deriveIncidentLabelFallback({
      headline: analysis.report.title,
      content: analysis.report.content,
      crisisType: data.nlp.crisisType,
      location: data.nlp.locations[0]?.name ?? null,
      country: analysis.report.segmentCountry,
      humanitarianNeeds: data.nlp.humanitarianNeeds.map((need) => need.needType),
      priorityLevel: analysis.priorityAssessment.priorityLevel,
    });

  return (
    <div className="flex min-h-screen flex-col bg-[#060a12]">
      <AppTopBar title="Incident Intelligence" />
      <div className={`app-page-content ${pageContainer} space-y-8 pb-20`}>
        <div className="flex flex-wrap justify-between gap-3">
          <Link href="/dashboard" className={btnGhost}>
            ← Dashboard
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link href="/evaluation" className={btnGhost}>
              Evaluation
            </Link>
            <Link href="/analysis" className={btnGhost}>
              Analysis List
            </Link>
          </div>
        </div>

        <header className="space-y-3 border-b border-white/[0.06] pb-8">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400/90">
              Humanitarian Intelligence Platform
            </p>
            <EvaluationStatusBadge status={data.evaluationStatus ?? "Pending review"} />
          </div>
          <h1 className="max-w-5xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
            {incidentLabel}
          </h1>
          <p className="max-w-4xl text-sm leading-relaxed text-slate-500">
            <span className="font-medium text-slate-400">Original headline: </span>
            {analysis.report.title}
          </p>
          <p className="max-w-3xl text-sm text-slate-500">
            {new Date(analysis.report.reportDate).toLocaleString()} ·{" "}
            {analysis.report.source.name}
            {data.nlp.crisisType ? ` · ${data.nlp.crisisType}` : ""}
          </p>
        </header>

        <AiProviderWarningBanner
          assessmentMethod={assessmentMethod}
          fallbackReason={insight?.assessmentFallbackReason}
          insight={insight}
          aiRuntime={aiRuntime}
        />

        <div className="grid gap-6 xl:grid-cols-12 xl:items-stretch">
          <div className="xl:col-span-8">
            <MemoizedKpiCards overview={data.assessmentOverview} analysis={analysis} />
          </div>
          <div className="xl:col-span-4">
            <MemoizedFinalAssessment
              overview={data.assessmentOverview}
              analysis={analysis}
              insight={insight}
            />
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-12">
          <div className="space-y-10 xl:col-span-8">
            <IncidentIntelligenceReportBody
              data={data}
              insight={insight}
              timeline={timeline}
              transparency={transparency}
              deferredLoading={deferredLoading}
            />
          </div>
          <aside className="hidden xl:col-span-4 xl:block">
            <div className="sticky top-6 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500/70">
                AI Reasoning
              </p>
              <IncidentReasoningPanel insight={insight} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
