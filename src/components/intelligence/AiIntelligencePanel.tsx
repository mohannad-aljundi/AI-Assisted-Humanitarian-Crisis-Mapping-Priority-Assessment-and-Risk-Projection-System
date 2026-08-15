"use client";

import { useState } from "react";
import type { ExtendedAnalysisInsight, NLPAnalysisResult } from "@/types";
import type { HumanitarianNeedDetail } from "@/lib/incidentEnrichment";
import { normaliseNeedName } from "@/lib/humanitarianNeedTaxonomy";
import { hasSafeCoordinates } from "@/lib/coordinates";
import {
  breakdownToExplanations,
  buildSupportingExplanations,
  formatAnalysisMethodLabel,
  formatAiModelForDisplay,
  formatCrossSourceNarrative,
  formatLocationReasoningForDisplay,
  humanizeReasoningChainStep,
  sanitizeAnalystText,
} from "@/lib/explainabilityPresentation";
import { AiReasoningTraceSection } from "@/components/intelligence/AiReasoningTraceSection";
import { HumanitarianNeedCard } from "@/components/analysis/HumanitarianNeedCard";
import { SectionCard } from "@/components/ui/SectionCard";

interface AiIntelligencePanelProps {
  insight: ExtendedAnalysisInsight | null;
  nlp: NLPAnalysisResult;
  humanitarianNeeds: HumanitarianNeedDetail[];
}

export function AiIntelligencePanel({
  insight,
  nlp,
  humanitarianNeeds,
}: AiIntelligencePanelProps) {
  if (!insight) {
    return (
      <SectionCard
        title="Humanitarian Intelligence Assessment"
        description="Explainable AI analysis of this report"
      >
        <p className="text-sm text-slate-500">No intelligence assessment is available for this report.</p>
      </SectionCard>
    );
  }

  const entities = nlp.entities ?? [];
  const finalReasoning = insight.finalReasoning;
  const conclusion =
    finalReasoning?.conclusion ?? insight.situationSummary ?? null;
  const supporting = buildSupportingExplanations(insight);
  const locationDisplay = formatLocationReasoningForDisplay(insight.locationReasoning);

  const displayNeeds = humanitarianNeeds.map((need) => ({
    needType: normaliseNeedName(need.needType),
    severity: need.severity as NLPAnalysisResult["humanitarianNeeds"][number]["severity"],
    source: need.source,
    evidence: need.evidence,
    reasoning: need.reasoning ?? need.reason,
    confidence: need.confidence,
  }));

  return (
    <SectionCard
      title="Humanitarian Intelligence Assessment"
      description="AI analyst explanation — evidence and reasoning before scores"
    >
      {conclusion ? (
        <div className="mb-5 rounded-xl border border-blue-500/25 bg-blue-500/8 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
            AI Final Assessment
          </p>
          <p className="mt-3 text-base leading-relaxed text-slate-100">{conclusion}</p>
        </div>
      ) : null}

      <AiReasoningTraceSection insight={insight} />

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <DimensionBlock
          title="Priority — humanitarian severity"
          dimension={insight.priorityReasoning}
          fallback={insight.priorityExplanation}
          supporting={supporting.priority}
          accent="red"
          preferFallbackConclusion
        />
        <DimensionBlock
          title="Reliability — source trust"
          dimension={insight.reliabilityReasoning}
          fallback={insight.reliabilityExplanation}
          supporting={supporting.reliability}
          accent="emerald"
        />
        <DimensionBlock
          title="Risk — trajectory over time"
          dimension={insight.riskReasoning}
          fallback={insight.riskExplanation}
          supporting={supporting.risk}
          accent="orange"
        />
      </div>

      {(insight.knownFacts?.length || insight.unknownFacts?.length) ? (
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <FactList title="Known" facts={insight.knownFacts ?? []} tone="emerald" />
          <FactList title="Unknown / uncertain" facts={insight.unknownFacts ?? []} tone="amber" />
        </div>
      ) : null}

      {insight.crossSourceAnalysis ? (
        <div className="mb-5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
            Cross-source analysis
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            {formatCrossSourceNarrative(insight.crossSourceAnalysis)}
          </p>
        </div>
      ) : null}

      {insight.locationReasoning ? (
        <div className="mb-5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
            Location resolution
          </p>
          <p className="mt-2 text-sm text-slate-200">{locationDisplay.summary}</p>
          {locationDisplay.steps.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-slate-300">
              {locationDisplay.steps.map((step) => (
                <li key={step} className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {insight.locationReasoning.confidencePercent > 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              Confidence: {insight.locationReasoning.confidencePercent}%
            </p>
          ) : null}
        </div>
      ) : null}

      {displayNeeds.length > 0 ? (
        <div className="mb-5">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Humanitarian needs — observed and inferred
          </p>
          <div className="space-y-3">
            {displayNeeds.map((need) => (
              <HumanitarianNeedCard
                key={`${need.needType}-${need.source ?? "observed"}`}
                need={need}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 px-4 py-4">
          <p className="text-sm text-amber-200/90">
            No humanitarian needs are available for this report. Run Re-analyze All Data to
            regenerate observed and inferred needs, or check server logs for inference errors.
          </p>
        </div>
      )}

      {insight.evidence && insight.evidence.length > 0 ? (
        <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            Evidence supporting decision
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {insight.evidence.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-emerald-400">•</span>
                <span>{sanitizeAnalystText(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <SupportingFactorsSection insight={insight} supporting={supporting} />

      <QualityAssuranceSection insight={insight} />

      {insight.crisisExplanation ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
          <span className="font-medium text-white">Crisis classification: </span>
          {sanitizeAnalystText(insight.crisisExplanation)}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <MetaTile
          label="Analysis method"
          value={formatAnalysisMethodLabel(insight.extractionMethod)}
        />
        <MetaTile label="AI model" value={formatAiModelForDisplay(insight.aiModel)} />
        <MetaTile label="Confidence level" value={insight.confidenceLevel ?? "Medium"} />
      </div>

      {entities.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Key entities identified
          </p>
          <div className="flex flex-wrap gap-2">
            {entities.map((entity) => (
              <span
                key={`${entity.entitySubtype}-${entity.value}`}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300"
              >
                {entity.entitySubtype ? `${entity.entitySubtype}: ` : ""}
                {entity.value}
                {hasSafeCoordinates(entity)
                  ? ` (${entity.latitude!.toFixed(2)}, ${entity.longitude!.toFixed(2)})`
                  : ""}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

function DimensionBlock({
  title,
  dimension,
  fallback,
  supporting,
  accent,
  preferFallbackConclusion = false,
}: {
  title: string;
  dimension?: ExtendedAnalysisInsight["priorityReasoning"];
  fallback: ExtendedAnalysisInsight["priorityExplanation"];
  supporting: string[];
  accent: "red" | "emerald" | "orange";
  preferFallbackConclusion?: boolean;
}) {
  const border =
    accent === "red"
      ? "border-red-500/25"
      : accent === "emerald"
        ? "border-emerald-500/25"
        : "border-orange-500/25";

  const conclusion = preferFallbackConclusion
    ? fallback.conclusion?.trim()
      ? fallback.conclusion
      : (dimension?.conclusion ?? "")
    : (dimension?.conclusion ?? fallback.conclusion);
  const narrative = dimension?.narrative;
  const quotes = dimension?.evidenceQuotes ?? fallback.evidence ?? [];
  const reductionReasons = dimension?.severityReductionReasons ?? [];

  return (
    <div className={`rounded-xl border ${border} bg-slate-900/40 p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
      <p className="mt-2 text-sm font-semibold text-white">{sanitizeAnalystText(conclusion)}</p>
      {narrative ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{sanitizeAnalystText(narrative)}</p>
      ) : null}
      {quotes.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs italic text-slate-400">
          {quotes.slice(0, 3).map((q) => (
            <li key={q}>&ldquo;{sanitizeAnalystText(q)}&rdquo;</li>
          ))}
        </ul>
      ) : null}
      {reductionReasons.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Why not higher severity
          </p>
          <ul className="mt-1 space-y-1 text-xs text-slate-400">
            {reductionReasons.map((r) => (
              <li key={r}>• {sanitizeAnalystText(r)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {supporting.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-slate-400">
          {supporting.slice(0, 5).map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SupportingFactorsSection({
  insight,
  supporting,
}: {
  insight: ExtendedAnalysisInsight;
  supporting: ReturnType<typeof buildSupportingExplanations>;
}) {
  const [open, setOpen] = useState(false);
  const hasBreakdown =
    (insight.priorityBreakdown && Object.keys(insight.priorityBreakdown).length > 0) ||
    (insight.reliabilityBreakdown && Object.keys(insight.reliabilityBreakdown).length > 0) ||
    (insight.riskBreakdown && Object.keys(insight.riskBreakdown).length > 0) ||
    (insight.confidenceBreakdown && Object.keys(insight.confidenceBreakdown).length > 0);

  if (!hasBreakdown && supporting.confidence.length === 0) return null;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="mb-5 rounded-xl border border-white/10 bg-slate-900/30"
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-300 hover:text-white">
        Supporting assessment factors
      </summary>
      <div className="space-y-4 border-t border-white/10 px-4 py-4">
        <ExplanationGroup title="Priority factors" items={supporting.priority} />
        <ExplanationGroup title="Reliability factors" items={supporting.reliability} />
        <ExplanationGroup title="Risk factors" items={supporting.risk} />
        <ExplanationGroup
          title="Confidence factors"
          items={
            supporting.confidence.length > 0
              ? supporting.confidence
              : breakdownToExplanations(insight.confidenceBreakdown, insight)
          }
        />
      </div>
    </details>
  );
}

function ExplanationGroup({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-slate-300">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function QualityAssuranceSection({ insight }: { insight: ExtendedAnalysisInsight }) {
  const hasGuardrail = insight.guardrailAdjustment?.applied;
  const validationSteps = insight.reasoningChain?.filter((s) =>
    /validation|guardrail|quality/i.test(s.step)
  );

  if (!hasGuardrail && (!validationSteps || validationSteps.length === 0)) return null;

  return (
    <details className="mb-5 rounded-xl border border-amber-500/20 bg-slate-900/30">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-amber-300 hover:text-amber-200">
        Quality assurance validation
      </summary>
      <div className="border-t border-amber-500/10 px-4 py-3">
        {insight.guardrailAdjustment?.applied ? (
          <div className="mb-3">
            <p className="text-sm text-amber-100">
              {sanitizeAnalystText(insight.guardrailAdjustment.reason ?? "")}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-200/80">
              {insight.guardrailAdjustment.evidence.map((item) => (
                <li key={item}>• {sanitizeAnalystText(item)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {validationSteps?.map((step) => (
          <div key={step.step} className="text-sm text-slate-300">
            <span className="font-medium text-slate-200">
              {humanizeReasoningChainStep(step.step)}:
            </span>{" "}
            {sanitizeAnalystText(step.conclusion)}
          </div>
        ))}
      </div>
    </details>
  );
}

function FactList({
  title,
  facts,
  tone,
}: {
  title: string;
  facts: string[];
  tone: "emerald" | "amber";
}) {
  if (facts.length === 0) return null;
  const border = tone === "emerald" ? "border-emerald-500/20" : "border-amber-500/20";
  return (
    <div className={`rounded-xl border ${border} bg-slate-900/40 p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-slate-300">
        {facts.map((f) => (
          <li key={f}>• {sanitizeAnalystText(f)}</li>
        ))}
      </ul>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-200">{value}</p>
    </div>
  );
}
