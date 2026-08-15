import type { SourceVerificationSummary } from "@/types";
import { CountryName } from "@/components/ui/CountryFlag";
import { SectionCard } from "@/components/ui/SectionCard";
import { ScoreBar } from "@/components/ui/ScoreBar";
import {
  assessEvidenceVerification,
  EVIDENCE_STATUS_STYLES,
  normalizeLegacyVerificationStatus,
} from "@/lib/evidenceVerificationStatus";

interface VerificationPanelProps {
  verification: SourceVerificationSummary | null;
  primarySourceName?: string;
  primaryCredibility?: number;
}

export function VerificationPanel({
  verification,
  primarySourceName = "Primary source",
  primaryCredibility = 0.5,
}: VerificationPanelProps) {
  if (!verification) {
    const evidence = assessEvidenceVerification({
      independentSourceCount: 1,
      agreementPercent: 0,
      primarySourceName,
      primaryCredibility,
    });
    return (
      <SectionCard title="Source Verification" description="Current evidence state">
        <EvidenceStatusBlock status={evidence.status} reason={evidence.reason} />
      </SectionCard>
    );
  }

  const agreementDisplay = Math.max(
    verification.sourceConsensusPercentage,
    verification.consensusScore
  );

  const evidence = assessEvidenceVerification({
    independentSourceCount: verification.comparedSources,
    agreementPercent: agreementDisplay,
    primarySourceName: verification.sourceNames[0] ?? primarySourceName,
    primaryCredibility,
    corroboratingSourceNames: verification.sourceNames,
  });

  return (
    <SectionCard title="Source Verification" description="Current evidence state">
      <EvidenceStatusBlock status={evidence.status} reason={evidence.reason} />

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500">
          {verification.city},{" "}
          <CountryName country={verification.country} className="inline-flex" /> ·{" "}
          {verification.crisisType}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Sources" value={String(verification.totalSources)} />
        <MetricCard label="Unique Sources" value={String(verification.comparedSources)} />
        <MetricCard label="Source Agreement" value={`${verification.sourceAgreementScore}%`} />
        <MetricCard
          label="Source Diversity"
          value={`${Math.round(verification.sourceDiversity * 100)}%`}
        />
      </div>

      <div className="mt-6 space-y-4">
        <ScoreBar
          label="Source Agreement"
          value={verification.sourceAgreementScore / 100}
          tone="blue"
        />
        <ScoreBar
          label="Information Consistency"
          value={verification.informationConsistencyScore / 100}
          tone="medium"
        />
        <ScoreBar label="Source Reliability" value={verification.sourceReliability} tone="low" />
        <ScoreBar label="Consensus Score" value={agreementDisplay / 100} tone="high" />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Contributing Sources
        </p>
        <div className="flex flex-wrap gap-2">
          {verification.sourceNames.map((name) => (
            <span
              key={name}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-slate-300"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function EvidenceStatusBlock({ status, reason }: { status: string; reason: string }) {
  const normalized = normalizeLegacyVerificationStatus(status);
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Evidence status
      </p>
      <span
        className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${EVIDENCE_STATUS_STYLES[normalized]}`}
      >
        {normalized}
      </span>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{reason}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  );
}
