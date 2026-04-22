import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

import { DocumentDetail } from "./document-detail";

describe("DocumentDetail", () => {
  it("renders sales invoice detail including compliance metadata", () => {
    render(
      <DocumentDetail
        document={{
          id: "inv_1",
          organizationId: "org_1",
          contactId: "contact_1",
          contactName: "Al Noor Hospitality",
          contactEmail: "finance@alnoor.test",
          invoiceNumber: "INV-NE-0001",
          status: "PARTIALLY_PAID",
          complianceInvoiceKind: "STANDARD",
          complianceStatus: "REPORTED",
          issueDate: "2026-04-12T09:00:00.000Z",
          dueDate: "2026-04-22T09:00:00.000Z",
          currencyCode: "SAR",
          subtotal: "1000.00",
          taxTotal: "150.00",
          total: "1150.00",
          amountPaid: "300.00",
          amountDue: "850.00",
          notes: "Week 3 invoice",
          createdAt: "2026-04-12T09:00:00.000Z",
          updatedAt: "2026-04-12T09:00:00.000Z",
          lines: [
            {
              id: "line_1",
              description: "Implementation sprint",
              inventoryItemId: "item_1",
              inventoryItemCode: "ITM-1001",
              inventoryItemName: "Implementation sprint",
              quantity: "2.00",
              unitPrice: "500.00",
              taxRateId: "tax_1",
              taxRateName: "VAT 15%",
              taxRatePercent: "15.00",
              lineSubtotal: "1000.00",
              lineTax: "150.00",
              lineTotal: "1150.00",
              sortOrder: 0
            }
          ],
          payments: [
            {
              id: "payment_1",
              bankAccountId: "bank_1",
              bankAccountName: "Operating Account",
              paymentDate: "2026-04-13T09:00:00.000Z",
              amount: "300.00",
              method: "Bank Transfer",
              reference: "WK3-PMT-001",
              notes: null,
              createdAt: "2026-04-13T09:00:00.000Z"
            }
          ],
          attachments: [],
          statusEvents: [
            {
              id: "event_1",
              action: "sales.invoice.created",
              fromStatus: null,
              toStatus: "ISSUED",
              message: "Invoice created.",
              actorUserId: "user_1",
              createdAt: "2026-04-12T09:00:00.000Z"
            }
          ],
          compliance: {
            id: "compliance_1",
            salesInvoiceId: "inv_1",
            invoiceKind: "STANDARD",
            submissionFlow: "CLEARANCE",
            invoiceCounter: 7,
            uuid: "uuid-value",
            qrPayload: "qr-value",
            previousHash: null,
            currentHash: "hash-value",
            xmlAvailable: true,
            status: "CLEARED",
            lastSubmissionStatus: "ACCEPTED",
            lastSubmittedAt: "2026-04-13T10:00:00.000Z",
            lastError: null,
            failureCategory: null,
            externalSubmissionId: "clearance-uuid",
            clearedAt: "2026-04-13T10:00:00.000Z",
            reportedAt: null,
            localValidation: {
              status: "PASSED",
              warnings: ["Tag order differs from canonical sort."],
              errors: [],
            },
            retryAllowed: false,
            canShareWithCustomer: true,
            submission: {
              id: "submission_1",
              complianceDocumentId: "compliance_1",
              flow: "CLEARANCE",
              status: "ACCEPTED",
              retryable: false,
              attemptCount: 1,
              maxAttempts: 5,
              availableAt: "2026-04-13T09:55:00.000Z",
              nextRetryAt: null,
              lastAttemptAt: "2026-04-13T10:00:00.000Z",
              finishedAt: "2026-04-13T10:00:00.000Z",
              failureCategory: null,
              externalSubmissionId: "clearance-uuid",
              errorMessage: null,
              requestId: "REQ-INV-NE-0001",
              warnings: ["Rounded tax value adjusted by gateway."],
              errors: [],
              createdAt: "2026-04-13T09:55:00.000Z",
              updatedAt: "2026-04-13T10:00:00.000Z"
            },
            attempts: [
              {
                id: "attempt_1",
                complianceDocumentId: "compliance_1",
                submissionId: "submission_1",
                attemptNumber: 1,
                flow: "CLEARANCE",
                status: "ACCEPTED",
                retryable: false,
                endpoint: "test://zatca/clearance",
                httpStatus: null,
                failureCategory: null,
                externalSubmissionId: "clearance-uuid",
                errorMessage: null,
                requestId: "REQ-INV-NE-0001",
                warnings: ["Rounded tax value adjusted by gateway."],
                errors: [],
                startedAt: "2026-04-13T09:59:00.000Z",
                finishedAt: "2026-04-13T10:00:00.000Z"
              }
            ],
            timeline: [
              {
                id: "timeline_1",
                action: "compliance.invoice.queued",
                status: "QUEUED",
                message: "Invoice queued for ZATCA clearance.",
                createdAt: "2026-04-13T09:58:00.000Z"
              },
              {
                id: "timeline_2",
                action: "compliance.invoice.cleared",
                status: "CLEARED",
                message: "Invoice cleared in sandbox.",
                createdAt: "2026-04-13T10:00:00.000Z"
              }
            ],
            createdAt: "2026-04-13T10:00:00.000Z",
            updatedAt: "2026-04-13T10:00:00.000Z"
          }
        }}
        kind="sales"
        orgSlug="nomad-events"
        reportedDocument={{
          id: "reported_1",
          organizationId: "org_1",
          salesInvoiceId: "inv_1",
          complianceDocumentId: "compliance_1",
          documentNumber: "INV-NE-0001",
          status: "CLEARED",
          submissionFlow: "CLEARANCE",
          lastSubmissionStatus: "ACCEPTED",
          failureCategory: null,
          externalSubmissionId: "clearance-uuid",
          responseCode: "CLEARED",
          responseMessage: "Invoice cleared in sandbox.",
          submittedAt: "2026-04-13T10:00:00.000Z",
          createdAt: "2026-04-13T10:00:00.000Z"
        }}
      />
    );

    expect(screen.getByText("Invoice INV-NE-0001")).toBeTruthy();
    expect(screen.getByText("Get Back")).toBeTruthy();
    expect(
      screen.getByText((content, element) => {
        return element?.textContent === "Amounts with Tax Exclusive";
      })
    ).toBeTruthy();
    expect(screen.getByText("Show History & Notes")).toBeTruthy();
    expect(screen.getByText("ZATCA Compliance")).toBeTruthy();
    expect(screen.getAllByText("Invoice cleared in sandbox.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("ITM-1001 · Implementation sprint")).toBeTruthy();
    expect(screen.getByText("Download")).toBeTruthy();
    expect(screen.getByText("Operating Account")).toBeTruthy();
    expect(screen.getByText("Transport Attempts")).toBeTruthy();
    expect(screen.getByText("Compliance Timeline")).toBeTruthy();
    expect(screen.getByText("Local SDK Validation")).toBeTruthy();
    expect(screen.getAllByText("REQ-INV-NE-0001").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Rounded tax value adjusted by gateway\./).length).toBeGreaterThanOrEqual(1);
  });

  it("renders quote conversion link when a quote has been converted", () => {
    render(
      <DocumentDetail
        document={{
          id: "quote_1",
          organizationId: "org_1",
          contactId: "contact_1",
          contactName: "Al Noor Hospitality",
          contactEmail: "quotes@alnoor.test",
          quoteNumber: "QUO-NE-0001",
          status: "CONVERTED",
          expiryDate: "2026-04-22T09:00:00.000Z",
          issueDate: "2026-04-12T09:00:00.000Z",
          currencyCode: "SAR",
          subtotal: "900.00",
          taxTotal: "0.00",
          total: "900.00",
          convertedInvoiceId: "inv_99",
          notes: "Converted quote",
          createdAt: "2026-04-12T09:00:00.000Z",
          updatedAt: "2026-04-12T09:00:00.000Z",
          lines: [],
          attachments: []
        }}
        kind="quotes"
        orgSlug="nomad-events"
      />
    );

    expect(screen.getByText("Conversion Result")).toBeTruthy();
    expect(screen.getByText("Open converted invoice draft")).toBeTruthy();
    expect(screen.getByText("Small Quote")).toBeTruthy();
  });
});
