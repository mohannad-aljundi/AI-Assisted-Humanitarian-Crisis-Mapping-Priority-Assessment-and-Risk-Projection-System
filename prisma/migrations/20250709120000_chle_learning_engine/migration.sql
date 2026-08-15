-- Continuous Humanitarian Learning Engine (CHLE)

CREATE TYPE "CorrectionField" AS ENUM (
  'PRIORITY',
  'RISK',
  'RELIABILITY',
  'CRISIS_TYPE',
  'CONFIDENCE',
  'HUMANITARIAN_NEED',
  'REPORT_PURPOSE',
  'CRISIS_PHASE',
  'DISASTER_SEVERITY'
);

CREATE TYPE "LearningExampleStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

CREATE TABLE "LearningCase" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "crisisType" TEXT,
  "country" TEXT,
  "city" TEXT,
  "reportPurpose" TEXT,
  "crisisPhase" TEXT,
  "priorityLevel" "PriorityLevel",
  "riskLevel" "RiskLevel",
  "reliabilityScore" DOUBLE PRECISION,
  "confidenceLevel" TEXT,
  "humanitarianNeedsJson" JSONB,
  "evidenceJson" JSONB,
  "contentFingerprint" TEXT,
  "pipelineVersion" TEXT,
  "analystValidated" BOOLEAN NOT NULL DEFAULT false,
  "validatedAt" TIMESTAMP(3),
  "validatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalystFeedback" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "analystId" TEXT,
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalystFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningExample" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "learningCaseId" TEXT,
  "feedbackId" TEXT,
  "field" "CorrectionField" NOT NULL,
  "originalValue" JSONB NOT NULL,
  "correctedValue" JSONB NOT NULL,
  "reason" TEXT,
  "evidence" TEXT,
  "analystId" TEXT,
  "pipelineVersion" TEXT,
  "status" "LearningExampleStatus" NOT NULL DEFAULT 'APPLIED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningExample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReasoningPattern" (
  "id" TEXT NOT NULL,
  "patternKey" TEXT NOT NULL,
  "evidencePattern" TEXT NOT NULL,
  "inferredOutcome" TEXT NOT NULL,
  "outcomeType" TEXT NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "validationCount" INTEGER NOT NULL DEFAULT 0,
  "confidenceBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceReportIds" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReasoningPattern_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InferenceMemory" (
  "id" TEXT NOT NULL,
  "memoryKey" TEXT NOT NULL,
  "mistakeType" TEXT NOT NULL,
  "contextPattern" TEXT NOT NULL,
  "incorrectConclusion" TEXT NOT NULL,
  "correctConclusion" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "sourceReportId" TEXT,
  "analystId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InferenceMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConfidenceCalibration" (
  "id" TEXT NOT NULL,
  "contextKey" TEXT NOT NULL,
  "dimension" TEXT NOT NULL,
  "adjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConfidenceCalibration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoricalOutcome" (
  "id" TEXT NOT NULL,
  "reportId" TEXT,
  "learningCaseId" TEXT,
  "crisisId" TEXT,
  "outcomeSummary" TEXT NOT NULL,
  "outcomeType" TEXT,
  "validatedBy" TEXT,
  "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoricalOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearningCase_reportId_key" ON "LearningCase"("reportId");
CREATE INDEX "LearningCase_crisisType_idx" ON "LearningCase"("crisisType");
CREATE INDEX "LearningCase_country_city_idx" ON "LearningCase"("country", "city");
CREATE INDEX "LearningCase_reportPurpose_idx" ON "LearningCase"("reportPurpose");
CREATE INDEX "LearningCase_crisisPhase_idx" ON "LearningCase"("crisisPhase");
CREATE INDEX "LearningCase_analystValidated_idx" ON "LearningCase"("analystValidated");

CREATE INDEX "AnalystFeedback_reportId_idx" ON "AnalystFeedback"("reportId");
CREATE INDEX "AnalystFeedback_analystId_idx" ON "AnalystFeedback"("analystId");

CREATE INDEX "LearningExample_reportId_idx" ON "LearningExample"("reportId");
CREATE INDEX "LearningExample_field_idx" ON "LearningExample"("field");
CREATE INDEX "LearningExample_analystId_idx" ON "LearningExample"("analystId");
CREATE INDEX "LearningExample_createdAt_idx" ON "LearningExample"("createdAt");

CREATE UNIQUE INDEX "ReasoningPattern_patternKey_key" ON "ReasoningPattern"("patternKey");
CREATE INDEX "ReasoningPattern_outcomeType_idx" ON "ReasoningPattern"("outcomeType");
CREATE INDEX "ReasoningPattern_occurrenceCount_idx" ON "ReasoningPattern"("occurrenceCount");

CREATE UNIQUE INDEX "InferenceMemory_memoryKey_key" ON "InferenceMemory"("memoryKey");
CREATE INDEX "InferenceMemory_mistakeType_idx" ON "InferenceMemory"("mistakeType");
CREATE INDEX "InferenceMemory_contextPattern_idx" ON "InferenceMemory"("contextPattern");

CREATE UNIQUE INDEX "ConfidenceCalibration_contextKey_dimension_key" ON "ConfidenceCalibration"("contextKey", "dimension");
CREATE INDEX "ConfidenceCalibration_dimension_idx" ON "ConfidenceCalibration"("dimension");

CREATE INDEX "HistoricalOutcome_reportId_idx" ON "HistoricalOutcome"("reportId");
CREATE INDEX "HistoricalOutcome_learningCaseId_idx" ON "HistoricalOutcome"("learningCaseId");

ALTER TABLE "LearningCase" ADD CONSTRAINT "LearningCase_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalystFeedback" ADD CONSTRAINT "AnalystFeedback_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningExample" ADD CONSTRAINT "LearningExample_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningExample" ADD CONSTRAINT "LearningExample_learningCaseId_fkey" FOREIGN KEY ("learningCaseId") REFERENCES "LearningCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LearningExample" ADD CONSTRAINT "LearningExample_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "AnalystFeedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HistoricalOutcome" ADD CONSTRAINT "HistoricalOutcome_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HistoricalOutcome" ADD CONSTRAINT "HistoricalOutcome_learningCaseId_fkey" FOREIGN KEY ("learningCaseId") REFERENCES "LearningCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
