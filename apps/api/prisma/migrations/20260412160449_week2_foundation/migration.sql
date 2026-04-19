-- CreateEnum
CREATE TYPE "TaxRateScope" AS ENUM ('SALES', 'PURCHASE', 'BOTH');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('BILLING', 'DELIVERY', 'PRIMARY');

-- CreateEnum
CREATE TYPE "ConnectorProvider" AS ENUM ('XERO', 'QUICKBOOKS_ONLINE', 'ZOHO_BOOKS');

-- CreateEnum
CREATE TYPE "ConnectorAccountStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "ConnectorSyncDirection" AS ENUM ('IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "ConnectorSyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "FileStorageProvider" AS ENUM ('S3_COMPAT');

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchangeRate" DECIMAL(18,6) NOT NULL,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "rate" DECIMAL(5,2) NOT NULL,
    "scope" "TaxRateScope" NOT NULL DEFAULT 'BOTH',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationTaxDetail" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxNumber" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "taxOffice" TEXT,
    "registrationNumber" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationTaxDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingOption" (
    "id" TEXT NOT NULL,
    "trackingCategoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumberMasked" TEXT NOT NULL,
    "iban" TEXT,
    "currencyCode" TEXT NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT,
    "taxNumber" TEXT,
    "customerCode" TEXT,
    "supplierCode" TEXT,
    "isCustomer" BOOLEAN NOT NULL DEFAULT true,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "currencyCode" TEXT,
    "paymentTermsDays" INTEGER,
    "notes" TEXT,
    "receivableBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "payableBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactGroupMember" (
    "contactId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactGroupMember_pkey" PRIMARY KEY ("contactId","groupId")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "AddressType" NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactNumber" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "ConnectorProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "ConnectorAccountStatus" NOT NULL DEFAULT 'PENDING',
    "externalTenantId" TEXT,
    "scopes" JSONB,
    "connectedByUserId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorSyncLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorAccountId" TEXT NOT NULL,
    "direction" "ConnectorSyncDirection" NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "ConnectorSyncStatus" NOT NULL,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "storageProvider" "FileStorageProvider" NOT NULL DEFAULT 'S3_COMPAT',
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Currency_organizationId_code_key" ON "Currency"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_organizationId_name_key" ON "TaxRate"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationTaxDetail_organizationId_key" ON "OrganizationTaxDetail"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingCategory_organizationId_name_key" ON "TrackingCategory"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingOption_trackingCategoryId_name_key" ON "TrackingOption"("trackingCategoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_organizationId_name_key" ON "BankAccount"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Account_organizationId_code_key" ON "Account"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_organizationId_key_key" ON "EmailTemplate"("organizationId", "key");

-- CreateIndex
CREATE INDEX "Contact_organizationId_displayName_idx" ON "Contact"("organizationId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "ContactGroup_organizationId_name_key" ON "ContactGroup"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Address_contactId_type_key" ON "Address"("contactId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorAccount_organizationId_provider_key" ON "ConnectorAccount"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "ConnectorSyncLog_organizationId_createdAt_idx" ON "ConnectorSyncLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConnectorSyncLog_connectorAccountId_createdAt_idx" ON "ConnectorSyncLog"("connectorAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_objectKey_key" ON "StoredFile"("objectKey");

-- CreateIndex
CREATE INDEX "StoredFile_organizationId_relatedType_relatedId_idx" ON "StoredFile"("organizationId", "relatedType", "relatedId");

-- AddForeignKey
ALTER TABLE "Currency" ADD CONSTRAINT "Currency_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationTaxDetail" ADD CONSTRAINT "OrganizationTaxDetail_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingCategory" ADD CONSTRAINT "TrackingCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingOption" ADD CONSTRAINT "TrackingOption_trackingCategoryId_fkey" FOREIGN KEY ("trackingCategoryId") REFERENCES "TrackingCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroupMember" ADD CONSTRAINT "ContactGroupMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroupMember" ADD CONSTRAINT "ContactGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ContactGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNumber" ADD CONSTRAINT "ContactNumber_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorAccount" ADD CONSTRAINT "ConnectorAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorAccount" ADD CONSTRAINT "ConnectorAccount_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncLog" ADD CONSTRAINT "ConnectorSyncLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncLog" ADD CONSTRAINT "ConnectorSyncLog_connectorAccountId_fkey" FOREIGN KEY ("connectorAccountId") REFERENCES "ConnectorAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
