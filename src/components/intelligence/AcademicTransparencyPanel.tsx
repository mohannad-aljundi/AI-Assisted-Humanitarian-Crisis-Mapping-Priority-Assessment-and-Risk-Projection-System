"use client";

import { useState } from "react";
import type { AcademicTransparency } from "@/lib/incidentEnrichment";
import {
  formatAiModelForDisplay,
  formatAnalysisMethodLabel,
  PUBLIC_ANALYTICAL_STEPS,
} from "@/lib/explainabilityPresentation";
import { SectionCard } from "@/components/ui/SectionCard";

interface AcademicTransparencyPanelProps {
  transparency: AcademicTransparency;
  aiConclusion?: string | null;
}

export function AcademicTransparencyPanel({
  transparency,
  aiConclusion,
}: AcademicTransparencyPanelProps) {
  const steps = transparency.analyticalSteps ?? PUBLIC_ANALYTICAL_STEPS;

  return (
    <SectionCard
      title="Academic Transparency"
      description="Explainable AI disclosure for research and operational audit"
    >
      {aiConclusion ? (
        <div className="mb-5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
            AI assessment summary
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{aiConclusion}</p>
        </div>
      ) : null}

      <TransparencyContent transparency={transparency} analyticalSteps={steps} />
    </SectionCard>
  );
}

interface TransparencyContentProps {
  transparency: AcademicTransparency;
  analyticalSteps: Array<{ order: number; name: string; description: string }>;
  defaultOpen?: boolean;
}

export function TransparencyContent({
  transparency,
  analyticalSteps,
  defaultOpen = false,
}: TransparencyContentProps) {
  const [methodologyOpen, setMethodologyOpen] = useState(defaultOpen);

  return (
    <>
      <dl className="mb-4 grid gap-4 sm:grid-cols-2">
        <InfoField
          label="AI model"
          value={formatAiModelForDisplay(transparency.aiModel)}
        />
        <InfoField
          label="Analysis approach"
          value={formatAnalysisMethodLabel(transparency.extractionMethodKind)}
        />
        <InfoField
          label="Overall confidence"
          value={confidenceLabel(transparency.overallConfidence)}
        />
        <InfoField label="Active provider" value={transparency.activeProvider} />
      </dl>

      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Analytical pipeline
        </p>
        <ol className="mt-3 space-y-2">
          {analyticalSteps.map((step) => (
            <li
              key={step.order}
              className="rounded-xl border border-white/10 bg-slate-900/30 px-4 py-3"
            >
              <p className="text-sm font-semibold text-white">
                {String(step.order).padStart(2, "0")}. {step.name}
              </p>
              <p className="mt-1 text-sm text-slate-400">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>

      {transparency.sourcesUsed.length > 0 ? (
        <p className="mb-4 text-sm text-slate-400">
          <span className="text-slate-500">Sources reviewed: </span>
          {transparency.sourcesUsed.join(", ")}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setMethodologyOpen((v) => !v)}
        className="text-sm font-medium text-blue-400 hover:text-blue-300"
      >
        {methodologyOpen ? "Hide technical methodology" : "Technical methodology"}
      </button>

      {methodologyOpen && (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <InfoField label="Reliability methodology" value={transparency.reliabilityFormula} />
            <InfoField label="Priority methodology" value={transparency.priorityFormula} />
            <InfoField label="Risk methodology" value={transparency.riskFormula} />
            <InfoField label="Confidence methodology" value={transparency.confidenceFormula} />
          </dl>

          {transparency.methodsAttempted.length > 0 && (
            <div>
              <p className="text-xs text-slate-500">Location resolution methods attempted</p>
              <p className="mt-1 text-sm text-slate-300">
                {transparency.methodsAttempted
                  .map((m) =>
                    m
                      .replace(/GeoNames/gi, "GeoNames database")
                      .replace(/Nominatim/gi, "OpenStreetMap")
                  )
                  .join(" → ")}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function confidenceLabel(score: number): string {
  const pct = Math.round(score * 100);
  if (pct >= 80) return `High (${pct}%)`;
  if (pct >= 55) return `Moderate (${pct}%)`;
  return `Limited (${pct}%)`;
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}
