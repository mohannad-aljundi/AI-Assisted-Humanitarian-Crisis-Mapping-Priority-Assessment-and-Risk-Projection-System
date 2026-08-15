import Link from "next/link";
import { MapPin } from "lucide-react";
import type { DashboardIncident } from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import { formatIncidentLocation } from "@/lib/locationDisplay";
import {
  CORRELATION_STATUS_STYLES,
  type CorrelationVerificationStatus,
} from "@/lib/correlationVerificationStatus";
import { iconProps } from "@/components/ui/AppIcon";
import { CrisisTypeIcon } from "@/components/dashboard/CrisisTypeIcon";
import { CrisisTypeBadge } from "@/components/ui/CrisisTypeBadge";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { CountryFlag } from "@/components/ui/CountryFlag";

interface IncidentCardProps {
  incident: DashboardIncident;
}

export function IncidentCard({ incident }: IncidentCardProps) {
  const location = formatIncidentLocation(incident.cityName, incident.countryName);

  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="group flex gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-4 transition-all duration-200 hover:border-blue-500/30 hover:bg-blue-500/[0.06] hover:shadow-[0_4px_20px_rgba(59,130,246,0.08)]"
    >
      <CrisisTypeIcon
        iconKey={incident.crisisIconKey}
        crisisType={incident.crisisType}
        riskLevel={incident.riskLevel}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h4 className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-white group-hover:text-blue-100">
            {incident.title}
          </h4>
          <RiskBadge level={incident.riskLevel} className="shrink-0" />
        </div>
        {incident.correlationVerificationStatus ? (
          <span
            className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              CORRELATION_STATUS_STYLES[
                incident.correlationVerificationStatus as CorrelationVerificationStatus
              ]
            }`}
          >
            {incident.correlationVerificationStatus}
          </span>
        ) : null}
        {(incident.supportingReportCount ?? 0) > 1 ? (
          <p className="text-xs text-violet-300/90">
            {incident.supportingReportCount} linked reports ·{" "}
            {incident.independentSourceCount ?? 1} sources ·{" "}
            {Math.round(incident.sourceAgreementPercent ?? 0)}% agreement
          </p>
        ) : null}
        {incident.crisisType ? (
          <CrisisTypeBadge crisisType={incident.crisisType} className="w-fit" />
        ) : null}
        {location ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <MapPin {...iconProps} size={14} className="shrink-0 text-slate-500" />
            <CountryFlag country={incident.countryName} location={location} className="text-sm" />
            <span className="truncate">{location}</span>
          </p>
        ) : null}
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {formatRelativeTime(incident.analysedAt)}
        </p>
      </div>
    </Link>
  );
}
