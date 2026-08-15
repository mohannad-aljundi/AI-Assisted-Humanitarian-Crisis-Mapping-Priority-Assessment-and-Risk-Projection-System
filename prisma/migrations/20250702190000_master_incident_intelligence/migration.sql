-- CreateTable
CREATE TABLE "MasterIncidentIntelligence" (
    "id" TEXT NOT NULL,
    "masterIncidentId" TEXT NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "situationAssessment" JSONB NOT NULL,
    "humanitarianNeeds" JSONB NOT NULL,
    "evidenceMatrix" JSONB NOT NULL,
    "consensus" JSONB NOT NULL,
    "dynamicPriority" JSONB NOT NULL,
    "priorityReasoning" JSONB,
    "riskProjection" JSONB NOT NULL,
    "analystNarrative" TEXT NOT NULL,
    "timeline" JSONB NOT NULL,
    "sourceReliability" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "verification" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL,
    "sourceReportIds" JSONB NOT NULL DEFAULT '[]',
    "memberCountAtAnalysis" INTEGER NOT NULL DEFAULT 1,
    "aiModel" TEXT,
    "lastAnalysed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterIncidentIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterIncidentIntelligence_masterIncidentId_key" ON "MasterIncidentIntelligence"("masterIncidentId");

-- CreateIndex
CREATE INDEX "MasterIncidentIntelligence_pipelineVersion_idx" ON "MasterIncidentIntelligence"("pipelineVersion");

-- CreateIndex
CREATE INDEX "MasterIncidentIntelligence_lastAnalysed_idx" ON "MasterIncidentIntelligence"("lastAnalysed");

-- AddForeignKey
ALTER TABLE "MasterIncidentIntelligence" ADD CONSTRAINT "MasterIncidentIntelligence_masterIncidentId_fkey" FOREIGN KEY ("masterIncidentId") REFERENCES "MasterIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
