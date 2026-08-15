import type { AlertType, AgreementLevel, PriorityLevel, RiskLevel, RiskTrend, SourceType } from "@prisma/client";
import type { ProcessingQueueSnapshot } from "@/lib/analysisEventBus";
import type { EvidenceVerificationStatus } from "@/lib/evidenceVerificationStatus";
import type { CrisisIconKey } from "@/lib/crisisIcons";
import type { IngestionKeyword, IngestionSource } from "@/lib/ingestionConstants";
import type {
  Crisis,
  ExtractedEntity,
  HumanitarianNeed,
  Location,
  PriorityAssessment,
  ReliabilityAssessment,
  Report,
  RiskProjection,
  Source,
} from "@prisma/client";

export type { PriorityLevel, RiskLevel, RiskTrend, SourceType, AlertType, AgreementLevel };

export interface ReportInput {
  title: string;
  content: string;
  reportDate: string;
  articleUrl?: string;
  externalArticleId?: string;
  source?: {
    name: string;
    type: SourceType;
    credibilityScore?: number;
    url?: string;
  };
}

export interface ExtractedLocation {
  name: string;
  latitude: number | null;
  longitude: number | null;
  confidence?: number;
  validationStatus?: "verified" | "geocoded" | "unverified" | "rejected" | "pending";
}

export type NeedInferenceSource = "Observed" | "Inferred";

export interface ExtractedHumanitarianNeed {
  needType: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  reason?: string;
  source?: NeedInferenceSource;
  evidence?: string;
  reasoning?: string;
  confidence?: number;
}

export interface ExtractedIntelligenceEntityView {
  entityType: string;
  entitySubtype?: string | null;
  value: string;
  latitude: number | null;
  longitude: number | null;
}

export interface NLPAnalysisResult {
  locations: ExtractedLocation[];
  entities?: ExtractedIntelligenceEntityView[];
  crisisType: string | null;
  humanitarianNeeds: ExtractedHumanitarianNeed[];
  affectedPopulation: number | null;
}

export interface PriorityResult {
  priorityScore: number;
  severityScore: number;
  priorityLevel: PriorityLevel;
  reasons: string[];
  breakdown?: Record<string, number>;
  indicators?: Array<{
    id: string;
    label: string;
    weight: number;
    rawScore: number;
    weightedScore: number;
    evidence: string;
  }>;
  evidence?: string[];
}

/** Structured output from AI-led priority assessment */
export interface AiPriorityAssessmentResult {
  priorityLevel: PriorityLevel;
  priorityScore: number;
  riskLevel: RiskLevel;
  urgency: string;
  humanitarianNeeds: string[];
  evidenceQuotes: string[];
  reasoning: string;
  confidence: number;
}

export type DisasterSeverityLevel = "Critical" | "High" | "Medium" | "Low";

/** Holistic disaster severity (0–10 scale), distinct from percentage-based scores */
export interface DisasterSeverityAssessment {
  level: DisasterSeverityLevel;
  score: number;
  reasoning: string;
  reasons: string[];
  confidence: number;
  source: "ai" | "fallback";
}

/** Guardrail escalation applied when AI conflicts with hard humanitarian indicators */
export interface GuardrailAdjustment {
  applied: boolean;
  reason: string | null;
  evidence: string[];
  aiPriorityLevel: PriorityLevel;
  aiPriorityScore: number;
  finalPriorityLevel: PriorityLevel;
  finalPriorityScore: number;
}

/** Full priority pipeline result: AI assessment + optional guardrail escalation */
export interface PriorityAssessmentPipelineResult extends PriorityResult {
  aiAssessment: AiPriorityAssessmentResult | null;
  guardrailAdjustment: GuardrailAdjustment;
  scoreBreakdown?: PriorityScoreBreakdown;
  assessmentMethod: AssessmentMethod;
  fallbackReason?: string | null;
}

/** Persisted in PriorityAssessment.scoreBreakdown */
export interface PriorityScoreBreakdown {
  aiAssessment?: AiPriorityAssessmentResult | null;
  guardrailAdjustment?: GuardrailAdjustment;
  weightedIndicators?: Record<string, number>;
}

export interface ReliabilityResult {
  sourceScore: number;
  consistencyScore: number;
  recencyScore: number;
  finalScore: number;
  breakdown?: Record<string, number>;
  evidence?: string[];
}

export interface RiskProjectionResult {
  riskLevel: RiskLevel;
  trend: RiskTrend;
  confidenceScore: number;
  reasoning?: string[];
  currentScore?: number;
  horizons?: Array<{
    label: string;
    hours: number;
    score: number;
    riskLevel: RiskLevel;
    trend: RiskTrend;
  }>;
  breakdown?: Record<string, number>;
}

export interface SavedAnalysisIds {
  reportId: string;
  sourceId: string;
  extractedEntityIds: string[];
  locationIds: string[];
  crisisId: string | null;
  humanitarianNeedIds: string[];
  reliabilityAssessmentId: string;
  priorityAssessmentId: string;
  riskProjectionId: string | null;
  userActivityId: string;
}

export interface SavedReportAnalysisResponse extends SavedAnalysisIds {
  saved: true;
  nlp: NLPAnalysisResult;
  reliability: ReliabilityResult;
  priority: PriorityResult;
  riskProjection: RiskProjectionResult;
  recommendedActions: string[];
  incidentsCreated?: number;
  incidentReportIds?: string[];
  warnings?: string[];
  locationPending?: boolean;
  locationApproximate?: boolean;
  resolutionStatus?: import("@prisma/client").LocationResolutionStatus;
}

export interface PersistedAnalysisView {
  report: Report & { source: Source };
  extractedEntities: ExtractedEntity[];
  locations: Location[];
  crisis: (Crisis & { humanitarianNeeds: HumanitarianNeed[] }) | null;
  reliabilityAssessment: ReliabilityAssessment;
  priorityAssessment: PriorityAssessment;
  riskProjection: (RiskProjection & { location: Location }) | null;
  recommendedActions: string[];
  insight: ExtendedAnalysisInsight | null;
  nlp?: NLPAnalysisResult;
}

/** @deprecated Prefer SavedReportAnalysisResponse for new analysis endpoints */
export interface ReportAnalysisResponse {
  report: {
    title: string;
    content: string;
    reportDate: string;
    source: ReportInput["source"] | null;
  };
  nlp: NLPAnalysisResult;
  reliability: ReliabilityResult;
  priority: PriorityResult;
  riskProjection: RiskProjectionResult;
}

export interface DashboardStats {
  totalReportsAnalysed: number;
  activeCrises: number;
  criticalPriorityIncidents: number;
  highPriorityIncidents: number;
  criticalRiskZones: number;
  totalAffectedPopulation: number;
  averageReliabilityScore: number;
}

export interface DistributionItem {
  label: string;
  count: number;
  tone: "low" | "medium" | "high" | "critical";
}

export interface CrisisTypeDistributionItem {
  label: string;
  count: number;
  color: string;
}

export interface DashboardSparklines {
  totalReports: number[];
  activeIncidents: number[];
  highPriority: number[];
  peopleAffected: number[];
  criticalRiskZones: number[];
  reliability: number[];
}

export interface DashboardTrends {
  totalReports: number | null;
  activeIncidents: number | null;
  highPriority: number | null;
  peopleAffected: number | null;
  criticalRiskZones: number | null;
  reliability: number | null;
}

export interface DashboardRecentReport {
  id: string;
  title: string;
  reportDate: string;
  analysedAt: string;
  sourceName: string;
  crisisType: string | null;
  location: string | null;
  priorityLevel: PriorityLevel;
  reliabilityScore: number;
  affectedPopulation: number | null;
}

export interface DashboardIncident {
  id: string;
  title: string;
  analysedAt: string;
  crisisType: string | null;
  crisisIconKey: CrisisIconKey;
  cityName: string;
  countryName: string;
  displayLocation: string;
  priorityLevel: PriorityLevel;
  riskLevel: RiskLevel;
  reliabilityScore: number;
  affectedPopulation: number | null;
  masterIncidentId?: string | null;
  supportingReportCount?: number;
  independentSourceCount?: number;
  sourceAgreementPercent?: number;
  correlationVerificationStatus?: string | null;
  dynamicPriorityScore?: number | null;
  dynamicPriorityLevel?: PriorityLevel | null;
}

export interface DashboardAffectedLocation {
  name: string;
  incidentCount: number;
  totalAffectedPopulation: number;
}

export interface DashboardData {
  stats: DashboardStats;
  priorityDistribution: DistributionItem[];
  riskDistribution: DistributionItem[];
  crisisTypeDistribution: CrisisTypeDistributionItem[];
  riskProjectionTrend: number[];
  sparklines: DashboardSparklines;
  trends: DashboardTrends;
  recentReports: DashboardRecentReport[];
  latestIncidents: DashboardIncident[];
  topAffectedLocations: DashboardAffectedLocation[];
  recentAlerts: DashboardAlert[];
  researchAnalytics: ResearchAnalytics;
  sourceStatistics: SourceStatisticsDashboard;
  reportsToday: number;
  connectedSources: number;
  executiveOverview: ExecutiveOverview;
  countryDistribution: CrisisTypeDistributionItem[];
  reliabilityDistribution: DistributionItem[];
}

/** Above-the-fold dashboard payload — loaded in the initial RSC. */
export interface DashboardCoreData {
  stats: DashboardStats;
  sparklines: DashboardSparklines;
  trends: DashboardTrends;
  reportsToday: number;
  connectedSources: number;
  recentAlerts: DashboardAlert[];
}

/** Heavier chart and analytics panels — loaded client-side after navigation. */
export interface DashboardPanelsData {
  priorityDistribution: DistributionItem[];
  riskDistribution: DistributionItem[];
  crisisTypeDistribution: CrisisTypeDistributionItem[];
  riskProjectionTrend: number[];
  latestIncidents: DashboardIncident[];
  recentAlerts: DashboardAlert[];
  researchAnalytics: ResearchAnalytics;
  sourceStatistics: SourceStatisticsDashboard;
  countryDistribution: CrisisTypeDistributionItem[];
  reliabilityDistribution: DistributionItem[];
}

export interface SourceVerificationSummary {
  id: string;
  consensusScore: number;
  agreementLevel: AgreementLevel;
  comparedSources: number;
  sourceNames: string[];
  sourceAgreementScore: number;
  informationConsistencyScore: number;
  sourceConsensusPercentage: number;
  finalConfidenceScore: number;
  country: string;
  city: string;
  crisisType: string;
  verificationStatus: EvidenceVerificationStatus;
  sourceDiversity: number;
  sourceReliability: number;
  totalSources: number;
}

export interface DashboardAlert {
  id: string;
  title: string;
  description: string;
  country: string;
  city: string;
  crisisType: string;
  riskLevel: RiskLevel;
  alertType: AlertType;
  createdAt: string;
  priorityLevel?: PriorityLevel;
  reliabilityScore?: number;
  sourceCount?: number;
  reportId?: string;
  correlationVerificationStatus?: string;
  dynamicPriorityScore?: number;
}

export interface ExecutiveOverview {
  activeCrises: number;
  criticalIncidents: number;
  highRiskZones: number;
  mostAffectedRegion: string | null;
  mostReliableIncident: { title: string; score: number } | null;
  highestRiskLocation: string | null;
}

export interface EvaluationMetrics {
  locationExtractionAccuracy: number;
  needClassificationAccuracy: number;
  priorityClassificationAccuracy: number;
  riskProjectionAccuracy: number;
  sourceAgreementPercent: number;
  sourceAgreementCount: number;
  systemPerformance: {
    reportsProcessed: number;
    activeCrises: number;
    averageReliability: number;
    ingestionSuccessRate: number;
  };
}

export interface ResearchAnalytics {
  totalSourcesAnalysed: number;
  averageSourceAgreement: number;
  mostVerifiedCrisis: string | null;
  highestReliabilityIncident: { title: string; score: number } | null;
  topCountries: { country: string; incidentCount: number }[];
}

export interface MapHumanitarianNeed {
  needType: string;
  severity: string;
  source?: NeedInferenceSource;
  evidence?: string;
  reasoning?: string;
  confidence?: number;
}

export interface MapRelatedLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface MapRiskZone {
  id: string;
  locationId: string;
  locationName: string;
  cityName: string;
  countryName: string;
  displayLocation: string;
  regionLabel: string | null;
  latitude: number;
  longitude: number;
  riskLevel: RiskLevel;
  trend: RiskTrend;
  confidenceScore: number;
  crisisType: string | null;
  crisisIconKey: CrisisIconKey;
  priorityLevel: PriorityLevel | null;
  reliabilityScore: number | null;
  affectedPopulation: number | null;
  humanitarianNeeds: MapHumanitarianNeed[];
  reportId: string | null;
  reportTitle: string | null;
  radiusMeters: number;
  fillColor: string;
  boundaryPolygon: [number, number][] | null;
  relatedLocations: MapRelatedLocation[];
  sourceNames: string[];
  consensusScore: number | null;
  verificationStatus: EvidenceVerificationStatus;
  locationVerified: boolean;
  locationConfidence: number | null;
  coordinatePrecision: "exact" | "approximate" | "country_centroid" | "unknown";
  reportDate: string | null;
  primarySource: string | null;
  locationPending?: boolean;
  masterIncidentId?: string | null;
  supportingReportCount?: number;
  independentSourceCount?: number;
  sourceAgreementPercent?: number;
  correlationVerificationStatus?: string | null;
  dynamicPriorityScore?: number | null;
  dynamicPriorityLevel?: PriorityLevel | null;
  linkedReportIds?: string[];
}

export interface MapStatistics {
  totalZones: number;
  criticalZones: number;
  highZones: number;
  mediumZones: number;
  lowZones: number;
  totalAffectedPopulation: number;
  crisisTypes: string[];
}

export interface MapPageData {
  zones: MapRiskZone[];
  statistics: MapStatistics;
  latestIncidents: MapRiskZone[];
}

export interface IngestedArticle {
  externalId: string;
  title: string;
  content: string;
  reportDate: string;
  source: NonNullable<ReportInput["source"]>;
  url?: string;
  providerId?: IngestionProviderId;
}

export interface SourceFetchResult {
  articles: IngestedArticle[];
  requestUrl: string;
  responseStatus: number;
  rawCount: number;
}

export interface AiLocationResult {
  name: string;
  country: string;
}

export interface AiEntityResult {
  subtype: string;
  name: string;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AiHumanitarianNeedResult {
  needType: string;
  severity?: string;
  reason?: string;
}

export interface AiIncidentResult {
  country: string;
  city?: string | null;
  region?: string | null;
  crisisType: string;
  humanitarianNeeds: string[];
  needDetails?: AiHumanitarianNeedResult[];
  entities?: AiEntityResult[];
  affectedPopulation: number | null;
  priorityLevel: PriorityLevel;
  priorityReasons?: string[];
  riskLevel: RiskLevel;
  riskTrend: RiskTrend;
  riskReasons?: string[];
  reliabilityScore?: number | null;
  reliabilityReasons?: string[];
  segmentSummary: string;
  situationSummary?: string;
  crisisExplanation?: string;
}

export interface AiAnalysisResult {
  locations: AiLocationResult[];
  entities?: AiEntityResult[];
  crisisType: string;
  crisisExplanation?: string;
  humanitarianNeeds: string[];
  needDetails?: AiHumanitarianNeedResult[];
  affectedPopulation: number | null;
  severityIndicators: string[];
  priorityLevel: PriorityLevel;
  priorityReasons?: string[];
  riskLevel: RiskLevel;
  riskTrend: RiskTrend;
  riskReasons?: string[];
  reliabilityScore?: number | null;
  reliabilityReasons?: string[];
  recommendedActions: string[];
  situationSummary?: string;
  incidents?: AiIncidentResult[];
}

export type IngestionProviderId =
  | "GDELT"
  | "RELIEFWEB"
  | "NEWSAPI"
  | "UNNEWS"
  | "GDACS"
  | "USGS"
  | "EONET"
  | "GUARDIAN"
  | "RSS"
  | "OCHA"
  | "ACLED"
  | "HDX"
  | "MANUAL";

export type SyncPhase =
  | "idle"
  | "fetching"
  | "importing"
  | "analyzing"
  | "updating_database"
  | "updating_map"
  | "background_processing"
  | "completed"
  | "error";

export interface ReportProcessingCounts {
  imported: number;
  queued: number;
  analysing: number;
  intelligenceReady: number;
  failed: number;
}

/** Live processing queue — single source of truth for all UI counters. */
export interface BackgroundProcessingSnapshot {
  queue: ProcessingQueueSnapshot;
}

export interface SyncStatusSnapshot {
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  maxReportsPerSync: number;
  enabledProviders: IngestionProviderId[];
  phase: SyncPhase;
  phaseMessage: string;
  isRunning: boolean;
  backgroundProcessing: BackgroundProcessingSnapshot;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  nextScheduledSyncAt: string | null;
  lastFetchedCount: number;
  lastAnalysedCount: number;
  lastSavedCount: number;
  lastSkippedCount: number;
  lastPreviouslyAnalysedCount?: number;
  lastNewImportCount?: number;
  lastRequeuedCount?: number;
  lastPendingAnalysisCount?: number;
  lastFailedDuplicateCount?: number;
  lastFailedMissingCoordsCount?: number;
  lastFailedDbErrorCount?: number;
  lastFailedAiInvalidJsonCount?: number;
  lastLocationPendingCount?: number;
  lastUsedSources: IngestionProviderId[];
  lastError: string | null;
  /** @deprecated Use lastSuccessfulSyncAt */
  lastSyncAt: string | null;
  /** @deprecated Use lastSyncCompletedAt */
  lastCompletedAt: string | null;
  /** @deprecated Use nextScheduledSyncAt */
  nextSyncAt: string | null;
  newIncidentsCount: number;
  warnings: string[];
  lastFetchDurationMs?: number | null;
  lastSaveDurationMs?: number | null;
  lastSyncTiming?: import("@/lib/syncTimingLogger").SyncTimingBreakdown | null;
}

export type WarningSeverity = "info" | "warning" | "critical";

export interface FormattedWarning {
  id: string;
  message: string;
  severity: WarningSeverity;
  timestamp: string;
  groupKey: string;
  count: number;
  technicalDetails?: string;
  source?: string;
  reportId?: string;
}

export interface GroupedWarning {
  groupKey: string;
  message: string;
  severity: WarningSeverity;
  count: number;
  timestamp: string;
  technicalDetails?: string;
  source?: string;
}

export type IngestionSourceStatus =
  | "available"
  | "requires_api_key"
  | "rate_limited"
  | "disabled";

export interface IngestionSourceInfo {
  id: IngestionProviderId;
  name: string;
  status: IngestionSourceStatus;
  statusMessage: string;
}

export type IngestionSourceRunStatus =
  | "success"
  | "failed"
  | "skipped"
  | "rate_limited"
  | "requires_api_key";

export type IngestionZeroReason =
  | "no_events_found"
  | "authentication_failed"
  | "rate_limited"
  | "invalid_endpoint"
  | "api_unavailable"
  | "parsing_failed"
  | "keyword_filtered"
  | "requires_api_key"
  | "disabled"
  | "skipped";

export interface IngestionSourceSummary {
  source: IngestionProviderId;
  status: IngestionSourceRunStatus;
  fetchedCount: number;
  rawFetchedCount?: number;
  afterDedupCount?: number;
  insertedCount?: number;
  duplicatesSkipped?: number;
  error?: string;
  zeroReason?: IngestionZeroReason;
  zeroReasonLabel?: string;
  requestUrl?: string;
  responseStatus?: number;
  durationMs?: number;
}

export interface IngestionSyncSummary {
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  skippedSources: number;
  fetchedArticles: number;
  insertedIncidents: number;
  duplicatesRemoved: number;
  durationMs: number;
}

export interface ManualImportArticle {
  title: string;
  content: string;
  reportDate?: string;
  sourceName?: string;
  sourceType?: SourceType;
  sourceCredibility?: number;
  sourceUrl?: string;
}

export interface IngestionRunOptions {
  source: IngestionSource;
  keyword: IngestionKeyword;
  limit?: number;
  manualArticles?: ManualImportArticle[];
}

export interface IngestionItemError {
  title: string;
  message: string;
}

export interface IngestionRunResult {
  fetchedCount: number;
  analysedCount: number;
  savedCount: number;
  skippedCount: number;
  failedDuplicateCount?: number;
  failedMissingCoordsCount?: number;
  failedDbErrorCount?: number;
  failedAiInvalidJsonCount?: number;
  locationPendingCount?: number;
  locationVerifiedCount?: number;
  locationApproximateCount?: number;
  errors: IngestionItemError[];
  reportIds: string[];
  sourceSummaries: IngestionSourceSummary[];
  syncSummary?: IngestionSyncSummary;
  manualImportSuggested: boolean;
  queuedCount?: number;
  /** Reports already in DB and fully analysed (skipped). */
  previouslyAnalysedCount?: number;
  /** New report rows created this sync. */
  newImportCount?: number;
  /** Existing reports queued for analysis this sync. */
  requeuedCount?: number;
  /** Reports still awaiting analysis after this sync. */
  pendingAnalysisCount?: number;
  syncTiming?: import("@/lib/syncTimingLogger").SyncTimingBreakdown;
}

export type AssessmentMethod = import("@/lib/aiAssessmentUtils").AssessmentMethod;

export interface AssessmentExplanation {
  conclusion: string;
  reasons: string[];
  evidence?: string[];
  assessmentMethod?: AssessmentMethod;
  fallbackReason?: string | null;
}

export interface ReasoningChainStep {
  step: string;
  conclusion: string;
  evidence: string[];
}

export interface AiFinalReasoning {
  whatIsHappening: string;
  whyImportant: string;
  evidenceIncreasing: string[];
  evidenceDecreasing: string[];
  missingInformation: string[];
  assumptionsAvoided: string[];
  aiConfidence: number;
  conclusion: string;
}

export interface AiDimensionReasoning {
  conclusion: string;
  narrative: string;
  reasons: string[];
  evidenceQuotes: string[];
  severityReductionReasons?: string[];
}

export interface CrossSourceAnalysis {
  sources: string[];
  agreementPercent: number;
  reliabilityDelta: { before: number; after: number } | null;
  narrative: string;
  contradictions: string[];
  status: string;
}

export interface LocationReasoning {
  status: "resolved" | "pending" | "approximate";
  narrative: string;
  method: string | null;
  confidencePercent: number;
  steps: string[];
}

export interface IntelligenceReasoningBundle {
  finalReasoning: AiFinalReasoning | null;
  priorityReasoning: AiDimensionReasoning | null;
  reliabilityReasoning: AiDimensionReasoning | null;
  riskReasoning: AiDimensionReasoning | null;
  knownFacts: string[];
  unknownFacts: string[];
}

export interface ExtendedAnalysisInsight {
  sentiment: string | null;
  urgencyLevel: string | null;
  threatDetected: boolean;
  infrastructureDamage: boolean;
  displacementRisk: number | null;
  foodInsecurityRisk: number | null;
  medicalDemand: number | null;
  fieldConfidences: Record<string, number>;
  priorityExplanation: AssessmentExplanation;
  riskExplanation: AssessmentExplanation;
  reliabilityExplanation: AssessmentExplanation;
  situationSummary?: string | null;
  extractionMethod?: string | null;
  aiModel?: string | null;
  crisisExplanation?: string | null;
  confidenceLevel?: string | null;
  evidence?: string[];
  confidenceBreakdown?: Record<string, number>;
  reasoningChain?: ReasoningChainStep[];
  priorityBreakdown?: Record<string, number>;
  riskBreakdown?: Record<string, number>;
  reliabilityBreakdown?: Record<string, number>;
  riskProjections?: {
    current: number;
    forecast24h: number;
    forecast72h: number;
    forecast7d: number;
    trend: RiskTrend;
  };
  aiPriorityAssessment?: AiPriorityAssessmentResult | null;
  guardrailAdjustment?: GuardrailAdjustment | null;
  finalReasoning?: AiFinalReasoning | null;
  priorityReasoning?: AiDimensionReasoning | null;
  reliabilityReasoning?: AiDimensionReasoning | null;
  riskReasoning?: AiDimensionReasoning | null;
  knownFacts?: string[];
  unknownFacts?: string[];
  crossSourceAnalysis?: CrossSourceAnalysis | null;
  locationReasoning?: LocationReasoning | null;
  pipelineVersion?: string | null;
  disasterSeverity?: DisasterSeverityAssessment | null;
  assessmentMethod?: AssessmentMethod | null;
  assessmentFallbackReason?: string | null;
  humanitarianReasoning?: import("@/lib/humanitarianAnalystReasoning").HumanitarianReasoningContext | null;
  analyticalRiskProjection?: AnalyticalRiskProjection | null;
  reanalysisReason?: string | null;
  reanalyzedAt?: string | null;
}

export type RiskTrajectoryTrend = "improving" | "stable" | "worsening";

export interface AnalyticalRiskProjection {
  currentScore: number;
  forecast24h: number;
  forecast72h: number;
  forecast7d: number;
  trend: RiskTrajectoryTrend;
  riskLevel: RiskLevel;
  confidence: number;
  riskNarrative: string;
  currentRiskReason: string;
  forecast24hReason: string;
  forecast72hReason: string;
  forecast7dReason: string;
  riskDrivers: string[];
  riskMitigatingFactors: string[];
  uncertainties: string[];
  similarCasesInfluence: string[];
}

export interface SourceHealthStats {
  providerId: IngestionProviderId;
  name: string;
  totalFetched: number;
  totalSaved: number;
  duplicatesSkipped: number;
  failedRequests: number;
  uptimeScore: number;
  reliabilityScore: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  status: IngestionSourceStatus;
}

export interface SourceStatisticsDashboard {
  sources: SourceHealthStats[];
  totalReportsToday: number;
  connectedSources: number;
  weeklyIngestionTrend: number[];
}
