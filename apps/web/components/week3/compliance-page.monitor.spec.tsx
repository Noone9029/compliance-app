import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { fetchServerJson, getCapabilities } = vi.hoisted(() => ({
  fetchServerJson: vi.fn(async (endpoint: string) => {
    if (endpoint === "/v1/compliance/overview") {
      return {
        totalInvoicesReady: 0,
        queuedSubmissions: 1,
        processingSubmissions: 1,
        retryScheduledSubmissions: 0,
        failedSubmissions: 1,
        totalReportedDocuments: 0,
        recentReportedDocuments: [],
      };
    }

    if (endpoint === "/v1/sales/invoices") {
      return [];
    }

    if (endpoint === "/v1/compliance/integration") {
      return {
        organizationName: "Nomad Events Arabia Limited",
        legalName: "Nomad Events Arabia Limited",
        taxNumber: "300123456700003",
        registrationNumber: "CR-1010998877",
        environment: "Sandbox",
        integrationDate: null,
        status: "NOT_REGISTERED",
        onboarding: null,
        timeline: [],
        mappings: [],
        availablePaymentMeans: [],
      };
    }

    if (endpoint === "/v1/compliance/reported-documents") {
      return [
        {
          id: "reported_1",
          organizationId: "org_1",
          salesInvoiceId: "inv_1",
          complianceDocumentId: "doc_1",
          documentNumber: "INV-1001",
          status: "FAILED",
          submissionFlow: "REPORTING",
          lastSubmissionStatus: "FAILED",
          failureCategory: "CONNECTIVITY",
          externalSubmissionId: null,
          responseCode: "FAILED",
          responseMessage: "Gateway timeout",
          submittedAt: "2026-04-20T08:00:00.000Z",
          createdAt: "2026-04-20T08:00:00.000Z",
        },
      ];
    }

    if (endpoint === "/v1/compliance/documents") {
      return [
        {
          salesInvoiceId: "inv_1",
          invoiceNumber: "INV-1001",
          invoiceStatus: "ISSUED",
          issueDate: "2026-04-20T07:00:00.000Z",
          dueDate: "2026-04-27T07:00:00.000Z",
          currencyCode: "SAR",
          total: "1150.00",
          compliance: {
            id: "doc_1",
            salesInvoiceId: "inv_1",
            invoiceKind: "SIMPLIFIED",
            submissionFlow: "REPORTING",
            invoiceCounter: 10,
            uuid: "uuid-1",
            qrPayload: "qr-1",
            previousHash: null,
            currentHash: "hash-1",
            xmlAvailable: true,
            status: "FAILED",
            lastSubmissionStatus: "FAILED",
            lastSubmittedAt: "2026-04-20T08:00:00.000Z",
            lastError: "Gateway timeout",
            failureCategory: "CONNECTIVITY",
            externalSubmissionId: null,
            clearedAt: null,
            reportedAt: null,
            localValidation: {
              status: "FAILED",
              warnings: ["Tax code normalization warning"],
              errors: ["Missing buyer reference"],
            },
            localValidationMetadata: null,
            hashMetadata: null,
            qrMetadata: null,
            signatureMetadata: null,
            retryAllowed: true,
            canShareWithCustomer: false,
            submission: {
              id: "sub_1",
              complianceDocumentId: "doc_1",
              flow: "REPORTING",
              status: "FAILED",
              retryable: true,
              attemptCount: 5,
              maxAttempts: 5,
              availableAt: "2026-04-20T08:00:00.000Z",
              nextRetryAt: null,
              lastAttemptAt: "2026-04-20T08:00:00.000Z",
              finishedAt: "2026-04-20T08:00:00.000Z",
              failureCategory: "CONNECTIVITY",
              externalSubmissionId: null,
              errorMessage: "Gateway timeout",
              requestId: "REQ-1",
              warnings: ["Remote timeout warning"],
              errors: ["Remote timeout error"],
              createdAt: "2026-04-20T07:50:00.000Z",
              updatedAt: "2026-04-20T08:00:00.000Z",
            },
            attempts: [],
            timeline: [],
            createdAt: "2026-04-20T07:50:00.000Z",
            updatedAt: "2026-04-20T08:00:00.000Z",
          },
        },
        {
          salesInvoiceId: "inv_2",
          invoiceNumber: "INV-1002",
          invoiceStatus: "ISSUED",
          issueDate: "2026-04-20T07:00:00.000Z",
          dueDate: "2026-04-27T07:00:00.000Z",
          currencyCode: "SAR",
          total: "200.00",
          compliance: {
            id: "doc_2",
            salesInvoiceId: "inv_2",
            invoiceKind: "STANDARD",
            submissionFlow: "CLEARANCE",
            invoiceCounter: 11,
            uuid: "uuid-2",
            qrPayload: "qr-2",
            previousHash: "hash-1",
            currentHash: "hash-2",
            xmlAvailable: true,
            status: "REJECTED",
            lastSubmissionStatus: "REJECTED",
            lastSubmittedAt: "2026-04-20T09:00:00.000Z",
            lastError: "Validation failed",
            failureCategory: "VALIDATION",
            externalSubmissionId: null,
            clearedAt: null,
            reportedAt: null,
            localValidation: null,
            localValidationMetadata: null,
            hashMetadata: null,
            qrMetadata: null,
            signatureMetadata: null,
            retryAllowed: false,
            canShareWithCustomer: false,
            submission: {
              id: "sub_2",
              complianceDocumentId: "doc_2",
              flow: "CLEARANCE",
              status: "REJECTED",
              retryable: false,
              attemptCount: 1,
              maxAttempts: 5,
              availableAt: "2026-04-20T09:00:00.000Z",
              nextRetryAt: null,
              lastAttemptAt: "2026-04-20T09:00:00.000Z",
              finishedAt: "2026-04-20T09:00:00.000Z",
              failureCategory: "VALIDATION",
              externalSubmissionId: null,
              errorMessage: "Validation failed",
              requestId: "REQ-2",
              warnings: [],
              errors: ["Rule BR-KSA-10 failed"],
              createdAt: "2026-04-20T08:50:00.000Z",
              updatedAt: "2026-04-20T09:00:00.000Z",
            },
            attempts: [],
            timeline: [],
            createdAt: "2026-04-20T08:50:00.000Z",
            updatedAt: "2026-04-20T09:00:00.000Z",
          },
        },
      ];
    }

    if (endpoint === "/v1/compliance/dead-letter") {
      return [];
    }

    throw new Error(`Unhandled endpoint: ${endpoint}`);
  }),
  getCapabilities: vi.fn(async () => ({
    roleKey: "OWNER",
    permissions: [
      "compliance.read",
      "compliance.report",
      "compliance.write",
      "platform.org.manage",
    ],
  })),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("../api", () => ({
  fetchServerJson,
}));

vi.mock("../week2/route-utils", () => ({
  getCapabilities,
  hasPermission: (
    capabilities: { permissions: string[] },
    permission: string,
  ) => capabilities.permissions.includes(permission),
}));

vi.mock("./action-button", () => ({
  ActionButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock("../week10/einvoice-integration-panel", () => ({
  EInvoiceIntegrationPanel: () => (
    <div data-testid="integration-panel">Integration Panel</div>
  ),
}));

import { renderCompliancePage } from "./compliance-page";

describe("renderCompliancePage monitor quality", () => {
  it("renders retry visibility and validation warning/error blocks", async () => {
    render(await renderCompliancePage("nomad-events"));

    expect(screen.getByText("Invoice Compliance Monitor")).toBeTruthy();
    expect(screen.getByText(/Tax code normalization warning/)).toBeTruthy();
    expect(screen.getByText(/Missing buyer reference/)).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(
      screen.getByText(
        "Retry is currently blocked. Review failure category and dead-letter state for remediation.",
      ),
    ).toBeTruthy();
  });
});
