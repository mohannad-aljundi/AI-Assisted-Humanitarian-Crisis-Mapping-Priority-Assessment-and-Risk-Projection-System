"use client";

import type { ExtendedAnalysisInsight } from "@/types";
import { sanitizeAnalystText } from "@/lib/explainabilityPresentation";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";

interface ReasoningBlock {
  icon: string;
  title: string;
  body: string;
}

interface IncidentReasoningPanelProps {
  insight: ExtendedAnalysisInsight | null;
}

export function IncidentReasoningPanel({ insight }: IncidentReasoningPanelProps) {
  if (!insight) {
    return (
      <div className={`${dashboardCard} p-6`}>
        <p className="text-sm text-slate-500">AI reasoning is not yet available for this report.</p>
      </div>
    );
  }

  const observedEvidence = [
    ...(insight.knownFacts ?? []),
    ...(insight.evidence ?? []).slice(0, 4),
    ...(insight.finalReasoning?.evidenceIncreasing ?? []).slice(0, 3),
    ...(insight.priorityReasoning?.evidenceQuotes ?? []).slice(0, 2),
  ].filter(Boolean);

  const aiInterpretation =
    insight.priorityReasoning?.narrative ??
    insight.situationSummary ??
    insight.priorityReasoning?.conclusion ??
    "Semantic analysis of the full report context, humanitarian indicators, and crisis dynamics.";

  const finalDecision =
    insight.finalReasoning?.conclusion ??
    insight.priorityExplanation?.conclusion ??
    "Priority and response posture derived from AI-led humanitarian severity assessment.";

  const confidenceParts: string[] = [];
  if (insight.confidenceLevel) {
    confidenceParts.push(`Overall confidence level: ${insight.confidenceLevel}.`);
  }
  if (insight.confidenceBreakdown && Object.keys(insight.confidenceBreakdown).length > 0) {
    const top = Object.entries(insight.confidenceBreakdown)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").trim()} (${Math.round(v * 100)}%)`);
    confidenceParts.push(`Key factors: ${top.join(", ")}.`);
  }
  if (insight.unknownFacts?.length) {
    confidenceParts.push(`Uncertainty: ${insight.unknownFacts.slice(0, 2).join("; ")}.`);
  }

  const reasoning = insight.humanitarianReasoning;

  const blocks: ReasoningBlock[] = [
    {
      icon: "🧭",
      title: "Report Context",
      body: reasoning
        ? `${reasoning.reportPurpose} · Phase: ${reasoning.crisisPhase}. ${reasoning.analystSummary}`
        : sanitizeAnalystText(insight.crisisExplanation ?? insight.situationSummary ?? "Contextual reading of the report purpose and humanitarian phase."),
    },
    {
      icon: "📋",
      title: "Observed Evidence",
      body:
        observedEvidence.length > 0
          ? observedEvidence.slice(0, 5).map((e) => sanitizeAnalystText(e)).join(" ")
          : "Evidence is drawn from extracted entities, quoted facts, and corroborated humanitarian indicators in the source report.",
    },
    {
      icon: "🧠",
      title: "AI Interpretation",
      body: sanitizeAnalystText(aiInterpretation),
    },
    {
      icon: "⚖️",
      title: "Final Decision",
      body: sanitizeAnalystText(finalDecision),
    },
    {
      icon: "📊",
      title: "Confidence Explanation",
      body:
        confidenceParts.length > 0
          ? sanitizeAnalystText(confidenceParts.join(" "))
          : "Confidence reflects source reliability, evidence completeness, and consistency across extracted humanitarian indicators.",
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        AI Reasoning Chain
      </p>
      {blocks.map((block) => (
        <div key={block.title} className={`${dashboardCard} p-5`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none" aria-hidden>
              {block.icon}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-white">{block.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{block.body}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
