-- Explainable AI reasoning fields on ReportInsight
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "finalReasoning" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "priorityReasoning" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "reliabilityReasoning" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "riskReasoning" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "knownFacts" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "unknownFacts" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "crossSourceAnalysis" JSONB;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "locationReasoning" JSONB;
