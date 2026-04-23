-- CreateEnum
CREATE TYPE "ComplianceValidationStatus" AS ENUM ('PASSED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "ComplianceDocument" ADD COLUMN     "hashMetadata" JSONB,
ADD COLUMN     "qrMetadata" JSONB,
ADD COLUMN     "signatureMetadata" JSONB,
ADD COLUMN     "validationErrors" JSONB,
ADD COLUMN     "validationMetadata" JSONB,
ADD COLUMN     "validationRanAt" TIMESTAMP(3),
ADD COLUMN     "validationStatus" "ComplianceValidationStatus",
ADD COLUMN     "validationWarnings" JSONB;
