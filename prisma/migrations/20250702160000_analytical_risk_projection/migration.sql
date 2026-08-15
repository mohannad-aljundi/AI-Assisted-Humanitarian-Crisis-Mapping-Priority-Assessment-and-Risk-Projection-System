-- Analytical risk projection + one-time reanalysis metadata

ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "analyticalRiskProjection" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "reanalysisReason" TEXT;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "reanalyzedAt" TIMESTAMP(3);
