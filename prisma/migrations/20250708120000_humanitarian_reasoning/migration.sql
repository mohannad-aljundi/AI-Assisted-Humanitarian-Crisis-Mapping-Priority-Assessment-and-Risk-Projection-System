-- Analyst reasoning context for evidence-first humanitarian needs
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "humanitarianReasoning" JSONB;
