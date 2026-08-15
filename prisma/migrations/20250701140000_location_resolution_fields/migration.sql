-- CreateEnum
CREATE TYPE "LocationResolutionStatus" AS ENUM ('VERIFIED', 'COUNTRY_CENTROID', 'LOCATION_PENDING', 'FAILED');

-- CreateEnum
CREATE TYPE "LocationResolutionMethod" AS ENUM ('AI', 'DATABASE', 'GEONAMES', 'NOMINATIM', 'COUNTRY_CENTROID', 'MANUAL');

-- AlterTable
ALTER TABLE "Location" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "Location" ALTER COLUMN "longitude" DROP NOT NULL;

ALTER TABLE "Location" ADD COLUMN "resolutionStatus" "LocationResolutionStatus" NOT NULL DEFAULT 'VERIFIED';
ALTER TABLE "Location" ADD COLUMN "resolutionMethod" "LocationResolutionMethod";
ALTER TABLE "Location" ADD COLUMN "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.75;
ALTER TABLE "Location" ADD COLUMN "rawLocationText" TEXT;
