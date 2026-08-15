"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SavedReportAnalysisResponse } from "@/types";
import type { SourceType } from "@prisma/client";
import { AppTopBar } from "@/components/ui/AppTopBar";
import { ReportForm } from "@/components/ReportForm";
import { alertError, pageContainer } from "@/lib/uiClasses";

export default function ReportsPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleAnalyse(data: {
    title: string;
    content: string;
    reportDate: string;
    sourceName: string;
    sourceType: SourceType;
    sourceCredibility: number;
    sourceUrl: string;
  }) {
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        title: data.title,
        content: data.content,
        reportDate: data.reportDate,
        source: data.sourceName
          ? {
              name: data.sourceName,
              type: data.sourceType,
              credibilityScore: data.sourceCredibility,
              url: data.sourceUrl || undefined,
            }
          : undefined,
      };

      const response = await fetch("/api/reports/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Analysis request failed");
      }

      const saved = result as SavedReportAnalysisResponse;

      if (!saved.saved || !saved.reportId) {
        throw new Error("Analysis completed but results were not saved");
      }

      router.push(`/incidents/${saved.reportId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis request failed");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppTopBar title="Report Management" />
      <div className={`app-page-content ${pageContainer}`}>
        <ReportForm onSubmit={handleAnalyse} isLoading={isLoading} />
        {error && <div className={alertError}>{error}</div>}
      </div>
    </div>
  );
}
