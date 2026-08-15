"use client";

import type { ExtendedAnalysisInsight } from "@/types";
import {
  buildAiInterpretation,
  buildConfidenceExplanation,
  buildDecisionSummary,
  buildObservedEvidence,
  sanitizeAnalystText,
} from "@/lib/explainabilityPresentation";

interface AiReasoningTraceSectionProps {
  insight: ExtendedAnalysisInsight;
}

export function AiReasoningTraceSection({ insight }: AiReasoningTraceSectionProps) {
  const finalReasoning = insight.finalReasoning;
  const observed = buildObservedEvidence(insight);
  const interpretation = buildAiInterpretation(insight);
  const decision = buildDecisionSummary(insight);
  const confidenceExplanation = buildConfidenceExplanation(insight, finalReasoning);

  const reducing =
    finalReasoning?.evidenceDecreasing?.map(sanitizeAnalystText).filter(Boolean) ??
    insight.priorityReasoning?.severityReductionReasons?.map(sanitizeAnalystText) ??
    [];

  return (
    <div className="mb-5 rounded-xl border border-violet-500/25 bg-violet-500/5 p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">
        AI Reasoning Trace
      </p>

      <TraceBlock title="Observed evidence" items={observed} empty="No specific facts were extracted from the source text." />

      {reducing.length > 0 ? (
        <TraceBlock
          title="Factors reducing assessed severity"
          items={reducing}
          tone="muted"
        />
      ) : null}

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          AI interpretation
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{interpretation}</p>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Decision
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-100">{decision}</p>
        {insight.guardrailAdjustment?.applied && insight.guardrailAdjustment.reason ? (
          <p className="mt-2 text-sm text-amber-200/90">
            {sanitizeAnalystText(insight.guardrailAdjustment.reason)}
          </p>
        ) : null}
      </div>

      <div className="mt-4 rounded-lg border border-white/5 bg-slate-900/40 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Confidence explanation
        </p>
        <p className="mt-1.5 text-sm text-slate-300">{confidenceExplanation}</p>
        {(insight.unknownFacts ?? []).length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-amber-200/80">
            {(insight.unknownFacts ?? []).slice(0, 5).map((fact) => (
              <li key={fact}>• Unknown: {sanitizeAnalystText(fact)}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function TraceBlock({
  title,
  items,
  empty,
  tone = "default",
}: {
  title: string;
  items: string[];
  empty?: string;
  tone?: "default" | "muted";
}) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      {items.length > 0 ? (
        <ul
          className={`mt-2 space-y-1.5 text-sm ${
            tone === "muted" ? "text-slate-400" : "text-slate-300"
          }`}
        >
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-violet-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : empty ? (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      ) : null}
    </div>
  );
}
