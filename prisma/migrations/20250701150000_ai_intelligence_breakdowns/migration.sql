-- AI intelligence breakdown fields for transparency and dynamic scoring

ALTER TABLE "PriorityAssessment" ADD COLUMN IF NOT EXISTS "scoreBreakdown" JSONB;
ALTER TABLE "ReliabilityAssessment" ADD COLUMN IF NOT EXISTS "scoreBreakdown" JSONB;
ALTER TABLE "RiskProjection" ADD COLUMN IF NOT EXISTS "scoreBreakdown" JSONB;
ALTER TABLE "RiskProjection" ADD COLUMN IF NOT EXISTS "projections" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "evidence" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "confidenceBreakdown" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "reasoningChain" JSONB;
