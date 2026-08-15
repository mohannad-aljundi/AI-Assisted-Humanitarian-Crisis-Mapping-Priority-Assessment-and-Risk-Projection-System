const DAY_MS = 24 * 60 * 60 * 1000;
const CORRELATION_WINDOW_DAYS = 14;
const MAX_DISTANCE_KM = 200;

export interface CorrelationProfile {
  reportId: string;
  title: string;
  content: string;
  reportDate: Date;
  sourceName: string;
  sourceCredibility: number;
  crisisType: string;
  country: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  affectedPopulation: number | null;
  entityValues: string[];
  situationSummary: string | null;
  aiSeverityScore: number;
  reliabilityScore: number;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

function jaccardSets(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function locationScore(a: CorrelationProfile, b: CorrelationProfile): number {
  if (
    a.country.toLowerCase() === b.country.toLowerCase() &&
    a.city.toLowerCase() === b.city.toLowerCase() &&
    a.city.length > 0
  ) {
    return 1;
  }

  if (a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null) {
    const km = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    if (km <= 25) return 1;
    if (km <= 75) return 0.85;
    if (km <= MAX_DISTANCE_KM) return Math.max(0.4, 1 - km / MAX_DISTANCE_KM);
    return 0;
  }

  if (a.country.toLowerCase() === b.country.toLowerCase() && a.country.length > 0) {
    return 0.45;
  }

  return 0;
}

function timeScore(a: CorrelationProfile, b: CorrelationProfile): number {
  const diffDays =
    Math.abs(a.reportDate.getTime() - b.reportDate.getTime()) / DAY_MS;
  if (diffDays <= 2) return 1;
  if (diffDays <= CORRELATION_WINDOW_DAYS) {
    return Math.max(0.35, 1 - diffDays / CORRELATION_WINDOW_DAYS);
  }
  return 0;
}

function entityScore(a: CorrelationProfile, b: CorrelationProfile): number {
  const setA = new Set(a.entityValues.map((v) => v.toLowerCase()));
  const setB = new Set(b.entityValues.map((v) => v.toLowerCase()));
  return jaccardSets(setA, setB);
}

function semanticScore(a: CorrelationProfile, b: CorrelationProfile): number {
  const textA = `${a.title} ${a.content.slice(0, 1200)}`;
  const textB = `${b.title} ${b.content.slice(0, 1200)}`;
  return jaccardSets(tokenize(textA), tokenize(textB));
}

function reasoningScore(a: CorrelationProfile, b: CorrelationProfile): number {
  if (!a.situationSummary || !b.situationSummary) return 0.5;
  return jaccardSets(tokenize(a.situationSummary), tokenize(b.situationSummary));
}

export function computeCorrelationScore(
  a: CorrelationProfile,
  b: CorrelationProfile,
  options?: { timeWindowDays?: number }
): number {
  if (a.reportId === b.reportId) return 1;

  const timeWindowDays = options?.timeWindowDays ?? CORRELATION_WINDOW_DAYS;

  const crisisMatch =
    a.crisisType.toLowerCase() === b.crisisType.toLowerCase() ? 1 : 0.15;

  const diffDays =
    Math.abs(a.reportDate.getTime() - b.reportDate.getTime()) / DAY_MS;
  let timeComponent = 0;
  if (diffDays <= 2) timeComponent = 1;
  else if (diffDays <= timeWindowDays) {
    timeComponent = Math.max(0.35, 1 - diffDays / timeWindowDays);
  }

  const score =
    locationScore(a, b) * 0.25 +
    crisisMatch * 0.2 +
    timeComponent * 0.15 +
    entityScore(a, b) * 0.15 +
    semanticScore(a, b) * 0.15 +
    reasoningScore(a, b) * 0.1;

  return Math.min(1, Math.max(0, score));
}

export const CORRELATION_MERGE_THRESHOLD = 0.52;

export function computeTimelineConsistency(dates: Date[]): number {
  if (dates.length <= 1) return 1;
  const sorted = [...dates].sort((x, y) => x.getTime() - y.getTime());
  let inversions = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.getTime() < sorted[i - 1]!.getTime()) inversions += 1;
  }
  const spanDays =
    (sorted[sorted.length - 1]!.getTime() - sorted[0]!.getTime()) / DAY_MS;
  const orderScore = 1 - inversions / Math.max(1, sorted.length - 1);
  const spanScore = spanDays <= CORRELATION_WINDOW_DAYS ? 1 : Math.max(0.4, 14 / spanDays);
  return Math.min(1, orderScore * 0.7 + spanScore * 0.3);
}

export function computeDynamicPriorityScore(params: {
  aiSeverityScore: number;
  supportingReportCount: number;
  independentSourceCount: number;
  avgReliability: number;
  sourceAgreementPercent: number;
  evidenceStrength: number;
  recentEscalation: number;
}): number {
  const reportBoost = Math.min(0.2, Math.log10(params.supportingReportCount + 1) * 0.12);
  const sourceBoost = Math.min(0.18, params.independentSourceCount * 0.035);
  const agreementBoost = (params.sourceAgreementPercent / 100) * 0.15;
  const reliabilityBoost = params.avgReliability * 0.12;
  const evidenceBoost = params.evidenceStrength * 0.1;

  return Math.min(
    1,
    Math.max(
      0,
      params.aiSeverityScore * 0.35 +
        reportBoost +
        sourceBoost +
        agreementBoost +
        reliabilityBoost +
        evidenceBoost +
        params.recentEscalation * 0.1
    )
  );
}

export function computeSourceAgreement(profiles: CorrelationProfile[]): number {
  if (profiles.length <= 1) return 0;

  let total = 0;
  let pairs = 0;
  for (let i = 0; i < profiles.length; i += 1) {
    for (let j = i + 1; j < profiles.length; j += 1) {
      total +=
        semanticScore(profiles[i]!, profiles[j]!) * 0.5 +
        entityScore(profiles[i]!, profiles[j]!) * 0.3 +
        (profiles[i]!.crisisType.toLowerCase() === profiles[j]!.crisisType.toLowerCase()
          ? 0.2
          : 0);
      pairs += 1;
    }
  }
  return pairs > 0 ? Math.round((total / pairs) * 100) : 0;
}

export function computeEvidenceStrength(params: {
  independentSourceCount: number;
  sourceAgreementPercent: number;
  timelineConsistency: number;
  avgReliability: number;
}): number {
  return Math.min(
    1,
    params.independentSourceCount * 0.12 +
      (params.sourceAgreementPercent / 100) * 0.35 +
      params.timelineConsistency * 0.25 +
      params.avgReliability * 0.28
  );
}
