import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

import { BillingSummaryForm } from "./billing-forms";
import { CreditNoteForm } from "./credit-note-form";
import { FixedAssetForm } from "./fixed-asset-form";

describe("Week 4 forms", () => {
  it("renders the credit note form with linked document controls", () => {
    render(
      <CreditNoteForm
        canWrite
        contacts={[{ id: "contact_1", label: "Al Noor Hospitality" }]}
        description="Create a customer credit note."
        endpoint="/v1/sales/credit-notes"
        initialValues={{
          contactId: "contact_1",
          linkedDocumentId: "invoice_1",
          creditNoteNumber: "SCN-0001",
          status: "DRAFT",
          issueDate: "2026-04-13",
          currencyCode: "SAR",
          notes: "Credit note",
          lines: [
            {
              description: "Credit line",
              quantity: "1",
              unitPrice: "100.00",
              taxRateId: "tax_1"
            }
          ]
        }}
        linkedDocumentKey="salesInvoiceId"
        linkedDocuments={[{ id: "invoice_1", label: "INV-0001" }]}
        method="POST"
        submitLabel="Create Credit Note"
        taxRates={[{ id: "tax_1", label: "VAT 15%" }]}
        title="New Sales Credit Note"
      />
    );

    expect(screen.getByText("New Sales Credit Note")).toBeTruthy();
    expect(screen.getByLabelText("Linked Document")).toBeTruthy();
    expect(screen.getByDisplayValue("SCN-0001")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create Credit Note" })
    ).toBeTruthy();
  });

  it("renders billing summary fields and disables updates when write access is missing", () => {
    render(
      <BillingSummaryForm
        canWrite={false}
        endpoint="/v1/billing/summary"
        initialValues={{
          stripeCustomerId: "cus_123",
          billingEmail: "finance@example.com",
          subscriptionId: "sub_123",
          planCode: "SCALE",
          status: "ACTIVE",
          seats: "15",
          currentPeriodStart: "2026-05-01",
          currentPeriodEnd: "2026-05-31",
          cancelAtPeriodEnd: false
        }}
      />
    );

    expect(screen.getByText("Stripe Billing Summary")).toBeTruthy();
    expect(screen.getByDisplayValue("finance@example.com")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Update Billing" }).getAttribute("disabled")
    ).not.toBeNull();
  });

  it("renders the fixed asset form with core depreciation inputs", () => {
    render(
      <FixedAssetForm
        canWrite
        endpoint="/v1/assets"
        initialValues={{
          assetNumber: "FA-0001",
          name: "Display Wall",
          category: "Equipment",
          purchaseDate: "2026-04-01",
          cost: "1200.00",
          salvageValue: "0.00",
          usefulLifeMonths: "12",
          depreciationMethod: "STRAIGHT_LINE"
        }}
        method="POST"
        submitLabel="Create Asset"
      />
    );

    expect(screen.getByDisplayValue("FA-0001")).toBeTruthy();
    expect(screen.getByDisplayValue("STRAIGHT_LINE")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Asset" })).toBeTruthy();
  });
});
