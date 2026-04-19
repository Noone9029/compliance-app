-- CreateEnum
CREATE TYPE "ComplianceSubmissionFlow" AS ENUM ('CLEARANCE', 'REPORTING');

-- CreateEnum
CREATE TYPE "ComplianceOnboardingStatus" AS ENUM ('NOT_STARTED', 'PENDING_CONFIGURATION', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "ComplianceCertificateStatus" AS ENUM ('NOT_REQUESTED', 'CSR_GENERATED', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "ComplianceFailureCategory" AS ENUM ('CONFIGURATION', 'AUTHENTICATION', 'CONNECTIVITY', 'VALIDATION', 'ZATCA_REJECTION', 'TERMINAL', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ComplianceDocumentStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "ComplianceDocumentStatus" ADD VALUE 'RETRY_SCHEDULED';
ALTER TYPE "ComplianceDocumentStatus" ADD VALUE 'CLEARED';
ALTER TYPE "ComplianceDocumentStatus" ADD VALUE 'CLEARED_WITH_WARNINGS';
ALTER TYPE "ComplianceDocumentStatus" ADD VALUE 'REPORTED_WITH_WARNINGS';
ALTER TYPE "ComplianceDocumentStatus" ADD VALUE 'REJECTED';

-- AlterEnum
BEGIN;
CREATE TYPE "SubmissionStatus_new" AS ENUM ('QUEUED', 'PROCESSING', 'ACCEPTED', 'ACCEPTED_WITH_WARNINGS', 'RETRY_SCHEDULED', 'REJECTED', 'FAILED');
ALTER TABLE "public"."ZatcaSubmission" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ComplianceDocument" ALTER COLUMN "lastSubmissionStatus" TYPE "SubmissionStatus_new" USING (
    CASE
        WHEN "lastSubmissionStatus" IS NULL THEN NULL
        WHEN "lastSubmissionStatus"::text = 'SUCCESS' THEN 'ACCEPTED'::text
        ELSE "lastSubmissionStatus"::text
    END::"SubmissionStatus_new"
);
ALTER TABLE "ZatcaSubmission" ALTER COLUMN "status" TYPE "SubmissionStatus_new" USING (
    CASE
        WHEN "status"::text = 'SUCCESS' THEN 'ACCEPTED'::text
        ELSE "status"::text
    END::"SubmissionStatus_new"
);
ALTER TYPE "SubmissionStatus" RENAME TO "SubmissionStatus_old";
ALTER TYPE "SubmissionStatus_new" RENAME TO "SubmissionStatus";
DROP TYPE "public"."SubmissionStatus_old";
ALTER TABLE "ZatcaSubmission" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
COMMIT;

-- DropIndex
DROP INDEX "ZatcaSubmission_organizationId_submittedAt_idx";

-- AlterTable
ALTER TABLE "ComplianceDocument" ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "externalSubmissionId" TEXT,
ADD COLUMN     "failureCategory" "ComplianceFailureCategory",
ADD COLUMN     "invoiceCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onboardingId" TEXT,
ADD COLUMN     "reportedAt" TIMESTAMP(3),
ADD COLUMN     "submissionFlow" "ComplianceSubmissionFlow" NOT NULL DEFAULT 'REPORTING',
ADD COLUMN     "xmlContent" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ComplianceEvent" ADD COLUMN     "complianceOnboardingId" TEXT,
ADD COLUMN     "zatcaSubmissionId" TEXT;

-- AlterTable
ALTER TABLE "ReportedDocument" ADD COLUMN     "externalSubmissionId" TEXT,
ADD COLUMN     "failureCategory" "ComplianceFailureCategory",
ADD COLUMN     "lastSubmissionStatus" "SubmissionStatus",
ADD COLUMN     "submissionFlow" "ComplianceSubmissionFlow" NOT NULL DEFAULT 'REPORTING';

-- AlterTable
ALTER TABLE "ZatcaSubmission" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdAt" TIMESTAMP(3),
ADD COLUMN     "externalSubmissionId" TEXT,
ADD COLUMN     "failureCategory" "ComplianceFailureCategory",
ADD COLUMN     "flow" "ComplianceSubmissionFlow" NOT NULL DEFAULT 'REPORTING',
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "requestedByUserId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

WITH "rankedDocuments" AS (
    SELECT
        cd.id,
        ROW_NUMBER() OVER (
            PARTITION BY cd."organizationId"
            ORDER BY COALESCE(si."issueDate", cd."lastSubmittedAt", cd."createdAt"), si."invoiceNumber", cd.id
        ) AS "invoiceCounter"
    FROM "ComplianceDocument" cd
    JOIN "SalesInvoice" si ON si.id = cd."salesInvoiceId"
)
UPDATE "ComplianceDocument" cd
SET
    "submissionFlow" = CASE
        WHEN si."complianceInvoiceKind" = 'STANDARD' THEN 'CLEARANCE'::"ComplianceSubmissionFlow"
        ELSE 'REPORTING'::"ComplianceSubmissionFlow"
    END,
    "invoiceCounter" = rd."invoiceCounter",
    "status" = CASE
        WHEN cd.status = 'REPORTED'::"ComplianceDocumentStatus" AND si."complianceInvoiceKind" = 'STANDARD'
            THEN 'CLEARED'::"ComplianceDocumentStatus"
        ELSE cd.status
    END,
    "failureCategory" = CASE
        WHEN cd.status = 'FAILED'::"ComplianceDocumentStatus"
            THEN 'UNKNOWN'::"ComplianceFailureCategory"
        ELSE NULL
    END,
    "clearedAt" = CASE
        WHEN si."complianceInvoiceKind" = 'STANDARD'
            THEN COALESCE(cd."lastSubmittedAt", cd."updatedAt", cd."createdAt")
        ELSE NULL
    END,
    "reportedAt" = CASE
        WHEN si."complianceInvoiceKind" <> 'STANDARD'
            THEN COALESCE(cd."lastSubmittedAt", cd."updatedAt", cd."createdAt")
        ELSE NULL
    END
FROM "SalesInvoice" si
, "rankedDocuments" rd
WHERE si.id = cd."salesInvoiceId"
  AND rd.id = cd.id;

UPDATE "ReportedDocument" rd
SET
    "submissionFlow" = CASE
        WHEN si."complianceInvoiceKind" = 'STANDARD' THEN 'CLEARANCE'::"ComplianceSubmissionFlow"
        ELSE 'REPORTING'::"ComplianceSubmissionFlow"
    END,
    "status" = CASE
        WHEN rd.status = 'REPORTED' AND si."complianceInvoiceKind" = 'STANDARD' THEN 'CLEARED'
        ELSE rd.status
    END,
    "lastSubmissionStatus" = COALESCE(cd."lastSubmissionStatus", 'ACCEPTED'::"SubmissionStatus"),
    "failureCategory" = cd."failureCategory",
    "externalSubmissionId" = cd."externalSubmissionId"
FROM "ComplianceDocument" cd
, "SalesInvoice" si
WHERE cd.id = rd."complianceDocumentId"
  AND si.id = rd."salesInvoiceId";

UPDATE "ZatcaSubmission" zs
SET
    "flow" = CASE
        WHEN si."complianceInvoiceKind" = 'STANDARD' THEN 'CLEARANCE'::"ComplianceSubmissionFlow"
        ELSE 'REPORTING'::"ComplianceSubmissionFlow"
    END,
    "attemptCount" = CASE
        WHEN zs.status = 'QUEUED'::"SubmissionStatus" THEN 0
        ELSE 1
    END,
    "availableAt" = COALESCE(zs."submittedAt", CURRENT_TIMESTAMP),
    "lastAttemptAt" = zs."submittedAt",
    "failureCategory" = CASE
        WHEN zs.status = 'FAILED'::"SubmissionStatus" AND zs.retryable THEN 'CONNECTIVITY'::"ComplianceFailureCategory"
        WHEN zs.status = 'FAILED'::"SubmissionStatus" THEN 'UNKNOWN'::"ComplianceFailureCategory"
        ELSE NULL
    END,
    "createdAt" = COALESCE(zs."finishedAt", zs."submittedAt", CURRENT_TIMESTAMP),
    "updatedAt" = COALESCE(zs."finishedAt", zs."submittedAt", CURRENT_TIMESTAMP)
FROM "ComplianceDocument" cd
JOIN "SalesInvoice" si ON si.id = cd."salesInvoiceId"
WHERE cd.id = zs."complianceDocumentId";

ALTER TABLE "ZatcaSubmission" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "ZatcaSubmission" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "ZatcaSubmission" DROP COLUMN "submittedAt";

-- CreateTable
CREATE TABLE "ComplianceOnboarding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceSerial" TEXT NOT NULL,
    "status" "ComplianceOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "certificateStatus" "ComplianceCertificateStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "csid" TEXT,
    "certificateId" TEXT,
    "secretFingerprint" TEXT,
    "certificateIssuedAt" TIMESTAMP(3),
    "certificateExpiresAt" TIMESTAMP(3),
    "lastActivatedAt" TIMESTAMP(3),
    "lastRenewedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZatcaSubmissionAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "complianceDocumentId" TEXT NOT NULL,
    "zatcaSubmissionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "flow" "ComplianceSubmissionFlow" NOT NULL DEFAULT 'REPORTING',
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "endpoint" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "failureCategory" "ComplianceFailureCategory",
    "externalSubmissionId" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ZatcaSubmissionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceOnboarding_organizationId_createdAt_idx" ON "ComplianceOnboarding"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceOnboarding_organizationId_deviceSerial_key" ON "ComplianceOnboarding"("organizationId", "deviceSerial");

-- CreateIndex
CREATE INDEX "ZatcaSubmissionAttempt_organizationId_startedAt_idx" ON "ZatcaSubmissionAttempt"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "ZatcaSubmissionAttempt_zatcaSubmissionId_attemptNumber_idx" ON "ZatcaSubmissionAttempt"("zatcaSubmissionId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ZatcaSubmission_complianceDocumentId_key" ON "ZatcaSubmission"("complianceDocumentId");

-- CreateIndex
CREATE INDEX "ZatcaSubmission_organizationId_status_availableAt_idx" ON "ZatcaSubmission"("organizationId", "status", "availableAt");

-- AddForeignKey
ALTER TABLE "ComplianceOnboarding" ADD CONSTRAINT "ComplianceOnboarding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "ComplianceOnboarding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_complianceOnboardingId_fkey" FOREIGN KEY ("complianceOnboardingId") REFERENCES "ComplianceOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_zatcaSubmissionId_fkey" FOREIGN KEY ("zatcaSubmissionId") REFERENCES "ZatcaSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZatcaSubmissionAttempt" ADD CONSTRAINT "ZatcaSubmissionAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZatcaSubmissionAttempt" ADD CONSTRAINT "ZatcaSubmissionAttempt_complianceDocumentId_fkey" FOREIGN KEY ("complianceDocumentId") REFERENCES "ComplianceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZatcaSubmissionAttempt" ADD CONSTRAINT "ZatcaSubmissionAttempt_zatcaSubmissionId_fkey" FOREIGN KEY ("zatcaSubmissionId") REFERENCES "ZatcaSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

