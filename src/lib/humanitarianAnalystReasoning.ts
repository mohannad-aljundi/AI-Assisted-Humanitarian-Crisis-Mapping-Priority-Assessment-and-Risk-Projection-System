import type { ExtractedHumanitarianNeed } from "@/types";
import { canonicalNeedKey, normaliseNeedName } from "@/lib/humanitarianNeedTaxonomy";

/** Stage 1 — What does this report represent? */
export type ReportPurpose =
  | "Active Humanitarian Emergency"
  | "Ongoing Disaster Response"
  | "Recovery and Reconstruction"
  | "Government Funding Announcement"
  | "Infrastructure Improvement Project"
  | "Early Warning"
  | "Preparedness Activity"
  | "Policy Announcement"
  | "Humanitarian Aid Delivery"
  | "Situation Update"
  | "Damage Assessment"
  | "Monitoring"
  | "General News"
  | "Unknown";

/** Stage 5 — Crisis phase */
export type CrisisPhase =
  | "Emergency"
  | "Response"
  | "Recovery"
  | "Reconstruction"
  | "Preparedness"
  | "Mitigation"
  | "Monitoring";

export interface HumanitarianReasoningContext {
  reportPurpose: ReportPurpose;
  crisisPhase: CrisisPhase;
  describesActiveSuffering: boolean;
  describesPreventiveOrFutureAction: boolean;
  allowsEmergencyNeedInference: boolean;
  analystSummary: string;
  usedLastResortPackage: boolean;
}

const RECOVERY_PURPOSES: ReportPurpose[] = [
  "Recovery and Reconstruction",
  "Infrastructure Improvement Project",
  "Government Funding Announcement",
  "Preparedness Activity",
  "Policy Announcement",
];

const EMERGENCY_PURPOSES: ReportPurpose[] = [
  "Active Humanitarian Emergency",
  "Ongoing Disaster Response",
  "Damage Assessment",
];

const PREVENTIVE_SIGNALS: RegExp[] = [
  /\b(?:invest(?:ing|ment)|fund(?:ing|ed)|allocat(?:e|ed|ion)|budget)\b.*\b(?:infrastructure|water|health|school|road|bridge|dam|resilience)\b/i,
  /\b(?:reconstruction|rebuild|rehabilitat|recovery\s+plan|recovery\s+effort)\b/i,
  /\b(?:preparedness|preparedness\s+activity|early\s+warning\s+system|mitigation\s+measure|disaster\s+risk\s+reduction)\b/i,
  /\b(?:announced|announcement|pledge|commitment)\b.*\b(?:million|billion|\$|€|£)\b/i,
  /\b(?:will\s+be\s+built|planned\s+construction|future\s+project|long[- ]term)\b/i,
];

const SUFFERING_SIGNALS: RegExp[] = [
  /\b(?:shortage|lacking|without\s+(?:food|water|shelter)|starving|starvation)\b/i,
  /\b(?:displaced|homeless|evacuat(?:ed|ion)|living\s+in\s+(?:camps|shelters))\b/i,
  /\b(?:casualt|killed|injured|wounded|fatalities|dead|missing)\b/i,
  /\b(?:hospital(?:s)?\s+(?:overwhelmed|destroyed|damaged|at\s+capacity))\b/i,
  /\b(?:food\s+insecurity|malnutrition|famine)\b/i,
  /\b(?:no\s+(?:clean\s+)?water|water\s+shortage|contaminated\s+water)\b/i,
  /\b(?:destroyed\s+(?:homes|houses|villages)|building\s+collapse|collapsed\s+buildings)\b/i,
  /\b(?:urgent(?:ly)?\s+need|immediate\s+need|humanitarian\s+emergency)\b/i,
  /\b(?:trapped\s+under|search\s+and\s+rescue|rescue\s+operations)\b/i,
];

const PURPOSE_PATTERNS: Array<{ purpose: ReportPurpose; patterns: RegExp[] }> = [
  {
    purpose: "Government Funding Announcement",
    patterns: [
      /\b(?:government|ministry|parliament|cabinet)\b.*\b(?:fund|allocat|invest|budget|pledge)\b/i,
      /\b(?:million|billion)\b.*\b(?:fund|allocat|invest)\b/i,
    ],
  },
  {
    purpose: "Infrastructure Improvement Project",
    patterns: [
      /\b(?:infrastructure\s+project|construction\s+project|upgrade|moderniz)\b/i,
      /\b(?:build(?:ing)?\s+(?:new|a)\s+(?:hospital|school|road|bridge|dam|water))\b/i,
    ],
  },
  {
    purpose: "Recovery and Reconstruction",
    patterns: [
      /\b(?:recovery\s+and\s+reconstruction|reconstruction\s+effort|rebuild(?:ing)?\s+(?:homes|communities))\b/i,
      /\b(?:post[- ]disaster\s+recovery|long[- ]term\s+recovery)\b/i,
    ],
  },
  {
    purpose: "Preparedness Activity",
    patterns: [
      /\b(?:preparedness|drill|simulation|evacuation\s+plan|early\s+warning)\b/i,
      /\b(?:disaster\s+risk\s+reduction|mitigation\s+(?:effort|project))\b/i,
    ],
  },
  {
    purpose: "Policy Announcement",
    patterns: [
      /\b(?:policy|legislation|regulation|framework|strategy)\b.*\b(?:announced|adopted|approved)\b/i,
    ],
  },
  {
    purpose: "Humanitarian Aid Delivery",
    patterns: [
      /\b(?:aid\s+(?:delivery|shipment|convoy)|relief\s+supplies\s+(?:arrived|delivered)|humanitarian\s+assistance\s+(?:provided|delivered))\b/i,
      /\b(?:distributed\s+(?:food|water|medicine|supplies))\b/i,
    ],
  },
  {
    purpose: "Damage Assessment",
    patterns: [
      /\b(?:damage\s+assessment|assessing\s+(?:the\s+)?damage|rapid\s+assessment)\b/i,
      /\b(?:initial\s+assessment|needs\s+assessment)\b/i,
    ],
  },
  {
    purpose: "Early Warning",
    patterns: [
      /\b(?:early\s+warning|alert\s+issued|cyclone\s+warning|flood\s+warning|tsunami\s+warning)\b/i,
    ],
  },
  {
    purpose: "Ongoing Disaster Response",
    patterns: [
      /\b(?:response\s+operation|relief\s+operation|humanitarian\s+response|rescue\s+operation)\b/i,
      /\b(?:aid\s+workers|humanitarian\s+workers|emergency\s+teams)\b/i,
    ],
  },
  {
    purpose: "Active Humanitarian Emergency",
    patterns: [
      /\b(?:humanitarian\s+emergency|humanitarian\s+crisis|state\s+of\s+emergency|disaster\s+declared)\b/i,
      /\b(?:mass\s+(?:casualt|displacement)|widespread\s+(?:destruction|damage|flooding))\b/i,
    ],
  },
  {
    purpose: "Situation Update",
    patterns: [
      /\b(?:situation\s+update|status\s+update|latest\s+developments|according\s+to\s+(?:officials|authorities))\b/i,
    ],
  },
  {
    purpose: "Monitoring",
    patterns: [/\b(?:monitoring|situation\s+report|sitrep|watching|tracking)\b/i],
  },
];

const PHASE_PATTERNS: Array<{ phase: CrisisPhase; patterns: RegExp[] }> = [
  { phase: "Emergency", patterns: [/\b(?:emergency|immediate\s+danger|active\s+disaster|ongoing\s+(?:flood|earthquake|conflict))\b/i] },
  { phase: "Response", patterns: [/\b(?:response|relief\s+effort|rescue|humanitarian\s+operation)\b/i] },
  { phase: "Recovery", patterns: [/\b(?:recovery|recovering|rehabilitation)\b/i] },
  { phase: "Reconstruction", patterns: [/\b(?:reconstruction|rebuild|rebuilding)\b/i] },
  { phase: "Preparedness", patterns: [/\b(?:preparedness|prepared|readiness|drill)\b/i] },
  { phase: "Mitigation", patterns: [/\b(?:mitigation|risk\s+reduction|resilience)\b/i] },
  { phase: "Monitoring", patterns: [/\b(?:monitoring|watch|situation\s+report)\b/i] },
];

function textOf(title: string, content: string): string {
  return `${title}\n${content}`;
}

export function classifyReportPurpose(title: string, content: string): ReportPurpose {
  const text = textOf(title, content);
  for (const entry of PURPOSE_PATTERNS) {
    if (entry.patterns.some((p) => p.test(text))) {
      return entry.purpose;
    }
  }
  if (SUFFERING_SIGNALS.some((p) => p.test(text))) {
    return "Active Humanitarian Emergency";
  }
  return "Unknown";
}

export function classifyCrisisPhase(
  title: string,
  content: string,
  reportPurpose: ReportPurpose
): CrisisPhase {
  const text = textOf(title, content);
  for (const entry of PHASE_PATTERNS) {
    if (entry.patterns.some((p) => p.test(text))) {
      return entry.phase;
    }
  }
  if (RECOVERY_PURPOSES.includes(reportPurpose)) {
    return reportPurpose === "Infrastructure Improvement Project"
      ? "Reconstruction"
      : "Recovery";
  }
  if (EMERGENCY_PURPOSES.includes(reportPurpose)) {
    return reportPurpose === "Ongoing Disaster Response" ? "Response" : "Emergency";
  }
  if (reportPurpose === "Preparedness Activity") return "Preparedness";
  if (reportPurpose === "Early Warning") return "Preparedness";
  if (reportPurpose === "Monitoring" || reportPurpose === "Situation Update") {
    return "Monitoring";
  }
  return "Monitoring";
}

export function describesActiveSuffering(title: string, content: string): boolean {
  return SUFFERING_SIGNALS.some((p) => p.test(textOf(title, content)));
}

export function describesPreventiveOrFutureAction(title: string, content: string): boolean {
  return PREVENTIVE_SIGNALS.some((p) => p.test(textOf(title, content)));
}

export function buildHumanitarianReasoningContext(
  title: string,
  content: string,
  crisisType: string | null = null
): HumanitarianReasoningContext {
  const reportPurpose = classifyReportPurpose(title, content);
  const crisisPhase = classifyCrisisPhase(title, content, reportPurpose);
  const suffering = describesActiveSuffering(title, content);
  const preventive = describesPreventiveOrFutureAction(title, content);

  const allowsEmergencyNeedInference =
    suffering &&
    !preventive &&
    (EMERGENCY_PURPOSES.includes(reportPurpose) ||
      crisisPhase === "Emergency" ||
      crisisPhase === "Response" ||
      (reportPurpose === "Damage Assessment" && suffering) ||
      (reportPurpose === "Situation Update" && suffering));

  const analystSummary = buildAnalystSummary({
    reportPurpose,
    crisisPhase,
    suffering,
    preventive,
    crisisType,
    allowsEmergencyNeedInference,
  });

  return {
    reportPurpose,
    crisisPhase,
    describesActiveSuffering: suffering,
    describesPreventiveOrFutureAction: preventive,
    allowsEmergencyNeedInference,
    analystSummary,
    usedLastResortPackage: false,
  };
}

function buildAnalystSummary(params: {
  reportPurpose: ReportPurpose;
  crisisPhase: CrisisPhase;
  suffering: boolean;
  preventive: boolean;
  crisisType: string | null;
  allowsEmergencyNeedInference: boolean;
}): string {
  const parts = [
    `This report is classified as: ${params.reportPurpose}.`,
    `Crisis phase: ${params.crisisPhase}.`,
    params.crisisType ? `Hazard/context type: ${params.crisisType}.` : null,
    params.suffering
      ? "The text describes evidence of active humanitarian suffering."
      : "The text does not clearly describe active humanitarian suffering.",
    params.preventive
      ? "The report emphasises preventive action, funding, or future improvements rather than an acute emergency."
      : null,
    params.allowsEmergencyNeedInference
      ? "Controlled inference of acute humanitarian needs is permitted where evidence supports it."
      : "Acute humanitarian needs should only be listed when explicitly evidenced — not inferred from crisis type alone.",
  ];
  return parts.filter(Boolean).join(" ");
}

const EMERGENCY_ONLY_NEEDS = new Set(
  [
    "Shelter",
    "Food",
    "Search & Rescue",
    "Trauma Care",
    "Emergency Medical Care",
    "Emergency Supplies",
    "Displacement Support",
  ].map((n) => canonicalNeedKey(n))
);

export function filterNeedsByReasoningContext(
  needs: ExtractedHumanitarianNeed[],
  context: HumanitarianReasoningContext
): ExtractedHumanitarianNeed[] {
  if (context.allowsEmergencyNeedInference) {
    return needs;
  }

  return needs.filter((need) => {
    const key = canonicalNeedKey(need.needType);
    const isEmergencyNeed = EMERGENCY_ONLY_NEEDS.has(key);

    if (!isEmergencyNeed) return true;
    if (need.source === "Observed" && need.evidence && !isGenericEvidence(need.evidence)) {
      return true;
    }
    return false;
  });
}

function isGenericEvidence(evidence: string): boolean {
  const lower = evidence.toLowerCase();
  return (
    lower.includes("humanitarian incident identified") ||
    lower.includes("scenario identified") ||
    lower.includes("derived from report context") ||
    lower.includes("inferred from humanitarian situation analysis") ||
    lower.includes("crisis scenario") ||
    lower.includes("keyword")
  );
}

export function shouldUseLastResortScenarioPackage(
  context: HumanitarianReasoningContext,
  title: string,
  content: string
): boolean {
  if (context.describesPreventiveOrFutureAction && !context.describesActiveSuffering) {
    return false;
  }
  if (RECOVERY_PURPOSES.includes(context.reportPurpose) && !context.describesActiveSuffering) {
    return false;
  }
  if (!context.allowsEmergencyNeedInference) {
    return false;
  }
  const text = textOf(title, content);
  return SUFFERING_SIGNALS.some((p) => p.test(text));
}

export function buildStructuredAnalystPrompt(params: {
  title: string;
  content: string;
  crisisType: string | null;
  context: HumanitarianReasoningContext;
  taxonomy: readonly string[];
  preliminaryNeeds?: string[];
}): string {
  const { title, content, crisisType, context, taxonomy, preliminaryNeeds } = params;

  return [
    "You are a senior UN/OCHA humanitarian intelligence analyst. Think before you classify.",
    "This system is NOT a keyword matcher. Every need must be justified by evidence or controlled logical inference.",
    "",
    "=== STAGE 1 — UNDERSTAND THE CONTEXT ===",
    `Preliminary report purpose: ${context.reportPurpose}`,
    `Preliminary crisis phase: ${context.crisisPhase}`,
    "First determine what this report represents (emergency, response, recovery, funding, preparedness, aid delivery, policy, update, etc.).",
    "Do NOT assume an active emergency from hazard type alone.",
    "",
    "=== STAGE 2 — HUMANITARIAN IMPACT ===",
    context.describesActiveSuffering
      ? "Signals of active suffering are present — assess which needs are occurring NOW."
      : "No clear active suffering — distinguish future/preventive action from acute needs.",
    context.describesPreventiveOrFutureAction
      ? "This report describes preventive or future-oriented action. Do NOT assign acute emergency needs unless explicitly evidenced."
      : "",
    "",
    "=== STAGE 3 — EVIDENCE FIRST ===",
    "Observed needs: ONLY when explicitly stated (water shortage, displaced families, hospitals damaged, food insecurity, etc.).",
    "source must be 'Observed' with a direct evidence quote or paraphrase.",
    "Never invent needs not supported by the report.",
    "",
    "=== STAGE 4 — CONTROLLED INFERENCE ===",
    "Inferred needs: ONLY after observed evidence, and only as logical consequences.",
    "Examples: bridge collapse → Logistics disruption; hospitals destroyed → Medical supply shortages; mass displacement → Shelter demand.",
    "Counter-example: detecting 'Flood' does NOT automatically mean Shelter, Food, Medical, Logistics.",
    "",
    "=== STAGE 5 — CRISIS PHASE ===",
    `Phase guidance: ${context.crisisPhase}. Recovery/reconstruction reports must NOT receive the same needs as emergency reports.`,
    "",
    "=== STAGE 6 — CONFIDENCE BY NEED ===",
    "Each need requires: need, source (Observed|Inferred), evidence, reasoning, confidence (0-1).",
    "",
    "=== STAGE 7 — NO GENERIC PACKAGES ===",
    "NEVER assign a standard earthquake/flood/conflict need package because of crisis type.",
    "Return an EMPTY needs array if the report does not support humanitarian needs (e.g. funding announcement, preparedness drill).",
    "",
    "=== STAGE 8 — ANALYST NARRATIVE ===",
    "Also return reportPurpose, crisisPhase, analystSummary (2-4 sentences explaining your contextual reading).",
    "",
    "Taxonomy (use these canonical names): " + taxonomy.join(", "),
    preliminaryNeeds?.length
      ? `Preliminary keyword hints (verify — do not trust blindly): ${preliminaryNeeds.join(", ")}`
      : "",
    crisisType ? `NLP crisis type hint (context only, not a need trigger): ${crisisType}` : "",
    "",
    `Title: ${title}`,
    `Content: ${content.slice(0, 8000)}`,
    "",
    `Return JSON: { "reportPurpose": "...", "crisisPhase": "...", "analystSummary": "...", "needs": [{ "need": "...", "source": "Observed|Inferred", "evidence": "...", "reasoning": "...", "confidence": 0.0-1.0 }] }`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const ANALYST_SYSTEM_INSTRUCTION =
  "You are a senior humanitarian intelligence analyst for UN/OCHA. Reason contextually and evidence-first. Return valid JSON only. Empty needs array is correct when the report does not describe acute humanitarian needs.";

export function mergeAiReasoningContext(
  baseline: HumanitarianReasoningContext,
  aiRaw: unknown
): HumanitarianReasoningContext {
  if (!aiRaw || typeof aiRaw !== "object") return baseline;
  const data = aiRaw as Record<string, unknown>;
  return {
    ...baseline,
    reportPurpose:
      typeof data.reportPurpose === "string"
        ? (data.reportPurpose as ReportPurpose)
        : baseline.reportPurpose,
    crisisPhase:
      typeof data.crisisPhase === "string"
        ? (data.crisisPhase as CrisisPhase)
        : baseline.crisisPhase,
    analystSummary:
      typeof data.analystSummary === "string" && data.analystSummary.trim()
        ? data.analystSummary.trim()
        : baseline.analystSummary,
  };
}
