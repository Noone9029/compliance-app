import { createHash, randomUUID } from "node:crypto";
import type {
  ComplianceDocumentStatus,
  ComplianceFailureCategory,
  ComplianceInvoiceKind,
  ComplianceSubmissionFlow,
} from "@daftar/types";
import {
  buildInvoiceXml as buildUblInvoiceXml,
  type BuildInvoiceXmlInput,
} from "./compliance-ubl";

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
  const length = valueBuffer.length;
  const lengthBytes =
    length < 0x80
      ? Buffer.from([length])
      : length <= 0xff
        ? Buffer.from([0x81, length])
        : Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);

  return Buffer.concat([Buffer.from([tag]), lengthBytes, valueBuffer]);
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

export function calculateRetryDelayMs(
  attemptCount: number,
  input?: {
    failureCategory?: ComplianceFailureCategory | null;
    statusCode?: number | null;
  },
) {
  const boundedAttempt = Math.max(1, attemptCount);
  const statusCode = input?.statusCode ?? null;
  const baseDelayMs = statusCode === 429 ? 60 * 1000 : 30 * 1000;
  const maxDelayMs = statusCode === 429 ? 60 * 60 * 1000 : 15 * 60 * 1000;
  const delay = baseDelayMs * 2 ** (boundedAttempt - 1);

  if (input?.failureCategory === "CONNECTIVITY" || statusCode === 429) {
    return Math.min(maxDelayMs, delay);
  }

  return Math.min(15 * 60 * 1000, delay);
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

export function buildInvoiceXml(input: BuildInvoiceXmlInput) {
  return buildUblInvoiceXml(input);
}
