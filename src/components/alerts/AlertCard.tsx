"use client";

import Link from "next/link";
import { MapPin, ExternalLink } from "lucide-react";
import type { DashboardAlert } from "@/types";
import { getCrisisIconKey } from "@/lib/crisisIcons";
import { formatAlertLocation } from "@/lib/locationDisplay";
import { formatRelativeTime } from "@/lib/utils";
import { iconProps } from "@/components/ui/AppIcon";
import { CrisisIcon } from "@/components/crisis/CrisisIcon";
import { StatusBadge } from "@/components/ui/badges";
import {
  assessEvidenceVerification,
  EVIDENCE_STATUS_STYLES,
} from "@/lib/evidenceVerificationStatus";
import {
  CORRELATION_STATUS_STYLES,
  type CorrelationVerificationStatus,
} from "@/lib/correlationVerificationStatus";
import { CrisisTypeBadge } from "@/components/ui/CrisisTypeBadge";
import { RiskBadge } from "@/components/dashboard/RiskBadge";
import { CountryFlag } from "@/components/ui/CountryFlag";

interface AlertCardProps {
  alert: DashboardAlert;
}

export function AlertCard({ alert }: AlertCardProps) {
  const location = formatAlertLocation(alert.city, alert.country);
  const detailsHref = alert.reportId ? `/incidents/${alert.reportId}` : "/alerts";
  const mapHref = alert.reportId
    ? `/crisis-map?focus=${alert.reportId}`
    : "/crisis-map";
  const evidence = assessEvidenceVerification({
    independentSourceCount: alert.sourceCount ?? 1,
    agreementPercent: alert.sourceCount && alert.sourceCount > 1 ? 70 : 0,
    primarySourceName: "primary source",
    primaryCredibility: alert.reliabilityScore ?? 0.5,
  });
  const evidenceStyle = EVIDENCE_STATUS_STYLES[evidence.status];
  const correlationStyle = alert.correlationVerificationStatus
    ? CORRELATION_STATUS_STYLES[
        alert.correlationVerificationStatus as CorrelationVerificationStatus
      ]
    : null;

  return (
    <article className="rounded-xl border border-white/10 bg-slate-900/50 p-4 transition hover:border-cyan-500/25 hover:bg-slate-900/80">
      <div className="flex items-start gap-3">
        <CrisisIcon
          iconKey={getCrisisIconKey(alert.crisisType)}
          crisisType={alert.crisisType}
          riskLevel={alert.riskLevel}
          size={24}
          className="h-11 w-11 shrink-0 text-xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <CountryFlag country={alert.country} />
              <span className="min-w-0">{alert.title}</span>
            </h3>
            <RiskBadge level={alert.riskLevel} />
          </div>

          <p className="mt-1 line-clamp-2 text-xs text-slate-400">{alert.description}</p>

          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <MapPin {...iconProps} size={14} className="shrink-0 text-slate-500" />
            <span className="truncate">{location}</span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CrisisTypeBadge crisisType={alert.crisisType} />
            {alert.priorityLevel && <StatusBadge level={alert.priorityLevel} />}
            {alert.reliabilityScore !== undefined && (
              <span className="text-[10px] font-medium text-emerald-400">
                {Math.round(alert.reliabilityScore * 100)}% reliable
              </span>
            )}
            {alert.sourceCount !== undefined && alert.sourceCount > 0 && (
              <span className="text-[10px] text-slate-500">
                {alert.sourceCount} source{alert.sourceCount !== 1 ? "s" : ""}
              </span>
            )}
            <span
              className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${evidenceStyle}`}
            >
              {evidence.status}
            </span>
            {alert.correlationVerificationStatus && correlationStyle ? (
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${correlationStyle}`}
              >
                {alert.correlationVerificationStatus}
              </span>
            ) : null}
            <span className="ml-auto text-[10px] text-slate-600">
              {formatRelativeTime(alert.createdAt)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={detailsHref}
              className="map-control-btn map-control-btn--primary inline-flex items-center gap-1.5"
            >
              <ExternalLink {...iconProps} size={14} />
              Open Details
            </Link>
            <Link href={mapHref} className="map-control-btn inline-flex items-center gap-1.5">
              <MapPin {...iconProps} size={14} />
              Locate on Map
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
