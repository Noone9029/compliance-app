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

export type QrTlvField = {
  tag: number;
  value: Buffer;
};

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

function toQrValueBuffer(value: string | Buffer | Uint8Array) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return Buffer.from(value, "utf8");
}

function encodeTlvLength(length: number) {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  if (length <= 0xff) {
    return Buffer.from([0x81, length]);
  }
  if (length <= 0xffff) {
    return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  }
  throw new Error(`QR TLV length ${length} is not supported.`);
}

function decodeTlvLength(payload: Buffer, offset: number) {
  if (offset >= payload.length) {
    throw new Error("QR TLV is truncated before length bytes.");
  }

  const firstLengthByte = payload[offset] ?? 0;
  let nextOffset = offset + 1;
  if (firstLengthByte < 0x80) {
    return { length: firstLengthByte, nextOffset };
  }

  const lengthBytesCount = firstLengthByte & 0x7f;
  if (lengthBytesCount === 0 || lengthBytesCount > 2) {
    throw new Error(`QR TLV uses unsupported length bytes count '${lengthBytesCount}'.`);
  }

  if (nextOffset + lengthBytesCount > payload.length) {
    throw new Error("QR TLV is truncated while reading long-form length.");
  }

  let length = 0;
  for (let index = 0; index < lengthBytesCount; index += 1) {
    length = (length << 8) | (payload[nextOffset] ?? 0);
    nextOffset += 1;
  }

  return { length, nextOffset };
}

function tlvField(tag: number, value: string | Buffer | Uint8Array) {
  const valueBuffer = toQrValueBuffer(value);
  return Buffer.concat([Buffer.from([tag]), encodeTlvLength(valueBuffer.length), valueBuffer]);
}

function isCanonicalBase64(value: string) {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length % 4 !== 0) {
    return false;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return false;
  }

  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length === 0) {
    return false;
  }

  const normalizedDecoded = decoded.toString("base64").replace(/=+$/u, "");
  const normalizedInput = normalized.replace(/=+$/u, "");
  return normalizedDecoded === normalizedInput;
}

function decodeQrBinaryValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return Buffer.alloc(0);
  }
  if (isCanonicalBase64(normalized)) {
    return Buffer.from(normalized, "base64");
  }
  return Buffer.from(normalized, "utf8");
}

export function decodeQrTlv(base64Payload: string): QrTlvField[] {
  const payload = Buffer.from(base64Payload, "base64");
  const fields: QrTlvField[] = [];
  let offset = 0;

  while (offset < payload.length) {
    const tag = payload[offset] ?? 0;
    offset += 1;

    const { length, nextOffset } = decodeTlvLength(payload, offset);
    offset = nextOffset;
    if (offset + length > payload.length) {
      throw new Error(`QR TLV tag '${tag}' is truncated.`);
    }

    const value = payload.subarray(offset, offset + length);
    fields.push({ tag, value });
    offset += length;
  }

  return fields;
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
    fields.push(tlvField(6, input.invoiceHash.trim()));
  }

  if (input.xmlSignature) {
    fields.push(tlvField(7, input.xmlSignature.trim()));
  }

  if (input.publicKey) {
    fields.push(tlvField(8, decodeQrBinaryValue(input.publicKey)));
  }

  if (input.technicalStamp) {
    fields.push(tlvField(9, decodeQrBinaryValue(input.technicalStamp)));
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
