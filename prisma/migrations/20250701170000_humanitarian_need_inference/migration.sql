-- CreateEnum
CREATE TYPE "NeedInferenceSource" AS ENUM ('Observed', 'Inferred');

-- AlterTable
ALTER TABLE "HumanitarianNeed" ADD COLUMN "source" "NeedInferenceSource",
ADD COLUMN "evidence" TEXT,
ADD COLUMN "reasoning" TEXT,
ADD COLUMN "confidenceScore" DOUBLE PRECISION;
