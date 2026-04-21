-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ComplianceOnboardingStatus" ADD VALUE 'DRAFT';
ALTER TYPE "ComplianceOnboardingStatus" ADD VALUE 'CSR_GENERATED';
ALTER TYPE "ComplianceOnboardingStatus" ADD VALUE 'OTP_PENDING';
ALTER TYPE "ComplianceOnboardingStatus" ADD VALUE 'CSR_SUBMITTED';
ALTER TYPE "ComplianceOnboardingStatus" ADD VALUE 'CERTIFICATE_ISSUED';
ALTER TYPE "ComplianceOnboardingStatus" ADD VALUE 'RENEWAL_REQUIRED';
ALTER TYPE "ComplianceOnboardingStatus" ADD VALUE 'FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ComplianceCertificateStatus" ADD VALUE 'OTP_PENDING';
ALTER TYPE "ComplianceCertificateStatus" ADD VALUE 'CSR_SUBMITTED';
ALTER TYPE "ComplianceCertificateStatus" ADD VALUE 'CERTIFICATE_ISSUED';
ALTER TYPE "ComplianceCertificateStatus" ADD VALUE 'FAILED';

COMMIT;

-- AlterTable
ALTER TABLE "ComplianceOnboarding" ADD COLUMN     "branchName" TEXT,
ADD COLUMN     "certificateBase64" TEXT,
ADD COLUMN     "certificatePem" TEXT,
ADD COLUMN     "certificateSecret" TEXT,
ADD COLUMN     "commonName" TEXT,
ADD COLUMN     "countryCode" TEXT DEFAULT 'SA',
ADD COLUMN     "csrBase64" TEXT,
ADD COLUMN     "csrGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "csrPem" TEXT,
ADD COLUMN     "csrSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "egsSerialNumber" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "locationAddress" TEXT,
ADD COLUMN     "organizationName" TEXT,
ADD COLUMN     "organizationUnitName" TEXT,
ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpReceivedAt" TIMESTAMP(3),
ADD COLUMN     "privateKeyPem" TEXT,
ADD COLUMN     "publicKeyPem" TEXT,
ADD COLUMN     "vatNumber" TEXT,
ADD COLUMN     "zatcaRequestId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

