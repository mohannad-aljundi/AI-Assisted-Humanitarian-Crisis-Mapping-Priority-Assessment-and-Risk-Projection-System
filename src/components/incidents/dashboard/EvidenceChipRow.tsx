"use client";

import type { ExtendedAnalysisInsight } from "@/types";
import type { HumanitarianNeedDetail } from "@/lib/incidentEnrichment";
import { sanitizeAnalystText } from "@/lib/explainabilityPresentation";
import { evidenceChipClass } from "@/components/incidents/dashboard/incidentDashboardStyles";

interface EvidenceChipRowProps {
  insight: ExtendedAnalysisInsight | null;
  needs: HumanitarianNeedDetail[];
}

function classifyImportance(text: string, index: number): "high" | "medium" | "low" {
  const lower = text.toLowerCase();
  if (
    /\b(killed|deaths?|casualt|critical|collapse|overwhelmed|destroyed|mass)\b/i.test(lower)
  ) {
    return "high";
  }
  if (/\b(displaced|damaged|injured|flood|shortage|urgent)\b/i.test(lower)) {
    return "medium";
  }
  return index < 3 ? "medium" : "low";
}

export function EvidenceChipRow({ insight, needs }: EvidenceChipRowProps) {
  const raw: string[] = [];

  if (insight?.finalReasoning?.evidenceIncreasing) {
    raw.push(...insight.finalReasoning.evidenceIncreasing);
  }
  if (insight?.evidence) {
    raw.push(...insight.evidence);
  }
  for (const need of needs) {
    if (need.evidence) raw.push(need.evidence);
  }
  if (insight?.knownFacts) {
    raw.push(...insight.knownFacts);
  }

  const chips = [...new Set(raw.map((t) => sanitizeAnalystText(t).trim()))]
    .filter((t) => t.length > 8 && t.length < 120)
    .slice(0, 12);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        Extracted Evidence
      </p>
      <div className="flex flex-wrap gap-2.5">
        {chips.map((chip, i) => (
          <span
            key={`${chip}-${i}`}
            className={`inline-flex max-w-full rounded-full border px-4 py-2 text-sm font-medium transition hover:scale-[1.02] ${evidenceChipClass(classifyImportance(chip, i))}`}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}
