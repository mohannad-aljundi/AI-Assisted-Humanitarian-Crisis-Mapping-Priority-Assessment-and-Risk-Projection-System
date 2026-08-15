import type { EvidenceVerificationStatus } from "@/lib/evidenceVerificationStatus";
import {
  EVIDENCE_STATUS_STYLES,
  normalizeLegacyVerificationStatus,
} from "@/lib/evidenceVerificationStatus";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";

interface EvidenceVerificationCardProps {
  status: string;
  reason: string;
}

export function EvidenceVerificationCard({ status, reason }: EvidenceVerificationCardProps) {
  const normalized = normalizeLegacyVerificationStatus(status) as EvidenceVerificationStatus;
  const style = EVIDENCE_STATUS_STYLES[normalized];

  return (
    <div className={`${dashboardCard} border-cyan-500/15 bg-cyan-500/[0.04] p-6`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/80">
        Evidence Status
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${style}`}>
          {normalized}
        </span>
      </div>
      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Why this status
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{reason}</p>
      </div>
    </div>
  );
}
