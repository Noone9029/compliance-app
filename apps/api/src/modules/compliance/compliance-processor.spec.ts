import { describe, expect, it, vi } from "vitest";

import {
  processComplianceSubmission,
} from "./compliance-processor";
import {
  ComplianceTransportError,
  type ComplianceTransportClient,
} from "./compliance-transport";

type SubmissionStatus =
  | "QUEUED"
  | "PROCESSING"
  | "ACCEPTED"
  | "ACCEPTED_WITH_WARNINGS"
  | "RETRY_SCHEDULED"
  | "REJECTED"
  | "FAILED";

function createProcessorFixture(input?: {
  status?: SubmissionStatus;
  lockedAt?: Date | null;
  attemptCount?: number;
  maxAttempts?: number;
  latestAttemptNumber?: number;
}) {
  const now = new Date("2026-04-29T08:00:00.000Z");
  const submission = {
    id: "sub_1",
    organizationId: "org_1",
    complianceDocumentId: "doc_1",
    flow: "REPORTING" as const,
    status: input?.status ?? "QUEUED",
    attemptCount: input?.attemptCount ?? 0,
    maxAttempts: input?.maxAttempts ?? 5,
    lockedAt: input?.lockedAt ?? null,
    attempts: input?.latestAttemptNumber
      ? [{ attemptNumber: input.latestAttemptNumber }]
      : [],
    complianceDocument: {
      id: "doc_1",
      organizationId: "org_1",
      onboardingId: "onboarding_1",
      uuid: "uuid_1",
      currentHash: "hash_1",
      xmlContent: "<Invoice />",
      onboarding: {
        id: "onboarding_1",
        environment: "Sandbox",
        status: "ACTIVE",
        certificateStatus: "ACTIVE",
        revokedAt: null,
        certificateExpiresAt: new Date("2027-04-29T00:00:00.000Z"),
        csid: null,
        certificateSecret: null,
        certificatePem: null,
        certificateId: null,
      },
      salesInvoice: {
        id: "invoice_1",
        invoiceNumber: "INV-001",
        status: "ISSUED",
        contact: {},
      },
    },
  };
  const attempts: Array<{ id: string; attemptNumber: number; status: string }> = [];

  const prisma = {
    zatcaSubmission: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const staleCutoff = where.OR[1].lockedAt.lt as Date;
        const claimable =
          submission.id === where.id &&
          (submission.status === "QUEUED" ||
            submission.status === "RETRY_SCHEDULED" ||
            (submission.status === "PROCESSING" &&
              Boolean(submission.lockedAt) &&
              submission.lockedAt! < staleCutoff));

        if (!claimable) {
          return { count: 0 };
        }

        Object.assign(submission, data);
        return { count: 1 };
      }),
      findUnique: vi.fn(async () => submission),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(submission, data);
        return submission;
      }),
    },
    complianceDocument: {
      update: vi.fn(),
    },
    complianceEvent: {
      create: vi.fn(),
    },
    zatcaSubmissionAttempt: {
      create: vi.fn(async ({ data }: any) => {
        const attempt = {
          id: `attempt_${attempts.length + 1}`,
          attemptNumber: data.attemptNumber,
          status: data.status,
        };
        attempts.push(attempt);
        return attempt;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const attempt = attempts.find((entry) => entry.id === where.id);
        if (attempt) {
          Object.assign(attempt, data);
        }
        return attempt;
      }),
    },
    complianceOnboarding: {
      update: vi.fn(),
    },
    reportedDocument: {
      upsert: vi.fn(),
    },
    invoiceStatusEvent: {
      create: vi.fn(),
    },
  };
  const transport = {
    endpointFor: vi.fn(() => "test://zatca/reporting"),
    submit: vi.fn(async () => ({
      status: "ACCEPTED" as const,
      responseCode: "REPORTED",
      responseMessage: "Invoice reported.",
      requestId: "req_1",
      warnings: [],
      errors: [],
      stampedXmlContent: null,
      responsePayload: {},
      externalSubmissionId: "ext_1",
    })),
  } satisfies ComplianceTransportClient;

  return {
    now,
    prisma,
    submission,
    attempts,
    transport,
  };
}

describe("processComplianceSubmission atomic claim", () => {
  it("claims and processes a normal queued submission", async () => {
    const fixture = createProcessorFixture();

    const result = await processComplianceSubmission({
      prisma: fixture.prisma as never,
      submissionId: fixture.submission.id,
      transport: fixture.transport,
    });

    expect(result).toMatchObject({
      status: "REPORTED",
      submissionStatus: "ACCEPTED",
    });
    expect(fixture.prisma.zatcaSubmission.updateMany).toHaveBeenCalledTimes(1);
    expect(fixture.transport.submit).toHaveBeenCalledTimes(1);
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.attempts[0]?.attemptNumber).toBe(1);
  });

  it("no-ops for an already processing non-stale submission", async () => {
    const fixture = createProcessorFixture({
      status: "PROCESSING",
      lockedAt: new Date(),
    });

    const result = await processComplianceSubmission({
      prisma: fixture.prisma as never,
      submissionId: fixture.submission.id,
      transport: fixture.transport,
    });

    expect(result).toBeNull();
    expect(fixture.transport.submit).not.toHaveBeenCalled();
    expect(fixture.prisma.zatcaSubmissionAttempt.create).not.toHaveBeenCalled();
  });

  it("reclaims a stale processing submission", async () => {
    const fixture = createProcessorFixture({
      status: "PROCESSING",
      lockedAt: new Date("2026-04-29T07:00:00.000Z"),
      attemptCount: 1,
      latestAttemptNumber: 1,
    });

    const result = await processComplianceSubmission({
      prisma: fixture.prisma as never,
      submissionId: fixture.submission.id,
      transport: fixture.transport,
    });

    expect(result?.submissionStatus).toBe("ACCEPTED");
    expect(fixture.transport.submit).toHaveBeenCalledTimes(1);
    expect(fixture.attempts).toHaveLength(1);
    expect(fixture.attempts[0]?.attemptNumber).toBe(2);
  });

  it("prevents duplicate concurrent calls from creating duplicate attempts", async () => {
    const fixture = createProcessorFixture();

    const [first, second] = await Promise.all([
      processComplianceSubmission({
        prisma: fixture.prisma as never,
        submissionId: fixture.submission.id,
        transport: fixture.transport,
      }),
      processComplianceSubmission({
        prisma: fixture.prisma as never,
        submissionId: fixture.submission.id,
        transport: fixture.transport,
      }),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(fixture.transport.submit).toHaveBeenCalledTimes(1);
    expect(fixture.attempts).toHaveLength(1);
  });

  it("no-ops safely for terminal submissions", async () => {
    const fixture = createProcessorFixture({
      status: "ACCEPTED",
    });

    const result = await processComplianceSubmission({
      prisma: fixture.prisma as never,
      submissionId: fixture.submission.id,
      transport: fixture.transport,
    });

    expect(result).toBeNull();
    expect(fixture.transport.submit).not.toHaveBeenCalled();
    expect(fixture.prisma.zatcaSubmissionAttempt.create).not.toHaveBeenCalled();
  });

  it("keeps retry scheduling behavior after a claimed retryable failure", async () => {
    const fixture = createProcessorFixture();
    const enqueueRetry = vi.fn();
    fixture.transport.submit.mockRejectedValueOnce(
      new ComplianceTransportError({
        message: "ZATCA throttled the request.",
        category: "CONNECTIVITY",
        retryable: true,
        statusCode: 429,
      }),
    );

    const result = await processComplianceSubmission({
      prisma: fixture.prisma as never,
      submissionId: fixture.submission.id,
      transport: fixture.transport,
      enqueueRetry,
    });

    expect(result?.submissionStatus).toBe("RETRY_SCHEDULED");
    expect(enqueueRetry).toHaveBeenCalledWith(fixture.submission.id, 60_000);
    expect(fixture.attempts).toHaveLength(1);
  });

  it("keeps dead-letter behavior after exhausted retryable failures", async () => {
    const fixture = createProcessorFixture({
      attemptCount: 4,
      maxAttempts: 5,
      latestAttemptNumber: 4,
    });
    const enqueueDeadLetter = vi.fn();
    fixture.transport.submit.mockRejectedValueOnce(
      new ComplianceTransportError({
        message: "ZATCA gateway unavailable.",
        category: "CONNECTIVITY",
        retryable: true,
        statusCode: 503,
      }),
    );

    const result = await processComplianceSubmission({
      prisma: fixture.prisma as never,
      submissionId: fixture.submission.id,
      transport: fixture.transport,
      enqueueDeadLetter,
    });

    expect(result?.submissionStatus).toBe("FAILED");
    expect(enqueueDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: fixture.submission.id,
        failureCategory: "CONNECTIVITY",
        attemptNumber: 5,
      }),
    );
    expect(fixture.attempts).toHaveLength(1);
  });
});
