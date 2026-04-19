import { createHash, randomUUID } from "node:crypto";
import type {
  ComplianceDocumentStatus,
  ComplianceInvoiceKind,
  ComplianceSubmissionFlow,
} from "@daftar/types";

export const maxComplianceAttempts = 5;
const genesisInvoiceValue = "0";

export function generateComplianceUuid() {
  return randomUUID();
}

export function hashValue(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function hashValueBase64(input: string) {
  return createHash("sha256").update(input).digest("base64");
}

export function firstPreviousInvoiceHash() {
  return hashValueBase64(genesisInvoiceValue);
}

function tlvField(tag: number, value: string) {
  const valueBuffer = Buffer.from(value, "utf8");
  return Buffer.concat([Buffer.from([tag]), Buffer.from([valueBuffer.length]), valueBuffer]);
}

export function buildQrPayload(input: {
  sellerName: string;
  taxNumber: string;
  issuedAtIso: string;
  total: string;
  taxTotal: string;
  invoiceHash?: string | null;
  xmlSignature?: string | null;
  publicKey?: string | null;
  technicalStamp?: string | null;
}) {
  const fields = [
    tlvField(1, input.sellerName),
    tlvField(2, input.taxNumber),
    tlvField(3, input.issuedAtIso),
    tlvField(4, input.total),
    tlvField(5, input.taxTotal),
  ];

  if (input.invoiceHash) {
    fields.push(tlvField(6, input.invoiceHash));
  }

  if (input.xmlSignature) {
    fields.push(tlvField(7, input.xmlSignature));
  }

  if (input.publicKey) {
    fields.push(tlvField(8, input.publicKey));
  }

  if (input.technicalStamp) {
    fields.push(tlvField(9, input.technicalStamp));
  }

  return Buffer.concat(fields).toString("base64");
}

export function buildComplianceHashes(input: {
  previousHash: string | null;
  invoiceNumber: string;
  total: string;
  taxTotal: string;
  issueDateIso: string;
  uuid: string;
  invoiceCounter: number;
}) {
  const previousHash = input.previousHash ?? firstPreviousInvoiceHash();
  const currentHash = hashValueBase64(
    [
      previousHash,
      input.invoiceNumber,
      input.total,
      input.taxTotal,
      input.issueDateIso,
      input.uuid,
      String(input.invoiceCounter),
    ].join("|"),
  );

  return { previousHash, currentHash };
}

export function nextInvoiceCounter(lastCounter: number | null | undefined) {
  return (lastCounter ?? 0) + 1;
}

export function complianceFlowForInvoiceKind(
  invoiceKind: ComplianceInvoiceKind,
): ComplianceSubmissionFlow {
  return invoiceKind === "STANDARD" ? "CLEARANCE" : "REPORTING";
}

export function calculateRetryDelayMs(attemptCount: number) {
  const boundedAttempt = Math.max(1, attemptCount);
  return Math.min(15 * 60 * 1000, 30 * 1000 * 2 ** (boundedAttempt - 1));
}

export function isTerminalSubmissionStatus(status: ComplianceDocumentStatus | null | undefined) {
  return (
    status === "CLEARED" ||
    status === "CLEARED_WITH_WARNINGS" ||
    status === "REPORTED" ||
    status === "REPORTED_WITH_WARNINGS" ||
    status === "REJECTED" ||
    status === "FAILED"
  );
}

export function canShareInvoiceWithCustomer(input: {
  invoiceKind: ComplianceInvoiceKind;
  complianceStatus: ComplianceDocumentStatus | null;
  invoiceStatus: string;
}) {
  if (input.invoiceStatus === "DRAFT" || input.invoiceStatus === "VOID") {
    return false;
  }

  if (input.invoiceKind === "STANDARD") {
    return (
      input.complianceStatus === "CLEARED" ||
      input.complianceStatus === "CLEARED_WITH_WARNINGS"
    );
  }

  return true;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildInvoiceXml(input: {
  uuid: string;
  invoiceNumber: string;
  invoiceKind: ComplianceInvoiceKind;
  submissionFlow: ComplianceSubmissionFlow;
  issueDateIso: string;
  sellerName: string;
  taxNumber: string;
  customerName: string;
  invoiceCounter: number;
  total: string;
  taxTotal: string;
  previousHash: string;
}) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Invoice>",
    `  <UUID>${escapeXml(input.uuid)}</UUID>`,
    `  <InvoiceNumber>${escapeXml(input.invoiceNumber)}</InvoiceNumber>`,
    `  <InvoiceKind>${escapeXml(input.invoiceKind)}</InvoiceKind>`,
    `  <SubmissionFlow>${escapeXml(input.submissionFlow)}</SubmissionFlow>`,
    `  <IssueDate>${escapeXml(input.issueDateIso)}</IssueDate>`,
    `  <SellerName>${escapeXml(input.sellerName)}</SellerName>`,
    `  <TaxNumber>${escapeXml(input.taxNumber)}</TaxNumber>`,
    `  <CustomerName>${escapeXml(input.customerName)}</CustomerName>`,
    `  <InvoiceCounter>${input.invoiceCounter}</InvoiceCounter>`,
    `  <PreviousInvoiceHash>${escapeXml(input.previousHash)}</PreviousInvoiceHash>`,
    `  <TaxInclusiveAmount>${escapeXml(input.total)}</TaxInclusiveAmount>`,
    `  <TaxAmount>${escapeXml(input.taxTotal)}</TaxAmount>`,
    "</Invoice>",
  ].join("\n");
}
