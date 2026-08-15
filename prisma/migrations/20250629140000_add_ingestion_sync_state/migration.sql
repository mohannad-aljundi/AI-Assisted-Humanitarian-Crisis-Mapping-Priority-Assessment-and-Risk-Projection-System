-- CreateTable
CREATE TABLE "IngestionSyncState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastSyncStartedAt" TIMESTAMP(3),
    "lastSyncCompletedAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "nextScheduledSyncAt" TIMESTAMP(3),
    "lastFetchedCount" INTEGER NOT NULL DEFAULT 0,
    "lastAnalysedCount" INTEGER NOT NULL DEFAULT 0,
    "lastSavedCount" INTEGER NOT NULL DEFAULT 0,
    "lastSkippedCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedSources" JSONB NOT NULL DEFAULT '[]',
    "lastError" TEXT,
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSyncState_pkey" PRIMARY KEY ("id")
);

-- Seed singleton row
INSERT INTO "IngestionSyncState" ("id", "updatedAt")
VALUES ('singleton', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
