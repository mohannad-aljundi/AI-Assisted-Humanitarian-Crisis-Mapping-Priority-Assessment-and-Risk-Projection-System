-- CreateTable
CREATE TABLE "IngestionSourceHealth" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "totalFetched" INTEGER NOT NULL DEFAULT 0,
    "totalSaved" INTEGER NOT NULL DEFAULT 0,
    "failedRequests" INTEGER NOT NULL DEFAULT 0,
    "successfulRuns" INTEGER NOT NULL DEFAULT 0,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "uptimeScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reliabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSourceHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportInsight" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sentiment" TEXT,
    "urgencyLevel" TEXT,
    "threatDetected" BOOLEAN NOT NULL DEFAULT false,
    "infrastructureDamage" BOOLEAN NOT NULL DEFAULT false,
    "displacementRisk" DOUBLE PRECISION,
    "foodInsecurityRisk" DOUBLE PRECISION,
    "medicalDemand" DOUBLE PRECISION,
    "fieldConfidences" JSONB,
    "priorityExplanation" JSONB,
    "riskExplanation" JSONB,
    "reliabilityExplanation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestionSourceHealth_providerId_key" ON "IngestionSourceHealth"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportInsight_reportId_key" ON "ReportInsight"("reportId");

-- AddForeignKey
ALTER TABLE "ReportInsight" ADD CONSTRAINT "ReportInsight_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
