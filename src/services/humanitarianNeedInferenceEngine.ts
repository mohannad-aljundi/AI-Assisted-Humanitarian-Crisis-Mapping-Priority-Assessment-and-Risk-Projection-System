import { callAiJson, isAiAvailable, isAiConfigured } from "@/lib/aiResolver";
import {
  ANALYST_SYSTEM_INSTRUCTION,
  buildHumanitarianReasoningContext,
  buildStructuredAnalystPrompt,
  filterNeedsByReasoningContext,
  mergeAiReasoningContext,
  shouldUseLastResortScenarioPackage,
  type HumanitarianReasoningContext,
} from "@/lib/humanitarianAnalystReasoning";
import { continuousHumanitarianLearningEngine } from "@/services/continuousHumanitarianLearningEngine";
import { NEED_INFERENCE_RULES } from "@/lib/intelligenceConstants";
import {
  HUMANITARIAN_NEED_TAXONOMY,
  canonicalNeedKey,
  dedupeExtractedHumanitarianNeeds,
  normaliseNeedName,
  scenarioPackageToExtractedNeeds,
} from "@/lib/humanitarianNeedTaxonomy";
import type { ExtractedHumanitarianNeed } from "@/types";

export type NeedInferenceSource = "Observed" | "Inferred";

export interface InferredHumanitarianNeed {
  need: string;
  evidence: string;
  reasoning: string;
  confidence: number;
  source: NeedInferenceSource;
}

export interface NeedInferenceOptions {
  reportId?: string;
}

export interface NeedInferenceResult {
  needs: ExtractedHumanitarianNeed[];
  reasoningContext: HumanitarianReasoningContext;
}

export { HUMANITARIAN_NEED_TAXONOMY } from "@/lib/humanitarianNeedTaxonomy";

function normaliseConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function confidenceToSeverity(confidence: number): ExtractedHumanitarianNeed["severity"] {
  if (confidence >= 0.9) return "Critical";
  if (confidence >= 0.7) return "High";
  if (confidence >= 0.45) return "Medium";
  return "Low";
}

function extractNeedItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];

  const data = raw as Record<string, unknown>;
  if (Array.isArray(data.needs)) return data.needs;
  if (Array.isArray(data.humanitarianNeeds)) return data.humanitarianNeeds;

  const observed = Array.isArray(data.observedNeeds) ? data.observedNeeds : [];
  const inferred = Array.isArray(data.inferredNeeds) ? data.inferredNeeds : [];
  if (observed.length > 0 || inferred.length > 0) {
    return [...observed, ...inferred];
  }
  return [];
}

function parseNeedItem(
  item: unknown,
  defaultSource: NeedInferenceSource = "Inferred"
): InferredHumanitarianNeed | null {
  if (!item || typeof item !== "object") return null;
  const need = item as Record<string, unknown>;
  const name = need.need ?? need.needType ?? need.name ?? need.type;
  if (typeof name !== "string" || !name.trim()) return null;

  const sourceRaw = String(need.source ?? defaultSource);
  const source: NeedInferenceSource =
    sourceRaw.toLowerCase() === "observed" ? "Observed" : "Inferred";

  const evidence =
    typeof need.evidence === "string" && need.evidence.trim()
      ? need.evidence.trim()
      : "";
  const reasoning =
    typeof need.reasoning === "string" && need.reasoning.trim()
      ? need.reasoning.trim()
      : typeof need.reason === "string" && need.reason.trim()
        ? need.reason.trim()
        : "";

  if (!evidence && source === "Observed") return null;
  if (!evidence && !reasoning) return null;

  return {
    need: normaliseNeedName(name),
    evidence: evidence || reasoning,
    reasoning: reasoning || evidence,
    confidence: normaliseConfidence(need.confidence),
    source,
  };
}

function parseAiNeeds(raw: unknown): InferredHumanitarianNeed[] {
  const items = extractNeedItems(raw);
  const results: InferredHumanitarianNeed[] = [];

  for (const item of items) {
    const parsed = parseNeedItem(item);
    if (parsed) results.push(parsed);
  }

  return results;
}

export function mergeAndDedupeNeeds(
  needs: InferredHumanitarianNeed[]
): InferredHumanitarianNeed[] {
  const byKey = new Map<string, InferredHumanitarianNeed>();

  for (const item of needs) {
    const key = canonicalNeedKey(item.need);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { ...item });
      continue;
    }

    const higherConfidence = item.confidence >= existing.confidence ? item : existing;
    const lowerConfidence = item.confidence >= existing.confidence ? existing : item;

    byKey.set(key, {
      ...higherConfidence,
      evidence: [higherConfidence.evidence, lowerConfidence.evidence]
        .filter((e, i, arr) => arr.indexOf(e) === i)
        .join("; "),
      source:
        existing.source === "Observed" || item.source === "Observed"
          ? "Observed"
          : higherConfidence.source,
    });
  }

  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
}

function toExtractedNeed(item: InferredHumanitarianNeed): ExtractedHumanitarianNeed {
  return {
    needType: item.need,
    severity: confidenceToSeverity(item.confidence),
    reason: item.reasoning,
    source: item.source,
    evidence: item.evidence,
    reasoning: item.reasoning,
    confidence: item.confidence,
  };
}

/** Evidence-linked rule pass — no crisis-type packages or hazard blanket inference. */
function applyEvidenceLinkedRules(content: string): InferredHumanitarianNeed[] {
  const needs: InferredHumanitarianNeed[] = [];
  const seen = new Set<string>();

  const add = (
    need: string,
    evidence: string,
    reasoning: string,
    confidence: number,
    source: NeedInferenceSource
  ) => {
    const key = canonicalNeedKey(normaliseNeedName(need));
    if (seen.has(key)) return;
    seen.add(key);
    needs.push({
      need: normaliseNeedName(need),
      evidence,
      reasoning,
      confidence,
      source,
    });
  };

  for (const rule of NEED_INFERENCE_RULES) {
    const match = content.match(rule.pattern);
    if (match) {
      add(
        rule.need,
        `Report states: "${match[0]}"`,
        rule.reason,
        0.88,
        "Observed"
      );
    }
  }

  const observedPatterns: Array<{
    pattern: RegExp;
    need: string;
    reasoning: string;
  }> = [
    {
      pattern: /\b(?:water\s+shortage|without\s+(?:clean\s+)?water|no\s+(?:clean\s+)?water|contaminated\s+water)\b/i,
      need: "Water",
      reasoning: "The report explicitly describes drinking water availability problems.",
    },
    {
      pattern: /\b(?:food\s+insecurity|without\s+food|food\s+shortage|starving|starvation|malnutrition)\b/i,
      need: "Food",
      reasoning: "The report explicitly describes food insecurity or lack of food.",
    },
    {
      pattern: /\b(?:displaced|evacuat(?:ed|ion)|homeless|living\s+in\s+(?:camps|shelters)|refugee\s+camps?)\b/i,
      need: "Displacement Support",
      reasoning: "The report explicitly describes population displacement.",
    },
    {
      pattern: /\b(?:destroyed\s+(?:homes|houses|buildings)|building\s+collapse|collapsed\s+buildings|homes\s+destroyed)\b/i,
      need: "Shelter",
      reasoning: "Destroyed housing is explicitly described, implying shelter needs.",
    },
    {
      pattern: /\b(?:hospital(?:s)?\s+(?:destroyed|damaged|overwhelmed)|medical\s+facilit(?:y|ies)\s+(?:destroyed|damaged))\b/i,
      need: "Medical Aid",
      reasoning: "Medical facility damage or overload is explicitly described.",
    },
    {
      pattern: /\b(?:search\s+and\s+rescue|rescue\s+operations|trapped\s+under)\b/i,
      need: "Search & Rescue",
      reasoning: "Search and rescue operations are explicitly mentioned.",
    },
    {
      pattern: /\b(?:bridge\s+collapsed|roads?\s+(?:blocked|damaged|destroyed)|supply\s+routes?\s+(?:cut|blocked))\b/i,
      need: "Logistics",
      reasoning: "Infrastructure damage to routes may disrupt humanitarian logistics.",
    },
    {
      pattern: /\b(?:power\s+outage|without\s+electricity|grid\s+(?:down|failure)|blackout)\b/i,
      need: "Power/Electricity",
      reasoning: "Power disruption is explicitly described.",
    },
    {
      pattern: /\b(?:distributed\s+(?:food|water|medicine)|aid\s+delivered|relief\s+supplies)\b/i,
      need: "Logistics",
      reasoning: "Aid delivery activity implies ongoing logistics requirements.",
    },
  ];

  for (const entry of observedPatterns) {
    const match = content.match(entry.pattern);
    if (match) {
      add(entry.need, `Report states: "${match[0]}"`, entry.reasoning, 0.9, "Observed");
    }
  }

  if (
    /\b(?:destroyed\s+(?:homes|houses|buildings)|building\s+collapse)\b/i.test(content) &&
    !seen.has(canonicalNeedKey("Search & Rescue"))
  ) {
    add(
      "Search & Rescue",
      "Structural collapse described in report",
      "Building collapse may require search and rescue even if not explicitly named",
      0.72,
      "Inferred"
    );
  }

  if (
    /\b(?:hospital(?:s)?\s+destroyed)\b/i.test(content) &&
    !seen.has(canonicalNeedKey("Medical Supplies"))
  ) {
    add(
      "Medical Supplies",
      "Hospitals destroyed",
      "Destroyed hospitals imply medical supply shortages for remaining care points",
      0.72,
      "Inferred"
    );
  }

  if (
    /\b(?:mass\s+displacement|thousands\s+displaced|families\s+displaced)\b/i.test(content) &&
    !seen.has(canonicalNeedKey("Shelter"))
  ) {
    add(
      "Shelter",
      "Mass displacement described",
      "Large-scale displacement implies emergency shelter demand",
      0.75,
      "Inferred"
    );
  }

  return needs;
}

function seedFromExisting(existing: ExtractedHumanitarianNeed[]): InferredHumanitarianNeed[] {
  return existing
    .filter((need) => need.evidence || need.reason || need.reasoning)
    .map((need) => ({
      need: normaliseNeedName(need.needType),
      evidence: need.evidence ?? need.reason ?? "Identified from preliminary text analysis",
      reasoning:
        need.reasoning ??
        need.reason ??
        "Matched from report keywords or preliminary extraction",
      confidence: need.confidence ?? (need.source === "Observed" ? 0.85 : 0.6),
      source: (need.source ?? "Observed") as NeedInferenceSource,
    }));
}

function buildEvidenceBaseline(
  content: string,
  existingNeeds: ExtractedHumanitarianNeed[]
): InferredHumanitarianNeed[] {
  return mergeAndDedupeNeeds([
    ...seedFromExisting(existingNeeds),
    ...applyEvidenceLinkedRules(content),
  ]);
}

async function fetchAiNeedsWithRetry(
  title: string,
  content: string,
  crisisType: string | null,
  context: HumanitarianReasoningContext,
  existingNeeds: ExtractedHumanitarianNeed[],
  learningPromptSection: string
): Promise<{ needs: InferredHumanitarianNeed[]; raw: unknown }> {
  const basePrompt = buildStructuredAnalystPrompt({
    title,
    content,
    crisisType,
    context,
    taxonomy: HUMANITARIAN_NEED_TAXONOMY,
    preliminaryNeeds: existingNeeds.map((n) => n.needType),
  });
  const prompt = learningPromptSection
    ? `${basePrompt}\n\n${learningPromptSection}`
    : basePrompt;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callAiJson(prompt, ANALYST_SYSTEM_INSTRUCTION);
      return { needs: parseAiNeeds(raw), raw };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[HumanitarianNeedInference] AI attempt ${attempt}/2 failed for "${title}": ${message}`
      );
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export class HumanitarianNeedInferenceEngine {
  isConfigured(): boolean {
    return isAiConfigured();
  }

  async infer(
    title: string,
    content: string,
    crisisType: string | null = null,
    existingNeeds: ExtractedHumanitarianNeed[] = [],
    options?: NeedInferenceOptions
  ): Promise<NeedInferenceResult> {
    let reasoningContext = buildHumanitarianReasoningContext(title, content, crisisType);

    const learningContext = await continuousHumanitarianLearningEngine.buildLearningContext({
      reportId: options?.reportId,
      title,
      content,
      crisisType,
      reportPurpose: reasoningContext.reportPurpose,
      crisisPhase: reasoningContext.crisisPhase,
      needs: existingNeeds,
    });
    const learningPromptSection =
      continuousHumanitarianLearningEngine.buildCaseBasedPromptSection(learningContext);

    const evidenceBaseline = buildEvidenceBaseline(content, existingNeeds);
    let aiNeeds: InferredHumanitarianNeed[] = [];
    let aiRaw: unknown = null;

    if (isAiAvailable()) {
      try {
        const aiResult = await fetchAiNeedsWithRetry(
          title,
          content,
          crisisType,
          reasoningContext,
          existingNeeds,
          learningPromptSection
        );
        aiNeeds = aiResult.needs;
        aiRaw = aiResult.raw;
        reasoningContext = mergeAiReasoningContext(reasoningContext, aiRaw);
        console.log(
          `[HumanitarianNeedInference] AI returned ${aiNeeds.length} evidence-based needs for "${title}"`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[HumanitarianNeedInference] AI unavailable for "${title}": ${message}`
        );
      }
    }

    const merged = mergeAndDedupeNeeds([...aiNeeds, ...evidenceBaseline]);
    let extracted = dedupeExtractedHumanitarianNeeds(merged.map(toExtractedNeed));
    extracted = filterNeedsByReasoningContext(extracted, reasoningContext);
    extracted = continuousHumanitarianLearningEngine.applyConfidenceCalibration(
      extracted,
      learningContext
    );

    reasoningContext = {
      ...reasoningContext,
      analystSummary: `${reasoningContext.analystSummary} ${learningContext.learningInfluenceSummary}`.trim(),
    };

    if (extracted.length === 0 && shouldUseLastResortScenarioPackage(reasoningContext, title, content)) {
      console.warn(
        `[HumanitarianNeedInference] Last-resort scenario package for "${title}" — insufficient evidence after analyst reasoning`
      );
      extracted = dedupeExtractedHumanitarianNeeds(
        scenarioPackageToExtractedNeeds(title, content, crisisType, { lastResort: true })
      );
      reasoningContext = { ...reasoningContext, usedLastResortPackage: true };
    }

    if (extracted.length === 0) {
      console.log(
        `[HumanitarianNeedInference] No humanitarian needs assigned for "${title}" — ` +
          `context=${reasoningContext.reportPurpose}, phase=${reasoningContext.crisisPhase}`
      );
    }

    return { needs: extracted, reasoningContext };
  }
}

export const humanitarianNeedInferenceEngine = new HumanitarianNeedInferenceEngine();
