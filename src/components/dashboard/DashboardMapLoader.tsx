"use client";

import dynamic from "next/dynamic";
import { useDashboardLive } from "@/contexts/DashboardLiveContext";
import { SectionSkeleton } from "@/components/incidents/IncidentSectionSkeletons";

const InteractiveMapPanel = dynamic(
  () =>
    import("@/components/crisis-map/InteractiveMapPanel").then(
      (m) => m.InteractiveMapPanel
    ),
  { loading: () => <SectionSkeleton className="h-[420px]" /> }
);

export function DashboardMapLoader() {
  const { map, mapError } = useDashboardLive();

  if (mapError) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-slate-900/40 text-sm text-slate-500">
        Map preview unavailable
      </div>
    );
  }

  if (!map) {
    return <SectionSkeleton className="h-[420px]" />;
  }

  return <InteractiveMapPanel zones={map.zones} variant="embedded" />;
}
