-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'REPORTED', 'VOID');

-- CreateEnum
CREATE TYPE "PurchaseBillStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "ComplianceInvoiceKind" AS ENUM ('STANDARD', 'SIMPLIFIED');

-- CreateEnum
CREATE TYPE "ComplianceDocumentStatus" AS ENUM ('DRAFT', 'READY', 'QUEUED', 'REPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "complianceInvoiceKind" "ComplianceInvoiceKind" NOT NULL DEFAULT 'STANDARD',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceLine" (
    "id" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
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

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceStatusEvent" (
    "id" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" "SalesInvoiceStatus",
    "toStatus" "SalesInvoiceStatus",
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "status" "PurchaseBillStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBillLine" (
    "id" TEXT NOT NULL,
    "purchaseBillId" TEXT NOT NULL,
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

    CONSTRAINT "PurchaseBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL,
    "purchaseBillId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "convertedInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
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

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "invoiceKind" "ComplianceInvoiceKind" NOT NULL,
    "uuid" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "previousHash" TEXT,
    "currentHash" TEXT NOT NULL,
    "status" "ComplianceDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "lastSubmissionStatus" "SubmissionStatus",
    "lastSubmittedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportedDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "complianceDocumentId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseCode" TEXT,
    "responseMessage" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salesInvoiceId" TEXT,
    "complianceDocumentId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZatcaSubmission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "complianceDocumentId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ZatcaSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesInvoice_organizationId_status_issueDate_idx" ON "SalesInvoice"("organizationId", "status", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_organizationId_invoiceNumber_key" ON "SalesInvoice"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_salesInvoiceId_sortOrder_idx" ON "SalesInvoiceLine"("salesInvoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "InvoicePayment_salesInvoiceId_paymentDate_idx" ON "InvoicePayment"("salesInvoiceId", "paymentDate");

-- CreateIndex
CREATE INDEX "InvoiceStatusEvent_salesInvoiceId_createdAt_idx" ON "InvoiceStatusEvent"("salesInvoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseBill_organizationId_status_issueDate_idx" ON "PurchaseBill"("organizationId", "status", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseBill_organizationId_billNumber_key" ON "PurchaseBill"("organizationId", "billNumber");

-- CreateIndex
CREATE INDEX "PurchaseBillLine_purchaseBillId_sortOrder_idx" ON "PurchaseBillLine"("purchaseBillId", "sortOrder");

-- CreateIndex
CREATE INDEX "BillPayment_purchaseBillId_paymentDate_idx" ON "BillPayment"("purchaseBillId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_convertedInvoiceId_key" ON "Quote"("convertedInvoiceId");

-- CreateIndex
CREATE INDEX "Quote_organizationId_status_issueDate_idx" ON "Quote"("organizationId", "status", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_organizationId_quoteNumber_key" ON "Quote"("organizationId", "quoteNumber");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_sortOrder_idx" ON "QuoteLine"("quoteId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDocument_salesInvoiceId_key" ON "ComplianceDocument"("salesInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDocument_uuid_key" ON "ComplianceDocument"("uuid");

-- CreateIndex
CREATE INDEX "ComplianceDocument_organizationId_status_createdAt_idx" ON "ComplianceDocument"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportedDocument_salesInvoiceId_key" ON "ReportedDocument"("salesInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportedDocument_complianceDocumentId_key" ON "ReportedDocument"("complianceDocumentId");

-- CreateIndex
CREATE INDEX "ReportedDocument_organizationId_submittedAt_idx" ON "ReportedDocument"("organizationId", "submittedAt");

-- CreateIndex
CREATE INDEX "ComplianceEvent_organizationId_createdAt_idx" ON "ComplianceEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ZatcaSubmission_organizationId_submittedAt_idx" ON "ZatcaSubmission"("organizationId", "submittedAt");

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceStatusEvent" ADD CONSTRAINT "InvoiceStatusEvent_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceStatusEvent" ADD CONSTRAINT "InvoiceStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseBillLine" ADD CONSTRAINT "PurchaseBillLine_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_convertedInvoiceId_fkey" FOREIGN KEY ("convertedInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportedDocument" ADD CONSTRAINT "ReportedDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportedDocument" ADD CONSTRAINT "ReportedDocument_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportedDocument" ADD CONSTRAINT "ReportedDocument_complianceDocumentId_fkey" FOREIGN KEY ("complianceDocumentId") REFERENCES "ComplianceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_complianceDocumentId_fkey" FOREIGN KEY ("complianceDocumentId") REFERENCES "ComplianceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvent" ADD CONSTRAINT "ComplianceEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZatcaSubmission" ADD CONSTRAINT "ZatcaSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZatcaSubmission" ADD CONSTRAINT "ZatcaSubmission_complianceDocumentId_fkey" FOREIGN KEY ("complianceDocumentId") REFERENCES "ComplianceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
