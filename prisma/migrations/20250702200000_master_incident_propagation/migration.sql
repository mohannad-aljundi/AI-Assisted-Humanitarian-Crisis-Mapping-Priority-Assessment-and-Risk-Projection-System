-- Master incident operational propagation — denormalised cluster intelligence on linked reports
ALTER TABLE "MasterIncidentMember" ADD COLUMN "operationalSyncedAt" TIMESTAMP(3);

ALTER TABLE "ReportInsight" ADD COLUMN "clusterOperational" JSONB;
