"use client";

import { useState } from "react";
import type { CorrectionField } from "@prisma/client";
import { dashboardCard } from "@/components/incidents/dashboard/incidentDashboardStyles";
import { btnPrimary, btnGhost } from "@/lib/uiClasses";

interface AnalystFeedbackPanelProps {
  reportId: string;
  currentPriority?: string;
  currentCrisisType?: string | null;
  currentReportPurpose?: string | null;
}

export function AnalystFeedbackPanel({
  reportId,
  currentPriority,
  currentCrisisType,
  currentReportPurpose,
}: AnalystFeedbackPanelProps) {
  const [field, setField] = useState<CorrectionField>("PRIORITY");
  const [correctedValue, setCorrectedValue] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const originalValue = (() => {
    switch (field) {
      case "PRIORITY":
        return currentPriority ?? "";
      case "CRISIS_TYPE":
        return currentCrisisType ?? "";
      case "REPORT_PURPOSE":
        return currentReportPurpose ?? "";
      default:
        return "";
    }
  })();

  async function submit() {
    if (!correctedValue.trim()) {
      setMessage("Corrected value is required.");
      setStatus("error");
      return;
    }

    setStatus("saving");
    setMessage(null);

    try {
      const res = await fetch(`/api/reports/${reportId}/learning/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: reason || undefined,
          corrections: [
            {
              field,
              originalValue,
              correctedValue: correctedValue.trim(),
              reason: reason.trim() || undefined,
              evidence: evidence.trim() || undefined,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      setStatus("saved");
      setMessage(
        `Learning example recorded (${data.examplesCreated} correction). This will inform future assessments transparently.`
      );
      setCorrectedValue("");
      setReason("");
      setEvidence("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Failed to save feedback");
    }
  }

  return (
    <section className={`${dashboardCard} space-y-4 p-6`}>
      <div>
        <h2 className="text-lg font-semibold text-white">Analyst Learning Feedback</h2>
        <p className="mt-1 text-sm text-slate-500">
          Corrections are stored permanently as learning examples — history is never overwritten.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-500">Field to correct</span>
          <select
            value={field}
            onChange={(e) => setField(e.target.value as CorrectionField)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
          >
            <option value="PRIORITY">Priority</option>
            <option value="RISK">Risk</option>
            <option value="RELIABILITY">Reliability</option>
            <option value="CRISIS_TYPE">Crisis Type</option>
            <option value="HUMANITARIAN_NEED">Humanitarian Need</option>
            <option value="REPORT_PURPOSE">Report Purpose</option>
            <option value="CRISIS_PHASE">Crisis Phase</option>
            <option value="CONFIDENCE">Confidence</option>
            <option value="DISASTER_SEVERITY">Disaster Severity</option>
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-500">Current AI value</span>
          <input
            readOnly
            value={String(originalValue)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-400"
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-slate-500">Corrected value</span>
        <input
          value={correctedValue}
          onChange={(e) => setCorrectedValue(e.target.value)}
          placeholder="Your expert correction"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-slate-500">Reason for correction</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Why is the AI assessment incorrect?"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-slate-500">Supporting evidence (optional)</span>
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          rows={2}
          placeholder="Quote or fact from the report"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
        />
      </label>

      {message && (
        <p
          className={`text-sm ${status === "error" ? "text-amber-300" : "text-emerald-300"}`}
          role="status"
        >
          {message}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={status === "saving"}
          className={btnPrimary}
        >
          {status === "saving" ? "Saving…" : "Submit learning example"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCorrectedValue("");
            setReason("");
            setEvidence("");
            setMessage(null);
            setStatus("idle");
          }}
          className={btnGhost}
        >
          Clear
        </button>
      </div>
    </section>
  );
}
