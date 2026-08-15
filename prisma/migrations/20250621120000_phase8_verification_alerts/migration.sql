-- Phase 8: Multi-source verification and smart alerts

CREATE TYPE "AgreementLevel" AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE "AlertType" AS ENUM (
  'NEW_CRISIS',
  'ESCALATION',
  'HIGH_PRIORITY',
  'CRITICAL_PRIORITY',
  'MULTI_SOURCE_CONFIRMATION'
);

CREATE TABLE "SourceVerification" (
  "id" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "crisisType" TEXT NOT NULL,
  "consensusScore" DOUBLE PRECISION NOT NULL,
  "agreementLevel" "AgreementLevel" NOT NULL,
  "sourceAgreementScore" DOUBLE PRECISION NOT NULL,
  "informationConsistencyScore" DOUBLE PRECISION NOT NULL,
  "sourceConsensusPercentage" DOUBLE PRECISION NOT NULL,
  "finalConfidenceScore" DOUBLE PRECISION NOT NULL,
  "comparedSources" INTEGER NOT NULL,
  "sourceNames" JSONB NOT NULL,
  "reportIds" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SourceVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SourceVerification_country_city_crisisType_idx"
  ON "SourceVerification"("country", "city", "crisisType");
CREATE INDEX "SourceVerification_createdAt_idx"
  ON "SourceVerification"("createdAt");

CREATE TABLE "Alert" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "crisisType" TEXT NOT NULL,
  "riskLevel" "RiskLevel" NOT NULL,
  "alertType" "AlertType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");
CREATE INDEX "Alert_alertType_idx" ON "Alert"("alertType");
CREATE INDEX "Alert_riskLevel_idx" ON "Alert"("riskLevel");
