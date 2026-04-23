import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { fetchServerJson, getCapabilities } = vi.hoisted(() => ({
  fetchServerJson: vi.fn(async (endpoint: string) => {
    if (endpoint === "/v1/compliance/overview") {
      return {
        totalInvoicesReady: 0,
        queuedSubmissions: 1,
        processingSubmissions: 0,
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

    if (
      endpoint === "/v1/compliance/reported-documents" ||
      endpoint === "/v1/compliance/documents"
    ) {
      return [];
    }

    if (endpoint === "/v1/compliance/dead-letter") {
      return [
        {
          submissionId: "sub_retryable",
          complianceDocumentId: "doc_retryable",
          salesInvoiceId: "inv_retryable",
          invoiceNumber: "INV-1001",
          submissionFlow: "REPORTING",
          submissionStatus: "FAILED",
          state: "OPEN",
          failureCategory: "CONNECTIVITY",
          lastError: "Gateway timeout",
          reason: "Gateway timed out after max retries.",
          failedAt: "2026-04-20T08:00:00.000Z",
          attemptCount: 5,
          maxAttempts: 5,
          wasRetryable: true,
          canRequeue: true,
          acknowledgedAt: null,
          escalatedAt: null,
          requeuedAt: null,
          requestId: "REQ-RETRY",
          externalSubmissionId: null,
          updatedAt: "2026-04-20T08:00:00.000Z",
        },
        {
          submissionId: "sub_terminal",
          complianceDocumentId: "doc_terminal",
          salesInvoiceId: "inv_terminal",
          invoiceNumber: "INV-1002",
          submissionFlow: "CLEARANCE",
          submissionStatus: "REJECTED",
          state: "OPEN",
          failureCategory: "VALIDATION",
          lastError: "Invoice failed validation",
          reason: "ZATCA rejected validation rules.",
          failedAt: "2026-04-20T09:00:00.000Z",
          attemptCount: 1,
          maxAttempts: 5,
          wasRetryable: false,
          canRequeue: false,
          acknowledgedAt: null,
          escalatedAt: null,
          requeuedAt: null,
          requestId: "REQ-TERM",
          externalSubmissionId: null,
          updatedAt: "2026-04-20T09:00:00.000Z",
        },
      ];
    }

    if (endpoint === "/v1/compliance/dead-letter/sub_retryable") {
      return {
        submissionId: "sub_retryable",
        complianceDocumentId: "doc_retryable",
        salesInvoiceId: "inv_retryable",
        invoiceNumber: "INV-1001",
        submissionFlow: "REPORTING",
        submissionStatus: "FAILED",
        state: "OPEN",
        failureCategory: "CONNECTIVITY",
        lastError: "Gateway timeout",
        reason: "Gateway timed out after max retries.",
        failedAt: "2026-04-20T08:00:00.000Z",
        attemptCount: 5,
        maxAttempts: 5,
        wasRetryable: true,
        canRequeue: true,
        acknowledgedAt: null,
        escalatedAt: null,
        requeuedAt: null,
        requestId: "REQ-RETRY",
        externalSubmissionId: null,
        updatedAt: "2026-04-20T08:00:00.000Z",
        compliance: {
          id: "doc_retryable",
          salesInvoiceId: "inv_retryable",
          invoiceKind: "SIMPLIFIED",
          submissionFlow: "REPORTING",
          invoiceCounter: 17,
          uuid: "uuid-retryable",
          qrPayload: "qr-retryable",
          previousHash: null,
          currentHash: "hash-retryable",
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
            status: "PASSED",
            warnings: [],
            errors: [],
          },
          localValidationMetadata: null,
          hashMetadata: null,
          qrMetadata: null,
          signatureMetadata: null,
          retryAllowed: true,
          canShareWithCustomer: false,
          submission: {
            id: "sub_retryable",
            complianceDocumentId: "doc_retryable",
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
            requestId: "REQ-RETRY",
            warnings: [],
            errors: [],
            createdAt: "2026-04-20T07:55:00.000Z",
            updatedAt: "2026-04-20T08:00:00.000Z",
          },
          attempts: [
            {
              id: "attempt_1",
              complianceDocumentId: "doc_retryable",
              submissionId: "sub_retryable",
              attemptNumber: 1,
              flow: "REPORTING",
              status: "FAILED",
              retryable: true,
              endpoint: "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/invoices/reporting/single",
              httpStatus: 504,
              failureCategory: "CONNECTIVITY",
              externalSubmissionId: null,
              errorMessage: "Gateway timeout",
              requestId: "REQ-RETRY",
              warnings: [],
              errors: [],
              startedAt: "2026-04-20T07:59:00.000Z",
              finishedAt: "2026-04-20T08:00:00.000Z",
            },
          ],
          timeline: [
            {
              id: "timeline_1",
              action: "compliance.submission.dead_lettered",
              status: "FAILED",
              message: "Submission moved to dead-letter queue.",
              createdAt: "2026-04-20T08:00:00.000Z",
            },
          ],
          createdAt: "2026-04-20T07:55:00.000Z",
          updatedAt: "2026-04-20T08:00:00.000Z",
        },
        timeline: [
          {
            id: "timeline_1",
            action: "compliance.submission.dead_lettered",
            status: "FAILED",
            message: "Submission moved to dead-letter queue.",
            createdAt: "2026-04-20T08:00:00.000Z",
          },
        ],
      };
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

describe("renderCompliancePage dead-letter remediation", () => {
  it("renders retryable and terminal failure visibility", async () => {
    render(await renderCompliancePage("nomad-events"));

    expect(screen.getByText("Dead-letter Remediation")).toBeTruthy();
    expect(screen.getByText("INV-1001")).toBeTruthy();
    expect(screen.getByText("INV-1002")).toBeTruthy();
    expect(screen.getByText("Retryable root cause")).toBeTruthy();
    expect(screen.getByText("Terminal root cause")).toBeTruthy();
    expect(screen.getByText("Can be requeued")).toBeTruthy();
    expect(screen.getByText("Requeue blocked")).toBeTruthy();
  });

  it("renders dead-letter detail with attempt and event timelines", async () => {
    render(
      await renderCompliancePage("nomad-events", {
        deadLetterSubmissionId: "sub_retryable",
      }),
    );

    expect(screen.getByText("Dead-letter Detail")).toBeTruthy();
    expect(screen.getByText("Attempts Timeline")).toBeTruthy();
    expect(screen.getByText("Event Timeline")).toBeTruthy();
    expect(screen.getByText("Gateway timed out after max retries.")).toBeTruthy();
  });
});
