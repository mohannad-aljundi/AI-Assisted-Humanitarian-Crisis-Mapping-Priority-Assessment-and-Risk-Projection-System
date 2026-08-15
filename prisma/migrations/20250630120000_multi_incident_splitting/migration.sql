-- Multi-incident article splitting: link crises to reports and store article provenance.

ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "articleUrl" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "externalArticleId" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "segmentIndex" INTEGER;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "segmentCountry" TEXT;

CREATE INDEX IF NOT EXISTS "Report_articleUrl_idx" ON "Report"("articleUrl");
CREATE INDEX IF NOT EXISTS "Report_externalArticleId_idx" ON "Report"("externalArticleId");

ALTER TABLE "Crisis" ADD COLUMN IF NOT EXISTS "reportId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Crisis_reportId_key" ON "Crisis"("reportId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Crisis_reportId_fkey'
  ) THEN
    ALTER TABLE "Crisis"
      ADD CONSTRAINT "Crisis_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "Report"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
