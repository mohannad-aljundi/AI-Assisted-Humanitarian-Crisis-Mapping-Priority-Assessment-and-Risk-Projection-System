-- Add multi-location crisis region fields
ALTER TABLE "Crisis" ADD COLUMN "centroidLatitude" DOUBLE PRECISION;
ALTER TABLE "Crisis" ADD COLUMN "centroidLongitude" DOUBLE PRECISION;
ALTER TABLE "Crisis" ADD COLUMN "affectedRadiusMeters" DOUBLE PRECISION;
ALTER TABLE "Crisis" ADD COLUMN "boundaryPolygon" JSONB;
ALTER TABLE "Crisis" ADD COLUMN "regionLabel" TEXT;

-- Link crises to multiple related locations
CREATE TABLE "CrisisLocation" (
    "crisisId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "CrisisLocation_pkey" PRIMARY KEY ("crisisId","locationId")
);

CREATE INDEX "CrisisLocation_locationId_idx" ON "CrisisLocation"("locationId");

ALTER TABLE "CrisisLocation" ADD CONSTRAINT "CrisisLocation_crisisId_fkey" FOREIGN KEY ("crisisId") REFERENCES "Crisis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrisisLocation" ADD CONSTRAINT "CrisisLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Optional crisis link on risk projections for aggregated zones
ALTER TABLE "RiskProjection" ADD COLUMN "crisisId" TEXT;

CREATE INDEX "RiskProjection_crisisId_idx" ON "RiskProjection"("crisisId");

ALTER TABLE "RiskProjection" ADD CONSTRAINT "RiskProjection_crisisId_fkey" FOREIGN KEY ("crisisId") REFERENCES "Crisis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
