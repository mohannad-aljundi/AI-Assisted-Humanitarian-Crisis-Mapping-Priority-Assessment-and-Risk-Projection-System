"use client";

import { useEffect, useRef, useState } from "react";
import type { HumanitarianNeedsView } from "@/lib/incidentEnrichment";
import { humanitarianNeedKey } from "@/components/incidents/dashboard/HumanitarianNeedDetailCard";
import { HumanitarianNeedSummaryCard } from "@/components/incidents/dashboard/HumanitarianNeedSummaryCard";
import { HumanitarianNeedSelectedDetail } from "@/components/incidents/dashboard/HumanitarianNeedSelectedDetail";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";

interface HumanitarianNeedsSectionProps {
  view: HumanitarianNeedsView;
}

export function HumanitarianNeedsSection({ view }: HumanitarianNeedsSectionProps) {
  const rankedNeeds = view.all;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const selectedNeed =
    rankedNeeds.find((need) => humanitarianNeedKey(need) === selectedKey) ?? null;

  useEffect(() => {
    if (selectedNeed && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedNeed]);

  if (rankedNeeds.length === 0) {
    return (
      <div className={`${dashboardCard} border-dashed border-white/10 px-6 py-12 text-center`}>
        <p className="text-sm text-amber-200/80">
          {view.emptyReason ?? "No humanitarian needs identified for this incident."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        {rankedNeeds.length} detected need{rankedNeeds.length === 1 ? "" : "s"} · ranked by
        severity, confidence, and evidence · select a card for full detail
      </p>

      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rankedNeeds.map((need) => {
          const key = humanitarianNeedKey(need);
          return (
            <HumanitarianNeedSummaryCard
              key={key}
              need={need}
              selected={selectedKey === key}
              onSelect={() => setSelectedKey((current) => (current === key ? null : key))}
            />
          );
        })}
      </div>

      {selectedNeed ? (
        <div ref={detailRef}>
          <HumanitarianNeedSelectedDetail
            need={selectedNeed}
            onClose={() => setSelectedKey(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
