"use client";

import type { HumanitarianNeedDetail } from "@/lib/incidentEnrichment";
import {
  HumanitarianNeedDetailCard,
  humanitarianNeedKey,
} from "@/components/incidents/dashboard/HumanitarianNeedDetailCard";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";

interface HumanitarianNeedsGridProps {
  needs: HumanitarianNeedDetail[];
  emptyReason: string | null;
}

export function HumanitarianNeedsGrid({ needs, emptyReason }: HumanitarianNeedsGridProps) {
  if (needs.length === 0) {
    return (
      <div className={`${dashboardCard} border-dashed border-white/10 px-6 py-12 text-center`}>
        <p className="text-sm text-amber-200/80">
          {emptyReason ?? "No humanitarian needs identified for this incident."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {needs.map((need) => (
        <HumanitarianNeedDetailCard key={humanitarianNeedKey(need)} need={need} />
      ))}
    </div>
  );
}
