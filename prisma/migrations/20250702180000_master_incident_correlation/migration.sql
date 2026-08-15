-- CreateTable
CREATE TABLE "MasterIncident" (
    "id" TEXT NOT NULL,
    "canonicalReportId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "crisisType" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "supportingReportCount" INTEGER NOT NULL DEFAULT 1,
    "independentSourceCount" INTEGER NOT NULL DEFAULT 1,
    "sourceAgreementPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timelineConsistency" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "evidenceStrength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "correlationVerificationStatus" TEXT NOT NULL DEFAULT 'Pending Review',
    "dynamicPriorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dynamicPriorityLevel" "PriorityLevel" NOT NULL DEFAULT 'Medium',
    "sourceNames" JSONB NOT NULL DEFAULT '[]',
    "reportIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterIncidentMember" (
    "id" TEXT NOT NULL,
    "masterIncidentId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCanonical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterIncidentMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterIncident_canonicalReportId_key" ON "MasterIncident"("canonicalReportId");

-- CreateIndex
CREATE INDEX "MasterIncident_dynamicPriorityScore_idx" ON "MasterIncident"("dynamicPriorityScore");

-- CreateIndex
CREATE INDEX "MasterIncident_correlationVerificationStatus_idx" ON "MasterIncident"("correlationVerificationStatus");

-- CreateIndex
CREATE INDEX "MasterIncident_country_city_crisisType_idx" ON "MasterIncident"("country", "city", "crisisType");

-- CreateIndex
CREATE INDEX "MasterIncident_updatedAt_idx" ON "MasterIncident"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MasterIncidentMember_reportId_key" ON "MasterIncidentMember"("reportId");

-- CreateIndex
CREATE INDEX "MasterIncidentMember_masterIncidentId_idx" ON "MasterIncidentMember"("masterIncidentId");

-- AddForeignKey
ALTER TABLE "MasterIncidentMember" ADD CONSTRAINT "MasterIncidentMember_masterIncidentId_fkey" FOREIGN KEY ("masterIncidentId") REFERENCES "MasterIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterIncidentMember" ADD CONSTRAINT "MasterIncidentMember_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
