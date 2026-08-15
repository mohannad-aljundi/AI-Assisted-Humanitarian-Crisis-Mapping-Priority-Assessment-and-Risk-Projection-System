"use client";

import { EvaluationReportsPanel } from "@/components/evaluation/EvaluationReportsPanel";

export function AnalysisReportsPanel() {
  return (
    <EvaluationReportsPanel
      title="Analysed Reports"
      description="Browse all reports with persisted analysis. Search, filter, and open the incident intelligence report."
      viewLabel="View"
      viewHref={(reportId) => `/incidents/${reportId}`}
    />
  );
}
