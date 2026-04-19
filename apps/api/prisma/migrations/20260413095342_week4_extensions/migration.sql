-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'APPLIED');

-- CreateEnum
CREATE TYPE "RecurringScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BillingPlanCode" AS ENUM ('STARTER', 'GROWTH', 'SCALE');

-- CreateEnum
CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "FixedAssetStatus" AS ENUM ('ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED');

-- CreateTable
CREATE TABLE "SalesCreditNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "salesInvoiceId" TEXT,
    "creditNoteNumber" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCreditNoteLine" (
    "id" TEXT NOT NULL,
    "salesCreditNoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "taxRateId" TEXT,
    "taxRateName" TEXT,
    "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesCreditNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepeatingInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "status" "RecurringScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "frequencyLabel" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepeatingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepeatingInvoiceLine" (
    "id" TEXT NOT NULL,
    "repeatingInvoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "taxRateId" TEXT,
    "taxRateName" TEXT,
    "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepeatingInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseCreditNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "purchaseBillId" TEXT,
    "creditNoteNumber" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseCreditNoteLine" (
    "id" TEXT NOT NULL,
    "purchaseCreditNoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "taxRateId" TEXT,
    "taxRateName" TEXT,
    "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseCreditNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "taxRateId" TEXT,
    "taxRateName" TEXT,
    "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepeatingBill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "status" "RecurringScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "frequencyLabel" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepeatingBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepeatingBillLine" (
    "id" TEXT NOT NULL,
    "repeatingBillId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "taxRateId" TEXT,
    "taxRateName" TEXT,
    "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepeatingBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeCustomer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "billingEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT NOT NULL,
    "planCode" "BillingPlanCode" NOT NULL,
    "status" "BillingSubscriptionStatus" NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripeInvoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "hostedInvoiceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "cost" DECIMAL(18,2) NOT NULL,
    "salvageValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" TEXT NOT NULL,
    "accumulatedDepreciation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netBookValue" DECIMAL(18,2) NOT NULL,
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastDepreciatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fixedAssetId" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL,
    "depreciationAmount" DECIMAL(18,2) NOT NULL,
    "accumulatedDepreciation" DECIMAL(18,2) NOT NULL,
    "netBookValue" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepreciationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesCreditNote_organizationId_issueDate_idx" ON "SalesCreditNote"("organizationId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalesCreditNote_organizationId_creditNoteNumber_key" ON "SalesCreditNote"("organizationId", "creditNoteNumber");

-- CreateIndex
CREATE INDEX "SalesCreditNoteLine_salesCreditNoteId_sortOrder_idx" ON "SalesCreditNoteLine"("salesCreditNoteId", "sortOrder");

-- CreateIndex
CREATE INDEX "RepeatingInvoice_organizationId_nextRunAt_idx" ON "RepeatingInvoice"("organizationId", "nextRunAt");

-- CreateIndex
CREATE INDEX "RepeatingInvoiceLine_repeatingInvoiceId_sortOrder_idx" ON "RepeatingInvoiceLine"("repeatingInvoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "PurchaseCreditNote_organizationId_issueDate_idx" ON "PurchaseCreditNote"("organizationId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseCreditNote_organizationId_creditNoteNumber_key" ON "PurchaseCreditNote"("organizationId", "creditNoteNumber");

-- CreateIndex
CREATE INDEX "PurchaseCreditNoteLine_purchaseCreditNoteId_sortOrder_idx" ON "PurchaseCreditNoteLine"("purchaseCreditNoteId", "sortOrder");

-- CreateIndex
CREATE INDEX "PurchaseOrder_organizationId_issueDate_idx" ON "PurchaseOrder"("organizationId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_orderNumber_key" ON "PurchaseOrder"("organizationId", "orderNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_sortOrder_idx" ON "PurchaseOrderLine"("purchaseOrderId", "sortOrder");

-- CreateIndex
CREATE INDEX "RepeatingBill_organizationId_nextRunAt_idx" ON "RepeatingBill"("organizationId", "nextRunAt");

-- CreateIndex
CREATE INDEX "RepeatingBillLine_repeatingBillId_sortOrder_idx" ON "RepeatingBillLine"("repeatingBillId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_organizationId_key" ON "StripeCustomer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_stripeCustomerId_key" ON "StripeCustomer"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeSubscription_organizationId_key" ON "StripeSubscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeSubscription_stripeSubscriptionId_key" ON "StripeSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_stripeInvoiceId_key" ON "BillingInvoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "BillingInvoice_organizationId_issuedAt_idx" ON "BillingInvoice"("organizationId", "issuedAt");

-- CreateIndex
CREATE INDEX "FixedAsset_organizationId_status_idx" ON "FixedAsset"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_organizationId_assetNumber_key" ON "FixedAsset"("organizationId", "assetNumber");

-- CreateIndex
CREATE INDEX "DepreciationRun_organizationId_runDate_idx" ON "DepreciationRun"("organizationId", "runDate");

-- CreateIndex
CREATE INDEX "DepreciationRun_fixedAssetId_runDate_idx" ON "DepreciationRun"("fixedAssetId", "runDate");

-- AddForeignKey
ALTER TABLE "SalesCreditNote" ADD CONSTRAINT "SalesCreditNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCreditNote" ADD CONSTRAINT "SalesCreditNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCreditNote" ADD CONSTRAINT "SalesCreditNote_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCreditNoteLine" ADD CONSTRAINT "SalesCreditNoteLine_salesCreditNoteId_fkey" FOREIGN KEY ("salesCreditNoteId") REFERENCES "SalesCreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatingInvoice" ADD CONSTRAINT "RepeatingInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatingInvoice" ADD CONSTRAINT "RepeatingInvoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatingInvoiceLine" ADD CONSTRAINT "RepeatingInvoiceLine_repeatingInvoiceId_fkey" FOREIGN KEY ("repeatingInvoiceId") REFERENCES "RepeatingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseCreditNote" ADD CONSTRAINT "PurchaseCreditNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseCreditNote" ADD CONSTRAINT "PurchaseCreditNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseCreditNote" ADD CONSTRAINT "PurchaseCreditNote_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseCreditNoteLine" ADD CONSTRAINT "PurchaseCreditNoteLine_purchaseCreditNoteId_fkey" FOREIGN KEY ("purchaseCreditNoteId") REFERENCES "PurchaseCreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatingBill" ADD CONSTRAINT "RepeatingBill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatingBill" ADD CONSTRAINT "RepeatingBill_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatingBillLine" ADD CONSTRAINT "RepeatingBillLine_repeatingBillId_fkey" FOREIGN KEY ("repeatingBillId") REFERENCES "RepeatingBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeCustomer" ADD CONSTRAINT "StripeCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeSubscription" ADD CONSTRAINT "StripeSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeSubscription" ADD CONSTRAINT "StripeSubscription_stripeCustomerId_fkey" FOREIGN KEY ("stripeCustomerId") REFERENCES "StripeCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_stripeSubscriptionId_fkey" FOREIGN KEY ("stripeSubscriptionId") REFERENCES "StripeSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationRun" ADD CONSTRAINT "DepreciationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationRun" ADD CONSTRAINT "DepreciationRun_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
