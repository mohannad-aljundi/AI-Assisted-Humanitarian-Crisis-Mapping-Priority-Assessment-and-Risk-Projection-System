"use client";

import { useState } from "react";
import type { EvaluationReportListItem } from "@/types/evaluation";
import {
  CORRELATION_STATUS_STYLES,
  type CorrelationVerificationStatus,
} from "@/lib/correlationVerificationStatus";
import {
  confirmationLabel,
  isConfirmationVerified,
  truncateVerificationText,
  VERIFICATION_PREVIEW_LENGTH,
  verificationFullText,
  verificationNeedsExpansion,
} from "@/lib/evaluationTableStatus";

interface EvaluationVerificationCellProps {
  report: EvaluationReportListItem;
}

export function EvaluationVerificationCell({ report }: EvaluationVerificationCellProps) {
  const [expanded, setExpanded] = useState(false);
  const label = confirmationLabel(report);
  const verified = isConfirmationVerified(report);
  const fullText = verificationFullText(report);
  const expandable = verificationNeedsExpansion(report);
  const style =
    CORRELATION_STATUS_STYLES[label as CorrelationVerificationStatus] ??
    "border-slate-500/30 bg-slate-500/10 text-slate-400";

  const displayText = expanded || !expandable
    ? fullText
    : truncateVerificationText(fullText, VERIFICATION_PREVIEW_LENGTH);

  const showExplanation = fullText.length > 0 && fullText !== label;

  return (
    <div
      className="min-w-0 max-w-full"
      onClick={(event) => event.stopPropagation()}
    >
      <span
        className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-tight ${style}`}
      >
        {verified ? <span aria-hidden className="shrink-0">✓</span> : null}
        {label}
      </span>

      {showExplanation ? (
        <p className="mt-1 break-words text-[10px] leading-relaxed text-slate-400">
          {displayText}
          {expandable ? (
            <>
              {" "}
              <button
                type="button"
                className="inline font-medium text-cyan-400 hover:text-cyan-300"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
