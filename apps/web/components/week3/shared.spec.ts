import { describe, expect, it } from "vitest";

import {
  formatDate,
  money,
  toneForBillStatus,
  toneForComplianceStatus,
  toneForInvoiceStatus,
  toneForQuoteStatus
} from "./shared";

describe("week3 shared helpers", () => {
  it("formats money and dates", () => {
    expect(money("125.5", "SAR")).toBe("SAR 125.50");
    expect(formatDate("2026-04-12T09:00:00.000Z")).toContain("2026");
  });

  it("maps statuses to tones", () => {
    expect(toneForInvoiceStatus("PAID")).toBe("success");
    expect(toneForBillStatus("PARTIALLY_PAID")).toBe("warning");
    expect(toneForQuoteStatus("CONVERTED")).toBe("success");
    expect(toneForComplianceStatus("REPORTED")).toBe("success");
    expect(toneForComplianceStatus("CLEARED")).toBe("success");
    expect(toneForComplianceStatus("PROCESSING")).toBe("warning");
    expect(toneForComplianceStatus(null)).toBe("neutral");
  });
});
