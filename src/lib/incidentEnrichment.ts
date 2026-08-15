import type {
  AnalyticalRiskProjection,
  DisasterSeverityLevel,
  ExtendedAnalysisInsight,
  NLPAnalysisResult,
  PersistedAnalysisView,
  SourceVerificationSummary,
} from "@/types";
import { trajectoryToRiskTrend } from "@/services/aiRiskProjectionService";
import {
  CONFIDENCE_ENGINE_DESCRIPTION,
  formatExtractionMethodLabel,
  formatPipelineApproach,
  PRIORITY_ENGINE_DESCRIPTION,
  RELIABILITY_ENGINE_DESCRIPTION,
  RISK_ENGINE_DESCRIPTION,
  resolveConfiguredAiModel,
  resolveActiveAiProviderLabel,
} from "@/lib/intelligencePipelineDescription";
import { formatHumanitarianNeedsList } from "@/lib/humanitarianNeedIcons";
import { buildHumanitarianReasoningContext } from "@/lib/humanitarianAnalystReasoning";
import {
  canonicalNeedKey,
  ensureHumanitarianNeeds,
  HUMANITARIAN_NEED_TAXONOMY,
  normaliseNeedName,
} from "@/lib/humanitarianNeedTaxonomy";
import { PUBLIC_ANALYTICAL_STEPS } from "@/lib/explainabilityPresentation";
import type { PriorityLevel, RiskLevel, RiskTrend } from "@prisma/client";
import {
  computeRiskZoneRadius,
  generateOrganicRiskPolygon,
  getCrisisIconKey,
  getRiskZoneColor,
} from "@/lib/mapConstants";
import { getSafeCoordinates } from "@/lib/coordinates";
import type { ResolvedIncidentLocation } from "@/lib/locationExtractionPipeline";
import type { MapRiskZone } from "@/types";
import { ANALYSIS_UNAVAILABLE_MSG } from "@/lib/viewLogs";
import { sortHumanitarianNeedsByPriority } from "@/lib/humanitarianNeedsRanking";
import {
  assessEvidenceVerification,
  type EvidenceVerificationStatus,
} from "@/lib/evidenceVerificationStatus";

export interface AssessmentOverview {
  priority: PriorityLevel;
  risk: RiskLevel;
  reliability: number;
  confidence: number;
  trend: RiskTrend;
  verificationStatus: string;
  disasterSeverity: {
    level: DisasterSeverityLevel;
    score: number;
  } | null;
}

export interface ExecutiveSummaryItem {
  label: string;
  value: string;
}

export interface HumanitarianNeedDetail {
  needType: string;
  score: number;
  confidence: number;
  reason: string;
  severity: string;
  source?: "Observed" | "Inferred";
  evidence?: string;
  reasoning?: string;
}

export interface HumanitarianNeedsView {
  observed: HumanitarianNeedDetail[];
  inferred: HumanitarianNeedDetail[];
  all: HumanitarianNeedDetail[];
  emptyReason: string | null;
}

export interface RiskProjectionDetail {
  currentLevel: RiskLevel;
  currentScore: number;
  forecast24h: number;
  forecast72h: number;
  forecast7d: number;
  trend: RiskTrend;
  confidence: number;
  reasoning: string[];
  analytical?: AnalyticalRiskProjection | null;
  trajectorySummary?: string | null;
}

export interface TimelineEvent {
  time: string | null;
  title: string;
  description: string;
}

export interface SourceRating {
  name: string;
  stars: number;
  credibilityPercent: number;
}

export interface VerificationDetail {
  status: EvidenceVerificationStatus;
  statusReason: string;
  agreementPercent: number;
  independentSources: number;
  contradictions: string[];
  mostTrustedSource: string | null;
  sources: SourceRating[];
}

export interface AcademicTransparency {
  aiModel: string;
  activeProvider: string;
  overallConfidence: number;
  sourcesUsed: string[];
  extractionMethod: string;
  extractionMethodKind?: string | null;
  pipelineApproach: string;
  analyticalSteps: Array<{
    order: number;
    name: string;
    description: string;
  }>;
  reliabilityFormula: string;
  priorityFormula: string;
  riskFormula: string;
  confidenceFormula: string;
  methodsAttempted: string[];
}

const NEED_KEYWORDS: Record<string, string[]> = {
  "Search & Rescue": ["search and rescue", "trapped", "buried", "rubble", "rescue teams", "earthquake", "seismic"],
  Flooding: ["flood", "flooding", "inundation", "flash flood"],
  "Displacement Support": ["displaced", "refugee", "evacuat", "idp", "fled", "displacement"],
  "Medical Aid": ["medical", "hospital", "injured", "casualties", "healthcare", "wounded", "deaths"],
  Water: ["clean water", "drinking water", "water shortage", "water contamination", "water"],
  Food: ["food", "nutrition", "famine", "hunger", "malnutrition", "starvation"],
  Shelter: ["shelter", "housing", "homeless", "camp", "destroyed homes", "collapsed buildings"],
  "Power/Electricity": ["power outage", "electricity", "blackout", "grid failure", "power"],
  Logistics: ["logistics", "supply chain", "aid delivery", "blocked roads", "access routes"],
  Sanitation: ["sanitation", "hygiene", "wash", "toilet"],
  Hygiene: ["hygiene", "handwashing", "sanitation"],
  Vaccination: ["vaccination", "immunization", "immunisation", "vaccine"],
  "Child Protection": ["child protection", "unaccompanied children", "minors"],
  "Psychological Support": ["psychological", "mental health", "trauma", "counselling", "counseling"],
  "Emergency Supplies": ["emergency supplies", "relief supplies", "aid packages", "humanitarian aid"],
  "Non-food Items": ["blankets", "non-food", "nfi", "kitchen sets"],
  Communication: ["communication", "connectivity", "telecom", "internet", "phone network"],
  Education: ["school", "education", "students"],
  Protection: ["protection", "violence", "gbv"],
  Fuel: ["fuel shortage", "diesel", "gasoline", "petrol"],
};

const SEVERITY_SCORES = { Low: 0.25, Medium: 0.5, High: 0.75, Critical: 1 };
const RISK_SCORES = { Low: 25, Medium: 45, High: 70, Critical: 90 };

function projectRiskScore(
  current: number,
  trend: RiskTrend,
  hours: number
): number {
  const factor = trend === "Increasing" ? 1.08 : trend === "Decreasing" ? 0.94 : 1;
  return Math.min(100, Math.max(0, Math.round(current * Math.pow(factor, hours / 24))));
}

export function buildAssessmentOverview(
  analysis: PersistedAnalysisView,
  verification: SourceVerificationSummary | null
): AssessmentOverview {
  const insight = analysis.insight;
  const confidenceBreakdown = insight?.confidenceBreakdown ?? {};
  const avgConfidence =
    Object.values(confidenceBreakdown).length > 0
      ? Object.values(confidenceBreakdown).reduce((a, b) => a + b, 0)
      : insight?.fieldConfidences
        ? Object.values(insight.fieldConfidences).reduce((a, b) => a + b, 0) /
          Object.values(insight.fieldConfidences).length
        : analysis.reliabilityAssessment.finalScore;

  return {
    priority: analysis.priorityAssessment.priorityLevel,
    risk: analysis.riskProjection?.riskLevel ?? "Low",
    reliability: analysis.reliabilityAssessment.finalScore,
    confidence: avgConfidence,
    trend: analysis.riskProjection?.trend ?? "Stable",
    verificationStatus:
      verification?.verificationStatus ?? "Single Source",
    disasterSeverity: insight?.disasterSeverity
      ? {
          level: insight.disasterSeverity.level,
          score: insight.disasterSeverity.score,
        }
      : null,
  };
}

export function buildExecutiveSummary(
  analysis: PersistedAnalysisView,
  nlp: NLPAnalysisResult,
  location: ResolvedIncidentLocation
): ExecutiveSummaryItem[] {
  if (analysis.insight?.finalReasoning?.conclusion) {
    return [
      {
        label: "AI Final Assessment",
        value: analysis.insight.finalReasoning.conclusion,
      },
      {
        label: "Where",
        value: location.verified
          ? location.displayName
          : analysis.insight.locationReasoning?.narrative ??
            "Awaiting geolocation verification",
      },
      {
        label: "Priority",
        value:
          analysis.insight.priorityReasoning?.conclusion ??
          analysis.insight.priorityExplanation.conclusion,
      },
      {
        label: "Reliability",
        value:
          analysis.insight.reliabilityReasoning?.conclusion ??
          analysis.insight.reliabilityExplanation.conclusion,
      },
    ];
  }

  if (analysis.insight?.situationSummary) {
    return [
      {
        label: "AI Situation Summary",
        value: analysis.insight.situationSummary,
      },
      {
        label: "Where",
        value: location.verified
          ? location.displayName
          : "Awaiting geolocation verification",
      },
      {
        label: "Priority",
        value: `${analysis.priorityAssessment.priorityLevel} — ${analysis.insight.priorityExplanation.conclusion}`,
      },
      {
        label: "Reliability",
        value: analysis.insight.reliabilityExplanation.conclusion,
      },
    ];
  }

  const items: ExecutiveSummaryItem[] = [];

  const what =
    nlp.crisisType
      ? `${nlp.crisisType} incident: ${analysis.report.title}`
      : analysis.report.title;
  items.push({ label: "What happened", value: what });

  items.push({
    label: "Where",
    value: location.verified
      ? location.displayName
      : "Location could not yet be verified from available evidence",
  });

  if (nlp.affectedPopulation !== null) {
    items.push({
      label: "Who is affected",
      value: `Approximately ${nlp.affectedPopulation.toLocaleString()} people`,
    });
  } else {
    items.push({
      label: "Who is affected",
      value: "Affected population not quantified in source material",
    });
  }

  items.push({
    label: "Severity",
    value: `${analysis.priorityAssessment.priorityLevel} priority assessment`,
  });

  const topNeeds = nlp.humanitarianNeeds
    .filter((n) => n.severity === "High" || n.severity === "Critical")
    .map((n) => n.needType);
  const needTypes =
    topNeeds.length > 0
      ? topNeeds
      : nlp.humanitarianNeeds.map((n) => n.needType);
  const needsText =
    needTypes.length > 0
      ? formatHumanitarianNeedsList(needTypes)
      : "No humanitarian needs identified from available evidence";
  items.push({ label: "Main humanitarian needs", value: needsText });

  items.push({
    label: "Current risk",
    value: analysis.riskProjection
      ? `${analysis.riskProjection.riskLevel} risk (${analysis.riskProjection.trend} trend)`
      : "Risk projection not yet available",
  });

  return items.slice(0, 7);
}

function needToDetail(need: NLPAnalysisResult["humanitarianNeeds"][number]): HumanitarianNeedDetail {
  const needType = normaliseNeedName(need.needType);
  const score =
    need.severity === "Critical"
      ? 1
      : need.severity === "High"
        ? 0.75
        : need.severity === "Medium"
          ? 0.5
          : 0.25;
  const confidence = need.confidence ?? score;
  const reason =
    need.reasoning ??
    need.reason ??
    (need.source === "Inferred"
      ? "Inferred from humanitarian situation analysis"
      : "Identified from source text");

  return {
    needType,
    score,
    confidence,
    reason,
    severity: need.severity,
    source: need.source,
    evidence: need.evidence,
    reasoning: need.reasoning ?? need.reason,
  };
}

function keywordFallbackNeeds(
  nlp: NLPAnalysisResult,
  content: string,
  insight: ExtendedAnalysisInsight | null,
  title: string
): HumanitarianNeedDetail[] {
  const lower = content.toLowerCase();
  const seen = new Set<string>();
  const results: HumanitarianNeedDetail[] = [];

  for (const needType of HUMANITARIAN_NEED_TAXONOMY) {
    const canonical = normaliseNeedName(needType);
    const key = canonicalNeedKey(canonical);
    if (seen.has(key)) continue;
    seen.add(key);

    const extracted = nlp.humanitarianNeeds.find(
      (n) => canonicalNeedKey(n.needType) === key
    );
    const keywords = NEED_KEYWORDS[canonical] ?? [];
    const hits = keywords.filter((k) => lower.includes(k));

    if (!extracted && hits.length === 0) {
      continue;
    }

    const severity = extracted?.severity ?? (hits.length >= 2 ? "High" : "Medium");
    const score = SEVERITY_SCORES[severity as keyof typeof SEVERITY_SCORES] ?? 0.5;
    if (score <= 0) continue;

    const confidence = Math.min(0.95, 0.4 + hits.length * 0.15 + (extracted ? 0.25 : 0));

    let reason = `Keywords detected: ${hits.slice(0, 3).join(", ")}`;
    if (!extracted && hits.length === 0) {
      continue;
    }

    results.push({
      needType: canonical,
      score,
      confidence,
      reason,
      severity,
      source: extracted?.source,
      evidence: extracted?.evidence,
      reasoning: extracted?.reasoning ?? extracted?.reason,
    });
  }

  return results;
}

function dedupeHumanitarianNeedDetails(
  details: HumanitarianNeedDetail[]
): HumanitarianNeedDetail[] {
  const byKey = new Map<string, HumanitarianNeedDetail>();

  for (const detail of details) {
    const canonical = normaliseNeedName(detail.needType);
    const key = canonicalNeedKey(canonical);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...detail, needType: canonical });
      continue;
    }
    byKey.set(key, {
      ...existing,
      needType: canonical,
      score: Math.max(existing.score, detail.score),
      confidence: Math.max(existing.confidence, detail.confidence),
      severity:
        SEVERITY_SCORES[detail.severity as keyof typeof SEVERITY_SCORES] >=
        SEVERITY_SCORES[existing.severity as keyof typeof SEVERITY_SCORES]
          ? detail.severity
          : existing.severity,
      source: existing.source === "Observed" || detail.source === "Observed" ? "Observed" : existing.source ?? detail.source,
      evidence: existing.evidence ?? detail.evidence,
      reasoning: existing.reasoning ?? detail.reasoning,
      reason: existing.reason.length >= detail.reason.length ? existing.reason : detail.reason,
    });
  }

  return [...byKey.values()];
}

export function buildHumanitarianNeeds(
  nlp: NLPAnalysisResult,
  content: string,
  insight: ExtendedAnalysisInsight | null,
  title = ""
): HumanitarianNeedsView {
  const reasoningContext =
    insight?.humanitarianReasoning ??
    buildHumanitarianReasoningContext(title, content, nlp.crisisType);

  const ensured = ensureHumanitarianNeeds({
    needs: nlp.humanitarianNeeds,
    title,
    content,
    crisisType: nlp.crisisType,
    reasoningContext,
    allowLastResortPackage: false,
  });

  let details: HumanitarianNeedDetail[] =
    ensured.length > 0
      ? ensured.map(needToDetail)
      : keywordFallbackNeeds(nlp, content, insight, title);

  details = dedupeHumanitarianNeedDetails(details);
  details = details.filter((need) => need.score > 0);

  const observed = details.filter((n) => n.source === "Observed");
  const inferred = details.filter((n) => n.source === "Inferred");
  const unspecified = details.filter((n) => !n.source);
  const all = sortHumanitarianNeedsByPriority([...observed, ...inferred, ...unspecified]);

  const emptyReason =
    all.length === 0
      ? reasoningContext.describesPreventiveOrFutureAction
        ? "No acute humanitarian needs identified — this report appears to describe preventive action, funding, or recovery rather than an active emergency."
        : "No evidence-supported humanitarian needs were identified. The analyst reasoning found insufficient explicit or inferable humanitarian requirements in this report."
      : null;

  return { observed, inferred, all, emptyReason };
}

/** View path: display persisted needs only — no taxonomy fill or keyword inference. */
export function buildHumanitarianNeedsReadOnly(
  nlp: NLPAnalysisResult
): HumanitarianNeedsView {
  const details = dedupeHumanitarianNeedDetails(
    nlp.humanitarianNeeds.map(needToDetail).filter((need) => need.score > 0)
  );

  const observed = details.filter((n) => n.source === "Observed");
  const inferred = details.filter((n) => n.source === "Inferred");
  const unspecified = details.filter((n) => !n.source);
  const all = sortHumanitarianNeedsByPriority([...observed, ...inferred, ...unspecified]);

  const emptyReason =
    all.length === 0 ? ANALYSIS_UNAVAILABLE_MSG : null;

  return { observed, inferred, all, emptyReason };
}

export function buildRiskProjection(
  analysis: PersistedAnalysisView,
  insight: ExtendedAnalysisInsight | null
): RiskProjectionDetail {
  const risk = analysis.riskProjection;
  const level = risk?.riskLevel ?? "Low";
  const trend = risk?.trend ?? "Stable";

  const storedProjections = risk?.projections as {
    current?: number;
    forecast24h?: number;
    forecast72h?: number;
    forecast7d?: number;
    trend?: RiskTrend;
  } | null;

  const insightProjections = insight?.riskProjections;

  const current =
    storedProjections?.current ??
    insightProjections?.current ??
    RISK_SCORES[level];

  const forecast24h =
    storedProjections?.forecast24h ??
    insightProjections?.forecast24h ??
    projectRiskScore(current, trend, 24);

  const forecast72h =
    storedProjections?.forecast72h ??
    insightProjections?.forecast72h ??
    projectRiskScore(current, trend, 72);

  const forecast7d =
    storedProjections?.forecast7d ??
    insightProjections?.forecast7d ??
    projectRiskScore(current, trend, 168);

  return {
    currentLevel: level,
    currentScore: current,
    forecast24h,
    forecast72h,
    forecast7d,
    trend: storedProjections?.trend ?? trend,
    confidence: risk?.confidenceScore ?? 0,
    reasoning: insight?.riskReasoning
      ? [
          insight.riskReasoning.narrative,
          ...insight.riskReasoning.reasons,
        ]
      : insight?.riskExplanation.reasons ?? [
          "Risk derived from AI temporal reasoning and weighted projection horizons",
        ],
  };
}

/** View path: use stored projections only — no recalculation. */
export function buildRiskProjectionReadOnly(
  analysis: PersistedAnalysisView,
  insight: ExtendedAnalysisInsight | null
): RiskProjectionDetail {
  const analytical = insight?.analyticalRiskProjection ?? null;

  const risk = analysis.riskProjection;
  const storedProjections = risk?.projections as {
    current?: number;
    forecast24h?: number;
    forecast72h?: number;
    forecast7d?: number;
    trend?: RiskTrend;
  } | null;

  const insightProjections = insight?.riskProjections;

  if (!risk && !insightProjections && !storedProjections && !analytical) {
    return {
      currentLevel: "Low",
      currentScore: 0,
      forecast24h: 0,
      forecast72h: 0,
      forecast7d: 0,
      trend: "Stable",
      confidence: 0,
      reasoning: [ANALYSIS_UNAVAILABLE_MSG],
      analytical: null,
      trajectorySummary: null,
    };
  }

  if (analytical) {
    const trend = trajectoryToRiskTrend(analytical.trend);
    return {
      currentLevel: analytical.riskLevel,
      currentScore: analytical.currentScore,
      forecast24h: analytical.forecast24h,
      forecast72h: analytical.forecast72h,
      forecast7d: analytical.forecast7d,
      trend,
      confidence: analytical.confidence,
      trajectorySummary: analytical.riskNarrative,
      analytical,
      reasoning: [
        analytical.riskNarrative,
        analytical.currentRiskReason,
        analytical.forecast24hReason,
        analytical.forecast72hReason,
        analytical.forecast7dReason,
      ].filter(Boolean),
    };
  }

  const level = risk?.riskLevel ?? "Low";
  const trend = storedProjections?.trend ?? risk?.trend ?? "Stable";

  const current =
    storedProjections?.current ??
    insightProjections?.current ??
    RISK_SCORES[level];

  return {
    currentLevel: level,
    currentScore: current,
    forecast24h:
      storedProjections?.forecast24h ?? insightProjections?.forecast24h ?? 0,
    forecast72h:
      storedProjections?.forecast72h ?? insightProjections?.forecast72h ?? 0,
    forecast7d:
      storedProjections?.forecast7d ?? insightProjections?.forecast7d ?? 0,
    trend,
    confidence: risk?.confidenceScore ?? 0,
    analytical: null,
    trajectorySummary: insight?.riskReasoning?.narrative ?? null,
    reasoning: insight?.riskReasoning
      ? [insight.riskReasoning.narrative, ...insight.riskReasoning.reasons]
      : insight?.riskExplanation.reasons ?? [ANALYSIS_UNAVAILABLE_MSG],
  };
}

export function buildTimeline(
  content: string,
  reportDate: Date,
  crisisType: string | null
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const sentences = content.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);

  const timePattern = /\b(\d{1,2}:\d{2}(?:\s?[AP]M)?|\d{1,2}\s?(?:am|pm))\b/i;

  for (const sentence of sentences.slice(0, 8)) {
    const timeMatch = sentence.match(timePattern);
    const lower = sentence.toLowerCase();
    const isEvent =
      /\b(reported|detected|deployed|overwhelmed|shortage|aftershock|evacuat|attack|flood|earthquake|arrived|announced)\b/i.test(
        lower
      );

    if (!isEvent && !timeMatch) continue;

    events.push({
      time: timeMatch?.[1] ?? null,
      title: sentence.split(/[.!?]/)[0].slice(0, 80),
      description: sentence.trim(),
    });
  }

  if (events.length === 0) {
    events.push({
      time: reportDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      title: crisisType ? `${crisisType} reported` : "Incident reported",
      description: "Primary incident documented in source report",
    });
  }

  return events.slice(0, 6);
}

export function buildVerificationDetail(
  analysis: PersistedAnalysisView,
  verification: SourceVerificationSummary | null
): VerificationDetail {
  const primarySource = analysis.report.source;
  const sources: SourceRating[] = [
    {
      name: primarySource.name,
      stars: Math.round(primarySource.credibilityScore * 5),
      credibilityPercent: Math.round(primarySource.credibilityScore * 100),
    },
  ];

  if (verification) {
    for (const name of verification.sourceNames) {
      if (name === primarySource.name) continue;
      const score = verification.sourceReliability;
      sources.push({
        name,
        stars: Math.max(1, Math.round(score * 5)),
        credibilityPercent: Math.round(score * 100),
      });
    }
  }

  sources.sort((a, b) => b.credibilityPercent - a.credibilityPercent);

  const crossSource = analysis.insight?.crossSourceAnalysis;

  const agreementPercent =
    crossSource?.agreementPercent ??
    (verification
      ? Math.max(verification.sourceConsensusPercentage, verification.consensusScore)
      : 0);

  const independentSources =
    verification?.comparedSources ?? crossSource?.sources?.length ?? 1;

  const contradictions =
    crossSource?.contradictions ??
    (verification?.verificationStatus === "Conflicting Sources"
      ? ["Source narratives show significant inconsistency"]
      : []);

  const corroboratingNames = [
    primarySource.name,
    ...(verification?.sourceNames ?? []),
    ...(crossSource?.sources ?? []),
  ];

  const evidence = assessEvidenceVerification({
    independentSourceCount: independentSources,
    agreementPercent,
    primarySourceName: primarySource.name,
    primaryCredibility: primarySource.credibilityScore,
    corroboratingSourceNames: [...new Set(corroboratingNames)],
    contradictions,
  });

  return {
    status: evidence.status,
    statusReason: evidence.reason,
    agreementPercent,
    independentSources,
    contradictions,
    mostTrustedSource: sources[0]?.name ?? null,
    sources,
  };
}

export function buildTransparency(
  analysis: PersistedAnalysisView,
  location: ResolvedIncidentLocation,
  verification: SourceVerificationSummary | null
): AcademicTransparency {
  const sources = [analysis.report.source.name];
  if (verification) {
    for (const name of verification.sourceNames) {
      if (!sources.includes(name)) sources.push(name);
    }
  }

  const extractionKind = analysis.insight?.extractionMethod ?? "ai";

  return {
    aiModel: resolveConfiguredAiModel(analysis.insight?.aiModel),
    activeProvider: resolveActiveAiProviderLabel(),
    overallConfidence: location.confidence / 100 || analysis.reliabilityAssessment.finalScore,
    sourcesUsed: sources,
    extractionMethod: formatExtractionMethodLabel(extractionKind, location.extractionMethod),
    extractionMethodKind: extractionKind,
    pipelineApproach: formatPipelineApproach(extractionKind),
    analyticalSteps: PUBLIC_ANALYTICAL_STEPS,
    reliabilityFormula: RELIABILITY_ENGINE_DESCRIPTION,
    priorityFormula: PRIORITY_ENGINE_DESCRIPTION,
    riskFormula: RISK_ENGINE_DESCRIPTION,
    confidenceFormula: CONFIDENCE_ENGINE_DESCRIPTION,
    methodsAttempted: location.methodsAttempted,
  };
}

export function buildIncidentMapZone(
  analysis: PersistedAnalysisView,
  location: ResolvedIncidentLocation,
  nlp: NLPAnalysisResult,
  verification: SourceVerificationSummary | null
): MapRiskZone | null {
  if (!location?.verified) return null;
  const coords = getSafeCoordinates(location);
  if (!coords) return null;

  const risk = analysis.riskProjection;
  const riskLevel = risk?.riskLevel ?? "Medium";
  const lat = coords.lat;
  const lng = coords.lng;

  return {
    id: `incident-${analysis.report.id}`,
    locationId: analysis.locations[0]?.id ?? analysis.report.id,
    locationName: location.displayName,
    cityName: location.city ?? location.displayName,
    countryName: location.country ?? "",
    displayLocation: location.displayName,
    regionLabel: null,
    latitude: lat,
    longitude: lng,
    riskLevel,
    trend: risk?.trend ?? "Stable",
    confidenceScore: risk?.confidenceScore ?? 0.5,
    crisisType: nlp.crisisType,
    crisisIconKey: getCrisisIconKey(nlp.crisisType),
    priorityLevel: analysis.priorityAssessment.priorityLevel,
    reliabilityScore: analysis.reliabilityAssessment.finalScore,
    affectedPopulation: nlp.affectedPopulation,
    humanitarianNeeds: nlp.humanitarianNeeds.map((n) => ({
      needType: n.needType,
      severity: n.severity,
      source: n.source,
      evidence: n.evidence,
      reasoning: n.reasoning,
      confidence: n.confidence,
    })),
    reportId: analysis.report.id,
    reportTitle: analysis.report.title,
    radiusMeters: computeRiskZoneRadius({
      riskLevel,
      crisisType: nlp.crisisType,
      confidenceScore: risk?.confidenceScore,
      locationConfidence: location.confidence,
      priorityLevel: analysis.priorityAssessment.priorityLevel,
      affectedPopulation: nlp.affectedPopulation,
    }),
    fillColor: getRiskZoneColor(riskLevel),
    boundaryPolygon: generateOrganicRiskPolygon(
      lat,
      lng,
      computeRiskZoneRadius({
        riskLevel,
        crisisType: nlp.crisisType,
        confidenceScore: risk?.confidenceScore,
        locationConfidence: location.confidence,
        priorityLevel: analysis.priorityAssessment.priorityLevel,
        affectedPopulation: nlp.affectedPopulation,
      }),
      nlp.crisisType,
      analysis.report.id
    ),
    relatedLocations: [],
    sourceNames: verification?.sourceNames ?? [analysis.report.source.name],
    consensusScore: verification?.consensusScore ?? null,
    verificationStatus: verification?.verificationStatus ?? "Single Source",
    locationVerified: location.verified,
    locationConfidence: location.confidence,
    coordinatePrecision: location.verified
      ? location.confidence >= 85
        ? "exact"
        : "approximate"
      : "unknown",
    reportDate:
      analysis.report.reportDate instanceof Date
        ? analysis.report.reportDate.toISOString()
        : String(analysis.report.reportDate),
    primarySource: analysis.report.source.name,
  };
}
