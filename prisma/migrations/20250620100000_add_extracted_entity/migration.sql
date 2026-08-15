-- CreateEnum
CREATE TYPE "ExtractedEntityType" AS ENUM ('LOCATION', 'CRISIS_TYPE', 'HUMANITARIAN_NEED', 'AFFECTED_POPULATION');

-- CreateTable
CREATE TABLE "ExtractedEntity" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "entityType" "ExtractedEntityType" NOT NULL,
    "value" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "severity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractedEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtractedEntity_reportId_idx" ON "ExtractedEntity"("reportId");

-- CreateIndex
CREATE INDEX "ExtractedEntity_entityType_idx" ON "ExtractedEntity"("entityType");

-- AddForeignKey
ALTER TABLE "ExtractedEntity" ADD CONSTRAINT "ExtractedEntity_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
