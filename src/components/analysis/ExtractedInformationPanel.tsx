import type { NLPAnalysisResult } from "@/types";
import { hasSafeCoordinates } from "@/lib/coordinates";
import {
  formatLocationDisplay,
  isUnverifiedLocationLabel,
  LOCATION_LABELS,
} from "@/lib/locationDisplay";
import { LocationWithFlag } from "@/components/ui/CountryFlag";
import { HumanitarianNeedCard } from "@/components/analysis/HumanitarianNeedCard";
import { PanelCard } from "./shared";

interface ExtractedInformationPanelProps {
  nlp: NLPAnalysisResult;
}

export function ExtractedInformationPanel({ nlp }: ExtractedInformationPanelProps) {
  return (
    <PanelCard title="Extracted Locations & Information">
      <dl className="space-y-4 text-sm">
        <div>
          <dt className="font-medium text-slate-400">Crisis Type</dt>
          <dd className="mt-1 text-slate-100">
            {nlp.crisisType ?? "Not detected"}
          </dd>
        </div>

        <div>
          <dt className="font-medium text-slate-400">Affected Population</dt>
          <dd className="mt-1 text-lg font-semibold text-white">
            {nlp.affectedPopulation?.toLocaleString() ?? "Not detected"}
          </dd>
        </div>

        <div>
          <dt className="font-medium text-slate-400">Extracted Locations</dt>
          <dd className="mt-2 space-y-2">
            {nlp.locations.length === 0 ? (
              <span className="text-amber-400">{LOCATION_LABELS.AWAITING}</span>
            ) : (
              nlp.locations.map((location, index) => {
                const verified =
                  location.confidence === undefined || location.confidence >= 0.5;
                const display = formatLocationDisplay(
                  location.name,
                  location.confidence
                );
                const statusLabel =
                  location.validationStatus === "pending"
                    ? LOCATION_LABELS.PENDING
                    : location.validationStatus === "geocoded" &&
                        location.confidence !== undefined &&
                        location.confidence < 0.55
                      ? LOCATION_LABELS.COUNTRY_CENTROID
                      : location.validationStatus === "verified" ||
                          (location.confidence !== undefined &&
                            location.confidence >= 0.5)
                        ? LOCATION_LABELS.VERIFIED
                        : null;
                const isPending = location.validationStatus === "pending";
                const hasCoords = !isPending && hasSafeCoordinates(location);
                return (
                  <div
                    key={`${location.name}-${location.latitude ?? "na"}-${location.longitude ?? "na"}-${index}`}
                    className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white">
                        {isUnverifiedLocationLabel(display) ? (
                          <span className="text-amber-400">{LOCATION_LABELS.AWAITING}</span>
                        ) : (
                          <LocationWithFlag location={display} />
                        )}
                      </span>
                      {location.confidence !== undefined && (
                        <span
                          className={`text-xs ${verified ? "text-emerald-400" : "text-amber-400"}`}
                        >
                          {Math.round(location.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      {statusLabel ? (
                        <span
                          className={`rounded px-1.5 py-0.5 ${
                            isPending
                              ? "bg-amber-500/10 text-amber-300"
                              : "bg-emerald-500/10 text-emerald-300"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      ) : location.validationStatus ? (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5">
                          {location.validationStatus}
                        </span>
                      ) : null}
                      {hasCoords ? (
                        <span>
                          {location.latitude!.toFixed(4)}, {location.longitude!.toFixed(4)}
                        </span>
                      ) : isPending ? (
                        <span className="text-amber-400">{LOCATION_LABELS.PENDING}</span>
                      ) : !isUnverifiedLocationLabel(display) ? (
                        <span className="text-amber-400">Coordinates pending</span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </dd>
        </div>

        <div>
          <dt className="font-medium text-slate-400">Humanitarian Needs</dt>
          <dd className="mt-2 space-y-2">
            {nlp.humanitarianNeeds.length === 0 ? (
              <span className="text-slate-500">No needs detected</span>
            ) : (
              nlp.humanitarianNeeds.map((need) => (
                <HumanitarianNeedCard key={need.needType} need={need} />
              ))
            )}
          </dd>
        </div>
      </dl>
    </PanelCard>
  );
}
