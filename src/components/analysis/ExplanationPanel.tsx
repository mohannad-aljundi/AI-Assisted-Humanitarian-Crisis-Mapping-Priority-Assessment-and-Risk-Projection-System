import type { AssessmentExplanation } from "@/types";
import { SectionCard } from "@/components/ui/SectionCard";

interface ExplanationPanelProps {
  title: string;
  explanation: AssessmentExplanation;
  accent?: "red" | "orange" | "yellow" | "blue" | "green";
}

const ACCENT_STYLES = {
  red: "border-red-500/30 bg-red-500/5",
  orange: "border-orange-500/30 bg-orange-500/5",
  yellow: "border-yellow-500/30 bg-yellow-500/5",
  blue: "border-cyan-500/30 bg-cyan-500/5",
  green: "border-emerald-500/30 bg-emerald-500/5",
};

export function ExplanationPanel({
  title,
  explanation,
  accent = "blue",
}: ExplanationPanelProps) {
  return (
    <SectionCard title={title}>
      <div className={`rounded-xl border p-4 ${ACCENT_STYLES[accent]}`}>
        <p className="text-base font-semibold text-white">{explanation.conclusion}</p>
        <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">Because:</p>
        <ul className="mt-3 space-y-2">
          {explanation.reasons.map((reason, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-slate-300">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
              {reason}
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}
