"use client";

import type { HumanitarianNeedDetail } from "@/lib/incidentEnrichment";
import { getHumanitarianNeedIcon } from "@/lib/humanitarianNeedIcons";
import { canonicalNeedKey, normaliseNeedName } from "@/lib/humanitarianNeedTaxonomy";
import { needExplanation, needShortSummary } from "@/lib/humanitarianNeedDisplay";
import {
  HumanitarianNeedCardHero,
  HumanitarianNeedCardProgressFooter,
} from "@/components/incidents/dashboard/HumanitarianNeedCardHero";
import {
  dashboardCard,
  dashboardCardHover,
  severityGradient,
} from "@/components/incidents/dashboard/incidentDashboardStyles";

interface HumanitarianNeedDetailCardProps {
  need: HumanitarianNeedDetail;
}

export function HumanitarianNeedDetailCard({ need }: HumanitarianNeedDetailCardProps) {
  const canonical = normaliseNeedName(need.needType);
  const icon = getHumanitarianNeedIcon(canonical);
  const confidencePct = Math.round(need.confidence * 100);
  const summary = needShortSummary(need);
  const barWidth = Math.max(need.score, need.confidence) * 100;

  return (
    <article
      className={`${dashboardCard} ${dashboardCardHover} flex h-full min-h-[260px] flex-col bg-gradient-to-br p-6 ${severityGradient(need.severity)}`}
    >
      <HumanitarianNeedCardHero
        icon={icon}
        severity={need.severity}
        title={canonical}
        confidencePct={confidencePct}
        source={need.source}
      />

      <p className="mt-4 line-clamp-2 px-1 text-center text-xs leading-relaxed text-slate-400">
        {summary}
      </p>

      <HumanitarianNeedCardProgressFooter barWidth={barWidth} severity={need.severity} />
    </article>
  );
}

export function humanitarianNeedKey(need: HumanitarianNeedDetail): string {
  return `${canonicalNeedKey(normaliseNeedName(need.needType))}-${need.severity}`;
}

export { needExplanation };
