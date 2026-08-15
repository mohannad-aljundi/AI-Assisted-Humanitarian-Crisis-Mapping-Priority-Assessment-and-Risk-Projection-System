"use client";

import { memo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Brain, Shield } from "lucide-react";
import type { MasterIncidentIntelligenceView } from "@/types/masterIncidentIntelligence";
import { CORRELATION_STATUS_STYLES, type CorrelationVerificationStatus } from "@/lib/correlationVerificationStatus";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";
import { StatusBadge } from "@/components/ui/badges";
import { iconProps } from "@/components/ui/AppIcon";

interface MasterIncidentIntelligencePanelProps {
  intelligence: MasterIncidentIntelligenceView;
}

export const MasterIncidentIntelligencePanel = memo(function MasterIncidentIntelligencePanel({
  intelligence,
}: MasterIncidentIntelligencePanelProps) {
  const [expandedMatrix, setExpandedMatrix] = useState(false);
  const statusStyle =
    CORRELATION_STATUS_STYLES[
      intelligence.verification as CorrelationVerificationStatus
    ] ?? CORRELATION_STATUS_STYLES["Pending Review"];

  return (
    <div className={`${dashboardCard} border-cyan-500/25 bg-cyan-500/[0.04] p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
            <Brain {...iconProps} size={20} className="text-cyan-300" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">
              Master Incident Intelligence
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Unified assessment from {intelligence.memberCountAtAnalysis} linked reports ·{" "}
              {Math.round(intelligence.confidence * 100)}% confidence
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${statusStyle}`}>
          <Shield {...iconProps} size={14} />
          {intelligence.verification}
        </span>
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Executive summary</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-200">{intelligence.executiveSummary}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Agreement" value={`${Math.round(intelligence.consensus.agreementPercent)}%`} />
        <Metric label="Conflict" value={`${Math.round(intelligence.consensus.conflictPercent)}%`} />
        <Metric label="Independent sources" value={String(intelligence.consensus.independentSourceCount)} />
        <Metric label="Trusted sources" value={String(intelligence.consensus.trustedSourceCount)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <StatusBadge level={intelligence.dynamicPriority.level} />
        <span className="text-xs text-slate-500">{intelligence.dynamicPriority.reasoning}</span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Section title="Situation assessment">
          <p className="text-sm text-slate-300">{intelligence.situationAssessment.whatHappened}</p>
          <p className="mt-2 text-xs text-slate-500">
            Severity: {intelligence.situationAssessment.severity}
          </p>
          <p className="mt-1 text-xs text-slate-400">{intelligence.situationAssessment.currentImpact}</p>
        </Section>
        <Section title="AI reasoning">
          <p className="text-sm leading-relaxed text-slate-300">{intelligence.analystNarrative}</p>
        </Section>
      </div>

      <button
        type="button"
        onClick={() => setExpandedMatrix((value) => !value)}
        className="mt-5 flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-slate-200"
      >
        <span>Evidence matrix ({intelligence.evidenceMatrix.length} conclusions)</span>
        {expandedMatrix ? (
          <ChevronUp {...iconProps} size={18} className="text-slate-400" />
        ) : (
          <ChevronDown {...iconProps} size={18} className="text-slate-400" />
        )}
      </button>

      {expandedMatrix ? (
        <div className="mt-3 space-y-2">
          {intelligence.evidenceMatrix.map((entry) => (
            <div key={entry.conclusion} className="rounded-xl border border-white/6 px-4 py-3">
              <p className="text-sm font-medium text-white">{entry.conclusion}</p>
              <p className="mt-1 text-xs text-slate-400">
                Observed by: {entry.observedBy.join(", ") || "N/A"} ·{" "}
                {Math.round(entry.confidence * 100)}% confidence ·{" "}
                {Math.round(entry.evidenceStrength * 100)}% strength
              </p>
              {entry.contradictingReports.length > 0 ? (
                <p className="mt-1 text-xs text-amber-300">
                  Contradictions: {entry.contradictingReports.join("; ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Risk projection</p>
        <p className="mt-2 text-sm text-slate-300">{intelligence.riskProjection.riskNarrative}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Reason label="Now" text={intelligence.riskProjection.currentRiskReason} />
          <Reason label="24h" text={intelligence.riskProjection.forecast24hReason} />
          <Reason label="72h" text={intelligence.riskProjection.forecast72hReason} />
          <Reason label="7d" text={intelligence.riskProjection.forecast7dReason} />
        </div>
      </div>
    </div>
  );
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Reason({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-cyan-400/80">{label}</p>
      <p className="mt-1 text-xs text-slate-400">{text}</p>
    </div>
  );
}
