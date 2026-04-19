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
    const xml = buildInvoiceXml({
      uuid: "uuid-value",
      invoiceNumber: "INV-NE-0003",
      invoiceKind: "STANDARD",
      submissionFlow: "CLEARANCE",
      issueDateIso: "2026-04-12T09:00:00.000Z",
      sellerName: "Nomad Events Arabia Limited",
      taxNumber: "300123456700003",
      customerName: "Al Noor Hospitality",
      invoiceCounter: 7,
      total: "115.00",
      taxTotal: "15.00",
      previousHash: firstPreviousInvoiceHash(),
    });

    expect(xml).toContain("<InvoiceNumber>INV-NE-0003</InvoiceNumber>");
    expect(calculateRetryDelayMs(1)).toBe(30000);
    expect(calculateRetryDelayMs(2)).toBe(60000);
    expect(calculateRetryDelayMs(5)).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});
