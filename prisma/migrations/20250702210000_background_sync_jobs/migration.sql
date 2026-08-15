-- CreateEnum
CREATE TYPE "ReportProcessingStatus" AS ENUM ('IMPORTED', 'QUEUED', 'ANALYSING', 'INTELLIGENCE_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "BackgroundJobType" AS ENUM ('REPORT_ANALYSIS', 'MASTER_INTELLIGENCE', 'CHLE_RECORD');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "processingStatus" "ReportProcessingStatus" NOT NULL DEFAULT 'IMPORTED';
ALTER TABLE "Report" ADD COLUMN "processingError" TEXT;

-- AlterTable
ALTER TABLE "IngestionSyncState" ADD COLUMN "backgroundJobsPending" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IngestionSyncState" ADD COLUMN "lastFetchDurationMs" INTEGER;
ALTER TABLE "IngestionSyncState" ADD COLUMN "lastSaveDurationMs" INTEGER;
ALTER TABLE "IngestionSyncState" ADD COLUMN "lastSyncTiming" JSONB;

-- CreateIndex
CREATE INDEX "Report_processingStatus_idx" ON "Report"("processingStatus");

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "type" "BackgroundJobType" NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "timingMs" JSONB,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackgroundJob_status_runAfter_idx" ON "BackgroundJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "BackgroundJob_type_status_idx" ON "BackgroundJob"("type", "status");

-- Backfill existing analysed reports
UPDATE "Report" SET "processingStatus" = 'INTELLIGENCE_READY'
WHERE "id" IN (SELECT "reportId" FROM "ReportInsight" WHERE "pipelineVersion" IS NOT NULL);
