import { describe, expect, it } from "vitest";

import {
  calculateDocumentLines,
  determineBillStatus,
  determineInvoiceStatus,
  toPersistedDocumentLines
} from "./document-calculations";

describe("document-calculations", () => {
  it("calculates line totals, tax totals, and document totals", () => {
    const result = calculateDocumentLines([
      {
        description: "Service retainer",
        inventoryItemId: "item_1",
        inventoryItemCode: "ITM-1001",
        inventoryItemName: "Service retainer package",
        quantity: "2",
        unitPrice: "150.00",
        taxRatePercent: "15.00"
      },
      {
        description: "Support add-on",
        quantity: "1",
        unitPrice: "50.00",
        taxRatePercent: "0.00"
      }
    ]);

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].inventoryItemId).toBe("item_1");
    expect(result.lines[0].inventoryItemCode).toBe("ITM-1001");
    expect(result.lines[0].inventoryItemName).toBe("Service retainer package");
    expect(result.lines[0].lineSubtotal).toBe("300.00");
    expect(result.lines[0].lineTax).toBe("45.00");
    expect(result.subtotal).toBe("350.00");
    expect(result.taxTotal).toBe("45.00");
    expect(result.total).toBe("395.00");
  });

  it("drops transient inventory display fields before persistence", () => {
    const calculated = calculateDocumentLines([
      {
        description: "Inventory-backed line",
        inventoryItemId: "item_1",
        inventoryItemCode: "ITM-1001",
        inventoryItemName: "Inventory item",
        quantity: "1",
        unitPrice: "25.00"
      }
    ]);

    expect(toPersistedDocumentLines(calculated.lines)).toEqual([
      {
        description: "Inventory-backed line",
        inventoryItemId: "item_1",
        quantity: "1.00",
        unitPrice: "25.00",
        taxRateId: null,
        taxRateName: null,
        taxRatePercent: "0.00",
        lineSubtotal: "25.00",
        lineTax: "0.00",
        lineTotal: "25.00",
        sortOrder: 0
      }
    ]);
  });

  it("derives invoice status from payment progress", () => {
    expect(
      determineInvoiceStatus({
        currentStatus: "ISSUED",
        amountPaid: "0.00",
        amountDue: "395.00"
      })
    ).toBe("ISSUED");

    expect(
      determineInvoiceStatus({
        currentStatus: "ISSUED",
        amountPaid: "50.00",
        amountDue: "345.00"
      })
    ).toBe("PARTIALLY_PAID");

    expect(
      determineInvoiceStatus({
        currentStatus: "PARTIALLY_PAID",
        amountPaid: "395.00",
        amountDue: "0.00"
      })
    ).toBe("PAID");
  });

  it("derives bill status from payment progress", () => {
    expect(
      determineBillStatus({
        currentStatus: "APPROVED",
        amountPaid: "0.00",
        amountDue: "200.00"
      })
    ).toBe("APPROVED");

    expect(
      determineBillStatus({
        currentStatus: "APPROVED",
        amountPaid: "75.00",
        amountDue: "125.00"
      })
    ).toBe("PARTIALLY_PAID");

    expect(
      determineBillStatus({
        currentStatus: "PARTIALLY_PAID",
        amountPaid: "200.00",
        amountDue: "0.00"
      })
    ).toBe("PAID");
  });
});
