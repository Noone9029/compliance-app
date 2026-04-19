/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,sourceProvider,sourceExternalId]` on the table `SalesInvoice` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "sourceConnectorAccountId" TEXT,
ADD COLUMN     "sourceExternalId" TEXT,
ADD COLUMN     "sourcePayload" JSONB,
ADD COLUMN     "sourceProvider" "ConnectorProvider";

-- AlterTable
ALTER TABLE "ZatcaSubmission" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "SalesInvoice_sourceConnectorAccountId_idx" ON "SalesInvoice"("sourceConnectorAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_organizationId_sourceProvider_sourceExternalId_key" ON "SalesInvoice"("organizationId", "sourceProvider", "sourceExternalId");
