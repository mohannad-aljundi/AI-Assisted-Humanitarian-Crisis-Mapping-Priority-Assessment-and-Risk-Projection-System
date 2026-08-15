"use client";

import type { ExtendedAnalysisInsight } from "@/types";
import {
  buildAiStatusPresentation,
  type AiRuntimeStatusInput,
} from "@/lib/initialEvaluationPresentation";

interface AiProviderWarningBannerProps {
  assessmentMethod?: string | null;
  fallbackReason?: string | null;
  insight?: ExtendedAnalysisInsight | null;
  /** Server-resolved runtime AI configuration (never expose secrets). */
  aiRuntime?: AiRuntimeStatusInput | null;
}

/**
 * User-facing AI status card. Never exposes API keys, provider errors, or stack traces.
 */
export function AiProviderWarningBanner({
  assessmentMethod,
  fallbackReason,
  insight,
  aiRuntime,
}: AiProviderWarningBannerProps) {
  const status = buildAiStatusPresentation(
    insight ?? {
      assessmentMethod,
      assessmentFallbackReason: fallbackReason,
    },
    aiRuntime
  );

  const toneClass =
    status.tone === "active"
      ? "border-emerald-500/25 bg-emerald-500/10"
      : "border-amber-500/25 bg-amber-500/10";

  const titleClass =
    status.tone === "active" ? "text-emerald-100" : "text-amber-100";
  const bodyClass =
    status.tone === "active" ? "text-emerald-100/80" : "text-amber-100/80";
  const icon = status.tone === "active" ? "🟢" : status.tone === "degraded" ? "⚠" : "🟡";

  return (
    <div
      role="status"
      className={`rounded-2xl border px-5 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.2)] ${toneClass}`}
    >
      <p className={`text-sm font-semibold ${titleClass}`}>
        {icon} {status.title}
      </p>
      <p className={`mt-1 text-sm font-medium ${titleClass}`}>{status.subtitle}</p>
      <div className={`mt-2 space-y-1 text-sm ${bodyClass}`}>
        {status.body.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
