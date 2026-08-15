"use client";

import type { HumanitarianNeedDetail } from "@/lib/incidentEnrichment";
import { getHumanitarianNeedIcon } from "@/lib/humanitarianNeedIcons";
import { normaliseNeedName } from "@/lib/humanitarianNeedTaxonomy";
import {
  HumanitarianNeedCardHero,
  HumanitarianNeedCardProgressFooter,
} from "@/components/incidents/dashboard/HumanitarianNeedCardHero";
import {
  dashboardCard,
  dashboardCardHover,
  severityGradient,
} from "@/components/incidents/dashboard/incidentDashboardStyles";

interface HumanitarianNeedSummaryCardProps {
  need: HumanitarianNeedDetail;
  selected?: boolean;
  onSelect: () => void;
}

export function HumanitarianNeedSummaryCard({
  need,
  selected = false,
  onSelect,
}: HumanitarianNeedSummaryCardProps) {
  const canonical = normaliseNeedName(need.needType);
  const icon = getHumanitarianNeedIcon(canonical);
  const confidencePct = Math.round(need.confidence * 100);
  const barWidth = Math.max(need.score, need.confidence) * 100;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`${dashboardCard} ${dashboardCardHover} flex h-full min-h-[220px] w-full flex-col bg-gradient-to-br p-6 text-left transition-all ${severityGradient(need.severity)} ${
        selected ? "ring-2 ring-cyan-400/60 ring-offset-2 ring-offset-[#060a12]" : ""
      }`}
    >
      <HumanitarianNeedCardHero
        icon={icon}
        severity={need.severity}
        title={canonical}
        confidencePct={confidencePct}
        source={need.source}
      />

      <HumanitarianNeedCardProgressFooter barWidth={barWidth} severity={need.severity} />
    </button>
  );
}
