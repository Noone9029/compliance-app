import { describe, expect, it } from "vitest";

import {
  buildComplianceHashes,
  buildInvoiceXml,
  buildQrPayload,
  calculateRetryDelayMs,
  complianceFlowForInvoiceKind,
  decodeQrTlv,
  firstPreviousInvoiceHash,
  generateComplianceUuid,
  hashValue,
  nextInvoiceCounter,
} from "./compliance-core";

function tlvValueMap(base64: string) {
  return new Map(decodeQrTlv(base64).map((entry) => [entry.tag, entry.value]));
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
    const invoiceHashBytes = Buffer.from("6f1f89b6ab3cd41f11a9fb6ccb906764", "hex");
    const signatureBytes = Buffer.from("30440220111122223333444455556666777788889999aaaabbbbccccddddeeeeffff00000220123456789abcdeffedcba98765432100112233445566778899aabbccddeeff", "hex");
    const publicKeyBytes = Buffer.from("3056301006072a8648ce3d020106052b8104000a034200040102030405060708090a0b0c0d0e0f00112233445566778899aabbccddeeff112233445566778899aabbccddeeff0011223344556677", "hex");
    const technicalStampBytes = Buffer.from("3045022100aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55022055aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa55aa", "hex");
    const qrPayload = buildQrPayload({
      sellerName: "Nomad Events Arabia Limited",
      taxNumber: "300123456700003",
      issuedAtIso: "2026-04-12T09:00:00.000Z",
      total: "115.00",
      taxTotal: "15.00",
      invoiceHash: invoiceHashBytes.toString("base64"),
      xmlSignature: signatureBytes.toString("base64"),
      publicKey: publicKeyBytes.toString("base64"),
      technicalStamp: technicalStampBytes.toString("base64"),
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
    const decoded = tlvValueMap(qrPayload);
    expect(decoded.get(1)?.toString("utf8")).toBe("Nomad Events Arabia Limited");
    expect(decoded.get(2)?.toString("utf8")).toBe("300123456700003");
    expect(decoded.get(6)?.toString("utf8")).toBe(invoiceHashBytes.toString("base64"));
    expect(decoded.get(7)?.toString("utf8")).toBe(signatureBytes.toString("base64"));
    expect(decoded.get(8)?.equals(publicKeyBytes)).toBe(true);
    expect(decoded.get(9)?.equals(technicalStampBytes)).toBe(true);
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
