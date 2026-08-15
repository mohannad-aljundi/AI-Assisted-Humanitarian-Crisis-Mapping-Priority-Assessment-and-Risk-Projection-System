-- AI intelligence layer: entities, timeline, insight extensions, dedup fields

-- AlterEnum: add new ExtractedEntityType values
ALTER TYPE "ExtractedEntityType" ADD VALUE IF NOT EXISTS 'FACILITY';
ALTER TYPE "ExtractedEntityType" ADD VALUE IF NOT EXISTS 'INFRASTRUCTURE';
ALTER TYPE "ExtractedEntityType" ADD VALUE IF NOT EXISTS 'GEOGRAPHIC';

-- Report dedup / fusion fields
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "contentFingerprint" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "duplicateOfReportId" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "fusedSourceCount" INTEGER NOT NULL DEFAULT 1;

-- ExtractedEntity subtype
ALTER TABLE "ExtractedEntity" ADD COLUMN IF NOT EXISTS "entitySubtype" TEXT;
CREATE INDEX IF NOT EXISTS "ExtractedEntity_entitySubtype_idx" ON "ExtractedEntity"("entitySubtype");

-- ReportInsight AI fields
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "situationSummary" TEXT;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "extractionMethod" TEXT;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "aiModel" TEXT;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "crisisExplanation" TEXT;
ALTER TABLE "ReportInsight" ADD COLUMN IF NOT EXISTS "confidenceLevel" TEXT;

-- Crisis timeline events
CREATE TABLE IF NOT EXISTS "CrisisTimelineEvent" (
    "id" TEXT NOT NULL,
    "crisisId" TEXT,
    "reportId" TEXT,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrisisTimelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrisisTimelineEvent_crisisId_idx" ON "CrisisTimelineEvent"("crisisId");
CREATE INDEX IF NOT EXISTS "CrisisTimelineEvent_reportId_idx" ON "CrisisTimelineEvent"("reportId");
CREATE INDEX IF NOT EXISTS "CrisisTimelineEvent_occurredAt_idx" ON "CrisisTimelineEvent"("occurredAt");

ALTER TABLE "CrisisTimelineEvent" DROP CONSTRAINT IF EXISTS "CrisisTimelineEvent_crisisId_fkey";
ALTER TABLE "CrisisTimelineEvent" ADD CONSTRAINT "CrisisTimelineEvent_crisisId_fkey"
    FOREIGN KEY ("crisisId") REFERENCES "Crisis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
