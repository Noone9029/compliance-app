import { describe, expect, it } from "vitest";

import {
  buildComplianceHashes,
  buildInvoiceXml,
  buildQrPayload,
  calculateRetryDelayMs,
  complianceFlowForInvoiceKind,
  firstPreviousInvoiceHash,
  generateComplianceUuid,
  hashValue,
  nextInvoiceCounter,
} from "./compliance-core";

function decodeTlvPayload(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  const decoded = new Map<number, string>();
  let offset = 0;

  while (offset < bytes.length) {
    const tag = bytes[offset++]!;
    if (offset >= bytes.length) {
      break;
    }

    const firstLengthByte = bytes[offset++]!;
    let length = firstLengthByte;
    if (firstLengthByte > 0x80) {
      const lengthBytes = firstLengthByte & 0x7f;
      length = 0;
      for (let index = 0; index < lengthBytes; index += 1) {
        length = (length << 8) | (bytes[offset++] ?? 0);
      }
    }

    const value = bytes.subarray(offset, offset + length).toString("utf8");
    decoded.set(tag, value);
    offset += length;
  }

  return decoded;
}

describe("compliance-core", () => {
  it("generates UUIDs", () => {
    const first = generateComplianceUuid();
    const second = generateComplianceUuid();

    expect(first).not.toBe(second);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("hashes values deterministically", () => {
    expect(hashValue("week3-test")).toBe(hashValue("week3-test"));
    expect(hashValue("week3-test")).not.toBe(hashValue("week3-other"));
  });

  it("builds a base64 qr payload and chained hashes", () => {
    const qrPayload = buildQrPayload({
      sellerName: "Nomad Events Arabia Limited",
      taxNumber: "300123456700003",
      issuedAtIso: "2026-04-12T09:00:00.000Z",
      total: "115.00",
      taxTotal: "15.00",
      invoiceHash: "invoice-hash",
      xmlSignature: "signature",
      publicKey: "public-key",
      technicalStamp: "technical-stamp",
    });
    const hashes = buildComplianceHashes({
      previousHash: "previous-hash-value",
      invoiceNumber: "INV-NE-0003",
      total: "115.00",
      taxTotal: "15.00",
      issueDateIso: "2026-04-12T09:00:00.000Z",
      uuid: "uuid-value",
      invoiceCounter: 7,
    });

    expect(qrPayload).toMatch(/^[A-Za-z0-9+/=]+$/);
    const decoded = decodeTlvPayload(qrPayload);
    expect(decoded.get(1)).toBe("Nomad Events Arabia Limited");
    expect(decoded.get(2)).toBe("300123456700003");
    expect(decoded.get(6)).toBe("invoice-hash");
    expect(decoded.get(7)).toBe("signature");
    expect(decoded.get(8)).toBe("public-key");
    expect(decoded.get(9)).toBe("technical-stamp");
    expect(hashes.previousHash).toBe("previous-hash-value");
    expect(hashes.currentHash).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("uses the ZATCA first-document previous hash and increments counters", () => {
    expect(firstPreviousInvoiceHash()).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(nextInvoiceCounter(null)).toBe(1);
    expect(nextInvoiceCounter(4)).toBe(5);
    expect(complianceFlowForInvoiceKind("STANDARD")).toBe("CLEARANCE");
    expect(complianceFlowForInvoiceKind("SIMPLIFIED")).toBe("REPORTING");
  });

  it("builds XML payloads and exponential retry delays", () => {
    const previousHash = firstPreviousInvoiceHash();
    const xml = buildInvoiceXml({
      uuid: "uuid-value",
      invoiceNumber: "INV-NE-0003",
      invoiceKind: "STANDARD",
      submissionFlow: "CLEARANCE",
      issueDateIso: "2026-04-12T09:00:00.000Z",
      invoiceCounter: 7,
      previousHash,
      qrPayload: "qr-payload-base64",
      currencyCode: "SAR",
      seller: {
        registrationName: "Nomad Events Arabia Limited",
        taxNumber: "300123456700003",
        registrationNumber: "1010010000",
        address: {
          streetName: "Prince Sultan",
          cityName: "Riyadh",
          postalZone: "12211",
          countryCode: "SA",
        },
      },
      buyer: {
        registrationName: "Al Noor Hospitality",
        taxNumber: "300765432100003",
        address: {
          streetName: "Salah Al-Din",
          cityName: "Riyadh",
          postalZone: "12222",
          countryCode: "SA",
        },
      },
      deliveryDateIso: "2026-04-12T09:00:00.000Z",
      paymentMeansCode: "10",
      subtotal: "100.00",
      total: "115.00",
      taxTotal: "15.00",
      lines: [
        {
          description: "Event services",
          quantity: "2.00",
          unitPrice: "50.00",
          lineExtensionAmount: "100.00",
          taxAmount: "15.00",
          taxRatePercent: "15.00",
        },
      ],
    });

    expect(xml).toContain("<cbc:ID>INV-NE-0003</cbc:ID>");
    expect(xml).toContain("<cbc:InvoiceTypeCode name=\"0100000\">388</cbc:InvoiceTypeCode>");
    expect(xml).toContain("<cbc:EmbeddedDocumentBinaryObject mimeCode=\"text/plain\">");
    expect(xml).toContain(previousHash);
    expect(calculateRetryDelayMs(1)).toBe(30000);
    expect(calculateRetryDelayMs(2)).toBe(60000);
    expect(calculateRetryDelayMs(1, { statusCode: 429 })).toBe(60000);
    expect(calculateRetryDelayMs(2, { statusCode: 429 })).toBe(120000);
    expect(calculateRetryDelayMs(5)).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});
