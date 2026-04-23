import { describe, expect, it, vi } from "vitest";

import { ComplianceService } from "./compliance.service";

function createDeadLetterService() {
  const tx = {
    complianceDocument: {
      update: vi.fn().mockResolvedValue(null),
    },
    zatcaSubmission: {
      update: vi.fn().mockResolvedValue(null),
    },
    reportedDocument: {
      upsert: vi.fn().mockResolvedValue(null),
    },
    complianceEvent: {
      create: vi.fn().mockResolvedValue(null),
    },
    invoiceStatusEvent: {
      create: vi.fn().mockResolvedValue(null),
    },
  };

  const prisma = {
    zatcaSubmission: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<void>) =>
      callback(tx),
    ),
  };

  const complianceQueueService = {
    enqueueSubmission: vi.fn().mockResolvedValue(undefined),
  };

  const service = new ComplianceService(
    prisma as any,
    complianceQueueService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return {
    service,
    prisma,
    complianceQueueService,
    tx,
  };
}

describe("ComplianceService dead-letter workflow", () => {
  it("lists dead-letter items with retryable and terminal visibility", async () => {
    const { service, prisma } = createDeadLetterService();

    prisma.zatcaSubmission.findMany.mockResolvedValue([
      {
        id: "sub_retryable",
        complianceDocumentId: "doc_retryable",
        flow: "REPORTING",
        status: "FAILED",
        failureCategory: "CONNECTIVITY",
        errorMessage: "Gateway timeout",
        responsePayload: { requestId: "REQ-RETRY" },
        externalSubmissionId: null,
        attemptCount: 5,
        maxAttempts: 5,
        updatedAt: new Date("2026-04-20T08:00:00.000Z"),
        finishedAt: new Date("2026-04-20T08:00:00.000Z"),
        lastAttemptAt: new Date("2026-04-20T08:00:00.000Z"),
        events: [
          {
            action: "compliance.submission.dead_lettered",
            createdAt: new Date("2026-04-20T08:00:00.000Z"),
            metadata: {
              reason: "Gateway timed out after max retries.",
              failedAt: "2026-04-20T08:00:00.000Z",
              wasRetryable: true,
            },
            message: "Submission moved to dead-letter queue.",
          },
        ],
        complianceDocument: {
          salesInvoiceId: "inv_retryable",
          salesInvoice: {
            invoiceNumber: "INV-1001",
          },
        },
      },
      {
        id: "sub_terminal",
        complianceDocumentId: "doc_terminal",
        flow: "CLEARANCE",
        status: "REJECTED",
        failureCategory: "VALIDATION",
        errorMessage: "Invoice failed validation",
        responsePayload: { requestId: "REQ-TERM" },
        externalSubmissionId: null,
        attemptCount: 1,
        maxAttempts: 5,
        updatedAt: new Date("2026-04-20T09:00:00.000Z"),
        finishedAt: new Date("2026-04-20T09:00:00.000Z"),
        lastAttemptAt: new Date("2026-04-20T09:00:00.000Z"),
        events: [
          {
            action: "compliance.submission.dead_lettered",
            createdAt: new Date("2026-04-20T09:00:00.000Z"),
            metadata: {
              reason: "ZATCA validation failed.",
              failedAt: "2026-04-20T09:00:00.000Z",
              wasRetryable: false,
            },
            message: "Submission moved to dead-letter queue.",
          },
        ],
        complianceDocument: {
          salesInvoiceId: "inv_terminal",
          salesInvoice: {
            invoiceNumber: "INV-1002",
          },
        },
      },
      {
        id: "sub_requeued",
        complianceDocumentId: "doc_requeued",
        flow: "REPORTING",
        status: "QUEUED",
        failureCategory: "CONNECTIVITY",
        errorMessage: null,
        responsePayload: { requestId: "REQ-REQUEUED" },
        externalSubmissionId: null,
        attemptCount: 0,
        maxAttempts: 5,
        updatedAt: new Date("2026-04-20T10:00:00.000Z"),
        finishedAt: null,
        lastAttemptAt: null,
        events: [
          {
            action: "compliance.submission.dead_lettered",
            createdAt: new Date("2026-04-20T09:30:00.000Z"),
            metadata: {
              reason: "Temporary outage.",
              failedAt: "2026-04-20T09:30:00.000Z",
              wasRetryable: true,
            },
            message: "Submission moved to dead-letter queue.",
          },
          {
            action: "compliance.submission.dead_letter_requeued",
            createdAt: new Date("2026-04-20T10:00:00.000Z"),
            metadata: {
              requeuedAt: "2026-04-20T10:00:00.000Z",
            },
            message: "Dead-letter submission requeued by operator.",
          },
        ],
        complianceDocument: {
          salesInvoiceId: "inv_requeued",
          salesInvoice: {
            invoiceNumber: "INV-1003",
          },
        },
      },
    ]);

    const items = await service.listDeadLetterItems("org_1");

    expect(items).toHaveLength(2);

    const retryable = items.find((item) => item.submissionId === "sub_retryable");
    expect(retryable).toMatchObject({
      state: "OPEN",
      failureCategory: "CONNECTIVITY",
      wasRetryable: true,
      canRequeue: true,
    });

    const terminal = items.find((item) => item.submissionId === "sub_terminal");
    expect(terminal).toMatchObject({
      state: "OPEN",
      failureCategory: "VALIDATION",
      wasRetryable: false,
      canRequeue: false,
    });

    expect(items.some((item) => item.submissionId === "sub_requeued")).toBe(false);
  });

  it("requeues eligible dead-letter submissions and enqueues worker job", async () => {
    const { service, complianceQueueService, prisma, tx } = createDeadLetterService();

    vi.spyOn(service as any, "deadLetterContextOrThrow").mockResolvedValue({
      submission: {
        id: "sub_retryable",
        complianceDocumentId: "doc_retryable",
        flow: "REPORTING",
        failureCategory: "CONNECTIVITY",
        attemptCount: 5,
        maxAttempts: 5,
        responsePayload: {
          requestId: "REQ-RETRY",
          deadLettered: true,
          deadLetter: {
            state: "OPEN",
          },
        },
        complianceDocument: {
          salesInvoiceId: "inv_retryable",
          onboarding: {
            environment: "Sandbox",
          },
          salesInvoice: {
            invoiceNumber: "INV-1001",
            status: "ISSUED",
          },
        },
      },
      lifecycle: {
        state: "OPEN",
      },
      canRequeue: true,
    });
    vi.spyOn(service as any, "findActiveOnboardingForEnvironment").mockResolvedValue({
      id: "onb_1",
    });
    vi.spyOn(service, "getDeadLetterItem").mockResolvedValue({
      submissionId: "sub_retryable",
    } as any);

    await service.requeueDeadLetterItem("org_1", "user_1", "sub_retryable");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.complianceDocument.update).toHaveBeenCalledTimes(1);
    expect(tx.zatcaSubmission.update).toHaveBeenCalledTimes(1);
    expect(tx.reportedDocument.upsert).toHaveBeenCalledTimes(1);
    expect(complianceQueueService.enqueueSubmission).toHaveBeenCalledWith(
      "sub_retryable",
    );
  });

  it("blocks requeue for terminal dead-letter submissions", async () => {
    const { service, complianceQueueService } = createDeadLetterService();

    vi.spyOn(service as any, "deadLetterContextOrThrow").mockResolvedValue({
      submission: {
        id: "sub_terminal",
      },
      lifecycle: {
        state: "OPEN",
      },
      canRequeue: false,
    });

    await expect(
      service.requeueDeadLetterItem("org_1", "user_1", "sub_terminal"),
    ).rejects.toThrow("terminal and cannot be requeued");
    expect(complianceQueueService.enqueueSubmission).not.toHaveBeenCalled();
  });
});
