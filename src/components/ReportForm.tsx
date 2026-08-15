"use client";

import { useState } from "react";
import type { SourceType } from "@prisma/client";
import { SectionCard } from "@/components/ui/SectionCard";
import { btnPrimary, inputDark, selectDark } from "@/lib/uiClasses";

const SOURCE_TYPES: SourceType[] = [
  "OFFICIAL",
  "MEDIA",
  "NGO",
  "SOCIAL",
  "FIELD",
  "OTHER",
];

interface ReportFormProps {
  isLoading: boolean;
  onSubmit: (data: {
    title: string;
    content: string;
    reportDate: string;
    sourceName: string;
    sourceType: SourceType;
    sourceCredibility: number;
    sourceUrl: string;
  }) => void;
}

export function ReportForm({ onSubmit, isLoading }: ReportFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("MEDIA");
  const [sourceCredibility, setSourceCredibility] = useState(0.7);
  const [sourceUrl, setSourceUrl] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      title,
      content,
      reportDate: new Date(reportDate).toISOString(),
      sourceName,
      sourceType,
      sourceCredibility,
      sourceUrl,
    });
  }

  return (
    <SectionCard
      title="Submit Report"
      description="Enter humanitarian crisis report text for NLP extraction and assessment."
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-medium text-slate-400">
            Report Title
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Flooding in Khartoum displaces thousands"
            className={inputDark}
          />
        </div>

        <div>
          <label htmlFor="content" className="mb-2 block text-sm font-medium text-slate-400">
            Report Content
          </label>
          <textarea
            id="content"
            required
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Enter the full humanitarian report text for analysis..."
            className={inputDark}
          />
        </div>

        <div>
          <label htmlFor="reportDate" className="mb-2 block text-sm font-medium text-slate-400">
            Report Date
          </label>
          <input
            id="reportDate"
            type="datetime-local"
            required
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
            className={inputDark}
          />
        </div>

        <fieldset className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <legend className="px-2 text-sm font-medium text-slate-300">
            Source (optional)
          </legend>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="sourceName" className="mb-2 block text-sm text-slate-500">
                Source Name
              </label>
              <input
                id="sourceName"
                type="text"
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                placeholder="UN OCHA"
                className={inputDark}
              />
            </div>

            <div>
              <label htmlFor="sourceType" className="mb-2 block text-sm text-slate-500">
                Source Type
              </label>
              <select
                id="sourceType"
                value={sourceType}
                onChange={(event) =>
                  setSourceType(event.target.value as SourceType)
                }
                className={selectDark}
              >
                {SOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sourceCredibility" className="mb-2 block text-sm text-slate-500">
                Credibility Score ({sourceCredibility.toFixed(2)})
              </label>
              <input
                id="sourceCredibility"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={sourceCredibility}
                onChange={(event) =>
                  setSourceCredibility(parseFloat(event.target.value))
                }
                className="w-full accent-blue-500"
              />
            </div>

            <div>
              <label htmlFor="sourceUrl" className="mb-2 block text-sm text-slate-500">
                Source URL
              </label>
              <input
                id="sourceUrl"
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://example.org/report"
                className={inputDark}
              />
            </div>
          </div>
        </fieldset>

        <button type="submit" disabled={isLoading} className={btnPrimary}>
          {isLoading ? "Analysing..." : "Analyse Report"}
        </button>
      </form>
    </SectionCard>
  );
}
