import { callAiJson, isAiAvailable, isAiConfigured } from "@/lib/aiResolver";
import {
  deriveIncidentLabelFallback,
  generateRuleBasedIncidentLabel,
  normalizeIncidentLabel,
  type IncidentLabelInput,
} from "@/lib/incidentLabelGenerator";

const SYSTEM_INSTRUCTION = `You generate concise intelligence incident labels for humanitarian operations dashboards.
Rules:
- Return exactly 2-3 words.
- Summarize the incident, never truncate the headline.
- Use patterns like "Venezuela Earthquake", "Medical Emergency", "Sudan Conflict", "Water Shortage".
- Return JSON only: { "label": "..." }`;

export class IncidentLabelService {
  async generateLabel(input: IncidentLabelInput): Promise<string> {
    const ruleLabel = generateRuleBasedIncidentLabel(input);

    if (!isAiAvailable()) {
      return ruleLabel;
    }

    try {
      const needs = input.humanitarianNeeds?.slice(0, 5).join(", ") ?? "none";
      const prompt = `Headline (do not copy): ${input.headline}
Crisis type: ${input.crisisType ?? "unknown"}
Location: ${input.location ?? "unknown"}
Country: ${input.country ?? "unknown"}
Humanitarian needs: ${needs}
Priority: ${input.priorityLevel ?? "unknown"}
Rule-based suggestion: ${ruleLabel}`;

      const result = (await callAiJson(prompt, SYSTEM_INSTRUCTION)) as {
        label?: string;
      };

      if (result?.label?.trim()) {
        return normalizeIncidentLabel(result.label);
      }
    } catch (error) {
      console.warn(
        "[IncidentLabel] AI label generation failed, using rule-based label:",
        error instanceof Error ? error.message : error
      );
    }

    return ruleLabel;
  }
}

export const incidentLabelService = new IncidentLabelService();

export { deriveIncidentLabelFallback, type IncidentLabelInput };
