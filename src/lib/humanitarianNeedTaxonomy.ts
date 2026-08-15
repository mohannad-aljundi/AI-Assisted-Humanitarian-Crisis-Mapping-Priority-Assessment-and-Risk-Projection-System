import type { ExtractedHumanitarianNeed } from "@/types";

/**
 * Single source of truth for humanitarian need labels across AI, rules, DB, and UI.
 * Aliases collapse variants like "Search and Rescue" / "Clean Water" / "Medical Assistance".
 */
export const HUMANITARIAN_NEED_TAXONOMY = [
  "Search & Rescue",
  "Flooding",
  "Displacement Support",
  "Medical Aid",
  "Water",
  "Food",
  "Shelter",
  "Power/Electricity",
  "Logistics",
  "Sanitation",
  "Hygiene",
  "Vaccination",
  "Child Protection",
  "Psychological Support",
  "Protection",
  "Trauma Care",
  "Emergency Medical Care",
  "Medical Supplies",
  "Emergency Supplies",
  "Non-food Items",
  "Fuel",
  "Communication",
  "Education",
  "Humanitarian Coordination",
  "Health Monitoring",
  "Infrastructure",
  "Disease Outbreak",
] as const;

export type CanonicalNeedName = (typeof HUMANITARIAN_NEED_TAXONOMY)[number];

export type CrisisScenario = "earthquake" | "flood" | "conflict" | "disease";

export const HUMANITARIAN_INCIDENT_SIGNALS: RegExp[] = [
  /\bearthquake\b/i,
  /\bflood(?:ing|ed)?\b/i,
  /\bconflict\b/i,
  /\bwar\b/i,
  /\bfighting\b/i,
  /\bshelling\b/i,
  /\bairstrike\b/i,
  /\bdisplaced\b/i,
  /\brefugee\b/i,
  /\bevacuat/i,
  /\bcasualt/i,
  /\b(?:killed|deaths?|died|injured|wounded)\b/i,
  /\bcollapsed?\s+buildings?\b/i,
  /\bdestroyed\s+(?:homes?|hospitals?|schools?|infrastructure)\b/i,
  /\bhospital(?:s)?\s+(?:damaged|destroyed|overwhelmed)\b/i,
  /\binfrastructure\s+damage\b/i,
  /\bdisease\s+outbreak\b/i,
  /\bepidemic\b/i,
  /\bcholera\b/i,
  /\bhumanitarian\s+emergency\b/i,
  /\bhumanitarian\s+crisis\b/i,
  /\bmagnitude\s+[0-9]/i,
  /\bseismic\b/i,
];

const NEED_ALIASES: Record<string, CanonicalNeedName> = {
  medical: "Medical Aid",
  "medical aid": "Medical Aid",
  "medical assistance": "Medical Aid",
  "medical response": "Medical Aid",
  healthcare: "Medical Aid",
  health: "Medical Aid",
  hospital: "Medical Aid",
  "emergency medical": "Emergency Medical Care",
  "emergency medical care": "Emergency Medical Care",
  "emergency medical response": "Emergency Medical Care",
  "medical supplies": "Medical Supplies",
  medicines: "Medical Supplies",
  "search and rescue": "Search & Rescue",
  "search & rescue": "Search & Rescue",
  sar: "Search & Rescue",
  rescue: "Search & Rescue",
  water: "Water",
  "clean water": "Water",
  "drinking water": "Water",
  electricity: "Power/Electricity",
  energy: "Power/Electricity",
  power: "Power/Electricity",
  "power/electricity": "Power/Electricity",
  "power restoration": "Power/Electricity",
  flood: "Flooding",
  flooding: "Flooding",
  inundation: "Flooding",
  displacement: "Displacement Support",
  "displacement support": "Displacement Support",
  shelter: "Shelter",
  housing: "Shelter",
  food: "Food",
  "food assistance": "Food",
  "food insecurity": "Food",
  nutrition: "Food",
  sanitation: "Sanitation",
  hygiene: "Hygiene",
  wash: "Sanitation",
  "water & sanitation": "Sanitation",
  logistics: "Logistics",
  "supply chain": "Logistics",
  vaccination: "Vaccination",
  immunization: "Vaccination",
  immunisation: "Vaccination",
  "child protection": "Child Protection",
  protection: "Protection",
  trauma: "Trauma Care",
  "mental health": "Psychological Support",
  counselling: "Psychological Support",
  counseling: "Psychological Support",
  communications: "Communication",
  communication: "Communication",
  nfi: "Non-food Items",
  "non-food items": "Non-food Items",
  "non food items": "Non-food Items",
  "emergency supplies": "Emergency Supplies",
  coordination: "Humanitarian Coordination",
  "humanitarian coordination": "Humanitarian Coordination",
  "health monitoring": "Health Monitoring",
  surveillance: "Health Monitoring",
  "disease outbreak": "Disease Outbreak",
  epidemic: "Disease Outbreak",
  cholera: "Disease Outbreak",
  outbreak: "Disease Outbreak",
  fuel: "Fuel",
  education: "Education",
  infrastructure: "Infrastructure",
};

export const CRISIS_SCENARIO_PACKAGES: Record<
  CrisisScenario,
  Array<{ need: CanonicalNeedName; reasoning: string; confidence: number }>
> = {
  earthquake: [
    {
      need: "Search & Rescue",
      reasoning: "Earthquakes trap people under rubble requiring search and rescue operations",
      confidence: 0.92,
    },
    {
      need: "Shelter",
      reasoning: "Destroyed housing leaves families without shelter",
      confidence: 0.9,
    },
    {
      need: "Water",
      reasoning: "Water systems are often damaged after major earthquakes",
      confidence: 0.88,
    },
    {
      need: "Food",
      reasoning: "Disrupted supply chains and displacement increase food needs",
      confidence: 0.85,
    },
    {
      need: "Medical Aid",
      reasoning: "Traumatic injuries and overwhelmed hospitals require medical surge capacity",
      confidence: 0.92,
    },
    {
      need: "Power/Electricity",
      reasoning: "Grid damage commonly follows seismic events",
      confidence: 0.8,
    },
    {
      need: "Logistics",
      reasoning: "Debris and damaged roads constrain humanitarian access",
      confidence: 0.82,
    },
  ],
  flood: [
    {
      need: "Flooding",
      reasoning: "Active flooding is the primary hazard driving humanitarian needs",
      confidence: 0.93,
    },
    {
      need: "Water",
      reasoning: "Flooding contaminates water sources — safe water is critical",
      confidence: 0.92,
    },
    {
      need: "Food",
      reasoning: "Crop loss and isolation increase acute food needs",
      confidence: 0.88,
    },
    {
      need: "Shelter",
      reasoning: "Flooded homes force evacuation and temporary shelter",
      confidence: 0.9,
    },
    {
      need: "Medical Aid",
      reasoning: "Drowning, injury, and waterborne illness require medical response",
      confidence: 0.85,
    },
    {
      need: "Sanitation",
      reasoning: "Standing water and displacement raise WASH and disease risks",
      confidence: 0.86,
    },
  ],
  conflict: [
    {
      need: "Displacement Support",
      reasoning: "Armed conflict displaces civilians who need protection and support",
      confidence: 0.9,
    },
    {
      need: "Medical Aid",
      reasoning: "Armed conflict produces casualties requiring medical care",
      confidence: 0.9,
    },
    {
      need: "Food",
      reasoning: "Conflict disrupts markets and agricultural production",
      confidence: 0.85,
    },
    {
      need: "Logistics",
      reasoning: "Insecurity and damaged routes impede aid delivery",
      confidence: 0.84,
    },
    {
      need: "Child Protection",
      reasoning: "Children face elevated protection risks during conflict",
      confidence: 0.82,
    },
  ],
  disease: [
    {
      need: "Medical Aid",
      reasoning: "Disease outbreaks require expanded clinical response",
      confidence: 0.92,
    },
    {
      need: "Vaccination",
      reasoning: "Outbreak control often depends on immunisation campaigns",
      confidence: 0.85,
    },
    {
      need: "Hygiene",
      reasoning: "Hygiene promotion reduces transmission in outbreak settings",
      confidence: 0.88,
    },
    {
      need: "Water",
      reasoning: "Safe water is essential for outbreak prevention and treatment",
      confidence: 0.86,
    },
  ],
};

const GENERIC_HUMANITARIAN_BASELINE: Array<{
  need: CanonicalNeedName;
  reasoning: string;
  confidence: number;
}> = [
  {
    need: "Medical Aid",
    reasoning: "Humanitarian crises typically require medical response capacity",
    confidence: 0.75,
  },
  {
    need: "Shelter",
    reasoning: "Crisis-affected populations often need emergency shelter",
    confidence: 0.72,
  },
  {
    need: "Food",
    reasoning: "Disrupted livelihoods increase food assistance needs",
    confidence: 0.7,
  },
  {
    need: "Water",
    reasoning: "Safe water access is a core humanitarian requirement",
    confidence: 0.7,
  },
  {
    need: "Logistics",
    reasoning: "Aid delivery requires logistics and access coordination",
    confidence: 0.68,
  },
];

export function normalizeHumanitarianNeedKey(needType: string): string {
  return needType
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseNeedName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const key = normalizeHumanitarianNeedKey(trimmed);
  const alias = NEED_ALIASES[key];
  if (alias) return alias;

  const taxonomyMatch = HUMANITARIAN_NEED_TAXONOMY.find(
    (name) => normalizeHumanitarianNeedKey(name) === key
  );
  if (taxonomyMatch) return taxonomyMatch;

  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function canonicalNeedKey(needType: string): string {
  return normalizeHumanitarianNeedKey(normaliseNeedName(needType));
}

export function isHumanitarianIncident(
  title: string,
  content: string,
  crisisType: string | null = null
): boolean {
  if (
    crisisType &&
    crisisType !== "Unknown" &&
    crisisType !== "Unclassified" &&
    crisisType !== "Other"
  ) {
    return true;
  }
  const text = `${title}\n${content}`;
  return HUMANITARIAN_INCIDENT_SIGNALS.some((pattern) => pattern.test(text));
}

export function detectCrisisScenario(
  title: string,
  content: string,
  crisisType: string | null
): CrisisScenario | null {
  const text = `${title}\n${content}`.toLowerCase();
  const type = crisisType?.toLowerCase() ?? "";

  if (
    type.includes("earthquake") ||
    type.includes("seismic") ||
    /\bearthquake\b|\bseismic\b|\bmagnitude\s+[0-9]/.test(text)
  ) {
    return "earthquake";
  }
  if (type.includes("flood") || /\bflood(?:ing|ed)?\b|\binundat/.test(text)) {
    return "flood";
  }
  if (
    type.includes("conflict") ||
    type.includes("war") ||
    /\bconflict\b|\bwar\b|\bfighting\b|\bshelling\b|\bairstrike\b|\barmed\b/.test(text)
  ) {
    return "conflict";
  }
  if (
    type.includes("disease") ||
    type.includes("epidemic") ||
    type.includes("cholera") ||
    /\bdisease\s+outbreak\b|\bepidemic\b|\bcholera\b|\boutbreak\b/.test(text)
  ) {
    return "disease";
  }
  return null;
}

export function scenarioPackageToExtractedNeeds(
  title: string,
  content: string,
  crisisType: string | null,
  options?: { lastResort?: boolean }
): ExtractedHumanitarianNeed[] {
  const scenario = detectCrisisScenario(title, content, crisisType);
  const packageEntries = scenario
    ? CRISIS_SCENARIO_PACKAGES[scenario]
    : GENERIC_HUMANITARIAN_BASELINE;
  const evidence = options?.lastResort
    ? scenario
      ? `Last-resort fallback: ${scenario} scenario with insufficient explicit evidence`
      : "Last-resort fallback: humanitarian signals present but needs could not be evidence-matched"
    : scenario
      ? `Humanitarian ${scenario} scenario identified in report`
      : "Humanitarian incident identified in report";

  const confidenceDiscount = options?.lastResort ? 0.15 : 0;

  return packageEntries.map((entry) => ({
    needType: entry.need,
    severity:
      entry.confidence - confidenceDiscount >= 0.9
        ? "Critical"
        : entry.confidence - confidenceDiscount >= 0.7
          ? "High"
          : "Medium",
    source: "Inferred" as const,
    evidence,
    reasoning: entry.reasoning,
    confidence: Math.max(0.45, entry.confidence - confidenceDiscount),
  }));
}

const SEVERITY_RANK: Record<ExtractedHumanitarianNeed["severity"], number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function pickSeverity(
  a: ExtractedHumanitarianNeed["severity"],
  b: ExtractedHumanitarianNeed["severity"]
): ExtractedHumanitarianNeed["severity"] {
  return (SEVERITY_RANK[a] ?? 0) >= (SEVERITY_RANK[b] ?? 0) ? a : b;
}

function richnessScore(need: ExtractedHumanitarianNeed): number {
  let score = 0;
  if (need.source) score += 2;
  if (need.evidence) score += 2;
  if (need.reasoning || need.reason) score += 1;
  if (need.confidence !== undefined) score += 1;
  return score;
}

function mergePair(
  a: ExtractedHumanitarianNeed,
  b: ExtractedHumanitarianNeed
): ExtractedHumanitarianNeed {
  const primary = richnessScore(a) >= richnessScore(b) ? a : b;
  const secondary = primary === a ? b : a;
  const canonical = normaliseNeedName(primary.needType || secondary.needType);

  return {
    needType: canonical,
    severity: pickSeverity(primary.severity, secondary.severity),
    source:
      primary.source === "Observed" || secondary.source === "Observed"
        ? "Observed"
        : primary.source ?? secondary.source,
    evidence: primary.evidence ?? secondary.evidence,
    reasoning: primary.reasoning ?? secondary.reasoning ?? secondary.reason,
    reason: primary.reason ?? secondary.reason,
    confidence:
      primary.confidence !== undefined || secondary.confidence !== undefined
        ? Math.max(primary.confidence ?? 0, secondary.confidence ?? 0)
        : undefined,
  };
}

/** Deduplicate needs using canonical keys — collapses alias variants to one label. */
export function dedupeExtractedHumanitarianNeeds(
  needs: ExtractedHumanitarianNeed[]
): ExtractedHumanitarianNeed[] {
  const byKey = new Map<string, ExtractedHumanitarianNeed>();

  for (const need of needs) {
    const canonical = normaliseNeedName(need.needType);
    if (!canonical) continue;

    const normalized: ExtractedHumanitarianNeed = {
      ...need,
      needType: canonical,
    };
    const key = canonicalNeedKey(canonical);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergePair(existing, normalized) : normalized);
  }

  return [...byKey.values()].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
  );
}

/** Deduplicate needs — does not inject scenario packages (analyst reasoning handles fallbacks). */
export function ensureHumanitarianNeeds(params: {
  needs: ExtractedHumanitarianNeed[];
  title?: string;
  content?: string;
  crisisType?: string | null;
  allowLastResortPackage?: boolean;
  reasoningContext?: unknown;
}): ExtractedHumanitarianNeed[] {
  return dedupeExtractedHumanitarianNeeds(params.needs);
}
