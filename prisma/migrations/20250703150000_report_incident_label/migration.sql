-- AlterTable
ALTER TABLE "Report" ADD COLUMN "incidentLabel" TEXT;

-- CreateIndex
CREATE INDEX "Report_incidentLabel_idx" ON "Report"("incidentLabel");
