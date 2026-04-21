import type { ComplianceFailureCategory } from "@daftar/types";
import { PrismaClient, type Prisma } from "@prisma/client";

import {
  calculateRetryDelayMs,
  maxComplianceAttempts,
} from "./compliance-core";
import {
  createComplianceTransportClient,
  type ComplianceTransportCredentials,
  type ComplianceTransportClient,
  ComplianceTransportError,
} from "./compliance-transport";
import { enqueueComplianceSubmission } from "./compliance-queue";

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

function onboardingTransportCredentials(onboarding: {
  csid: string | null;
  certificateSecret: string | null;
  certificatePem: string | null;
} | null): ComplianceTransportCredentials | null {
  if (!onboarding?.csid || !onboarding.certificateSecret) {
    return null;
  }

  return {
    clientId: onboarding.csid,
    clientSecret: onboarding.certificateSecret,
    certificatePem: onboarding.certificatePem,
    certificateSecret: onboarding.certificateSecret,
  };
}

function acceptedDocumentStatus(flow: "CLEARANCE" | "REPORTING", warned: boolean) {
  if (flow === "CLEARANCE") {
    return warned ? "CLEARED_WITH_WARNINGS" : "CLEARED";
  }

  return warned ? "REPORTED_WITH_WARNINGS" : "REPORTED";
}

function failureDocumentStatus(
  retryable: boolean,
  category: ComplianceFailureCategory,
) {
  if (retryable) {
    return "RETRY_SCHEDULED";
  }

  if (category === "ZATCA_REJECTION" || category === "VALIDATION") {
    return "REJECTED";
  }

  return "FAILED";
}

function failureSubmissionStatus(
  retryable: boolean,
  category: ComplianceFailureCategory,
) {
  if (retryable) {
    return "RETRY_SCHEDULED";
  }

  if (category === "ZATCA_REJECTION" || category === "VALIDATION") {
    return "REJECTED";
  }

  return "FAILED";
}

async function createComplianceEvent(
  prisma: PrismaClientLike,
  input: {
    organizationId: string;
    salesInvoiceId: string;
    complianceDocumentId: string;
    complianceOnboardingId: string | null;
    zatcaSubmissionId: string;
    action: string;
    status: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await prisma.complianceEvent.create({
    data: {
      organizationId: input.organizationId,
      salesInvoiceId: input.salesInvoiceId,
      complianceDocumentId: input.complianceDocumentId,
      complianceOnboardingId: input.complianceOnboardingId,
      zatcaSubmissionId: input.zatcaSubmissionId,
      action: input.action,
      status: input.status,
      message: input.message,
      metadata: input.metadata,
    },
  });
}

export async function processComplianceSubmission(input: {
  prisma: PrismaClientLike;
  submissionId: string;
  transport?: ComplianceTransportClient;
  enqueueRetry?: (submissionId: string, delayMs: number) => Promise<void>;
}) {
  const transport = input.transport ?? createComplianceTransportClient();
  const now = new Date();
  const submission = await input.prisma.zatcaSubmission.findUnique({
    where: { id: input.submissionId },
    include: {
      complianceDocument: {
        include: {
          salesInvoice: {
            include: {
              contact: true,
            },
          },
          onboarding: true,
        },
      },
    },
  });

  if (!submission) {
    return null;
  }

  const { complianceDocument } = submission;
  const { salesInvoice } = complianceDocument;

  await input.prisma.zatcaSubmission.update({
    where: { id: submission.id },
    data: {
      status: "PROCESSING",
      lockedAt: now,
      lastAttemptAt: now,
    },
  });

  await input.prisma.complianceDocument.update({
    where: { id: complianceDocument.id },
    data: {
      status: "PROCESSING",
    },
  });

  await createComplianceEvent(input.prisma, {
    organizationId: submission.organizationId,
    salesInvoiceId: salesInvoice.id,
    complianceDocumentId: complianceDocument.id,
    complianceOnboardingId: complianceDocument.onboardingId ?? null,
    zatcaSubmissionId: submission.id,
    action: "compliance.submission.processing",
    status: "PROCESSING",
    message: "Submission is being processed by the compliance worker.",
  });

  const attemptNumber = submission.attemptCount + 1;
  const attempt = await input.prisma.zatcaSubmissionAttempt.create({
    data: {
      organizationId: submission.organizationId,
      complianceDocumentId: complianceDocument.id,
      zatcaSubmissionId: submission.id,
      attemptNumber,
      flow: submission.flow,
      status: "PROCESSING",
      endpoint: transport.endpointFor(submission.flow),
      requestPayload: {
        invoiceNumber: salesInvoice.invoiceNumber,
        invoiceHash: complianceDocument.currentHash,
      } as Prisma.InputJsonValue,
    },
  });

  try {
    if (
      !complianceDocument.onboarding ||
      complianceDocument.onboarding.status !== "ACTIVE" ||
      complianceDocument.onboarding.certificateStatus !== "ACTIVE"
    ) {
      throw new ComplianceTransportError({
        message: "Compliance onboarding is not active for this organization/device.",
        category: "CONFIGURATION",
        retryable: false,
      });
    }

    const result = await transport.submit({
      flow: submission.flow,
      invoiceId: salesInvoice.id,
      invoiceNumber: salesInvoice.invoiceNumber,
      uuid: complianceDocument.uuid,
      attemptNumber,
      invoiceHash: complianceDocument.currentHash,
      xmlContent: complianceDocument.xmlContent,
      credentials: onboardingTransportCredentials(complianceDocument.onboarding),
      onboarding: complianceDocument.onboarding
        ? {
            environment: complianceDocument.onboarding.environment,
            csid: complianceDocument.onboarding.csid,
            certificateId: complianceDocument.onboarding.certificateId,
          }
        : null,
    });

    const warned = result.status === "ACCEPTED_WITH_WARNINGS";
    const nextDocumentStatus = acceptedDocumentStatus(submission.flow, warned);
    const completedAt = new Date();

    await input.prisma.zatcaSubmissionAttempt.update({
      where: { id: attempt.id },
      data: {
        status: result.status,
        retryable: false,
        externalSubmissionId: result.externalSubmissionId,
        responsePayload: result.responsePayload as Prisma.InputJsonValue,
        finishedAt: completedAt,
      },
    });

    await input.prisma.zatcaSubmission.update({
      where: { id: submission.id },
      data: {
        status: result.status,
        retryable: false,
        attemptCount: attemptNumber,
        lockedAt: null,
        nextRetryAt: null,
        finishedAt: completedAt,
        lastAttemptAt: completedAt,
        errorMessage: null,
        failureCategory: null,
        externalSubmissionId: result.externalSubmissionId,
        responsePayload: result.responsePayload as Prisma.InputJsonValue,
      },
    });

    await input.prisma.complianceDocument.update({
      where: { id: complianceDocument.id },
      data: {
        status: nextDocumentStatus,
        lastSubmissionStatus: result.status,
        lastSubmittedAt: completedAt,
        lastError: null,
        failureCategory: null,
        externalSubmissionId: result.externalSubmissionId,
        ...(submission.flow === "CLEARANCE"
          ? { clearedAt: completedAt }
          : { reportedAt: completedAt }),
      },
    });

    await input.prisma.reportedDocument.upsert({
      where: {
        salesInvoiceId: salesInvoice.id,
      },
      update: {
        documentNumber: salesInvoice.invoiceNumber,
        status: nextDocumentStatus,
        submissionFlow: submission.flow,
        lastSubmissionStatus: result.status,
        failureCategory: null,
        externalSubmissionId: result.externalSubmissionId,
        responseCode: result.responseCode,
        responseMessage: result.responseMessage,
        submittedAt: completedAt,
      },
      create: {
        organizationId: submission.organizationId,
        salesInvoiceId: salesInvoice.id,
        complianceDocumentId: complianceDocument.id,
        documentNumber: salesInvoice.invoiceNumber,
        status: nextDocumentStatus,
        submissionFlow: submission.flow,
        lastSubmissionStatus: result.status,
        responseCode: result.responseCode,
        responseMessage: result.responseMessage,
        externalSubmissionId: result.externalSubmissionId,
        submittedAt: completedAt,
      },
    });

    await createComplianceEvent(input.prisma, {
      organizationId: submission.organizationId,
      salesInvoiceId: salesInvoice.id,
      complianceDocumentId: complianceDocument.id,
      complianceOnboardingId: complianceDocument.onboardingId ?? null,
      zatcaSubmissionId: submission.id,
      action:
        submission.flow === "CLEARANCE"
          ? "compliance.invoice.cleared"
          : "compliance.invoice.reported",
      status: nextDocumentStatus,
      message: result.responseMessage,
      metadata: result.responsePayload as Prisma.InputJsonValue,
    });

    await input.prisma.invoiceStatusEvent.create({
      data: {
        salesInvoiceId: salesInvoice.id,
        action:
          submission.flow === "CLEARANCE"
            ? "sales.invoice.cleared_by_zatca"
            : "sales.invoice.reported_to_zatca",
        fromStatus: salesInvoice.status,
        toStatus: salesInvoice.status,
        message: result.responseMessage,
        metadata: {
          complianceDocumentId: complianceDocument.id,
          submissionId: submission.id,
          externalSubmissionId: result.externalSubmissionId,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      status: nextDocumentStatus,
      submissionStatus: result.status,
    };
  } catch (error) {
    const transportError =
      error instanceof ComplianceTransportError
        ? error
        : new ComplianceTransportError({
            message:
              error instanceof Error ? error.message : "Unknown compliance transport failure.",
            category: "UNKNOWN",
            retryable: false,
          });
    const retryable =
      transportError.retryable && attemptNumber < Math.max(submission.maxAttempts, 1);
    const nextRetryAt = retryable
      ? new Date(Date.now() + calculateRetryDelayMs(attemptNumber))
      : null;
    const nextSubmissionStatus = failureSubmissionStatus(
      retryable,
      transportError.category,
    );
    const nextDocumentStatus = failureDocumentStatus(
      retryable,
      transportError.category,
    );
    const completedAt = new Date();

    await input.prisma.zatcaSubmissionAttempt.update({
      where: { id: attempt.id },
      data: {
        status: nextSubmissionStatus,
        retryable,
        httpStatus: transportError.statusCode,
        failureCategory: transportError.category,
        externalSubmissionId: transportError.externalSubmissionId,
        responsePayload: transportError.responsePayload as Prisma.InputJsonValue,
        errorMessage: transportError.message,
        finishedAt: completedAt,
      },
    });

    await input.prisma.zatcaSubmission.update({
      where: { id: submission.id },
      data: {
        status: nextSubmissionStatus,
        retryable,
        attemptCount: attemptNumber,
        lockedAt: null,
        nextRetryAt,
        finishedAt: retryable ? null : completedAt,
        lastAttemptAt: completedAt,
        errorMessage: transportError.message,
        failureCategory: transportError.category,
        externalSubmissionId: transportError.externalSubmissionId,
        responsePayload: transportError.responsePayload as Prisma.InputJsonValue,
      },
    });

    await input.prisma.complianceDocument.update({
      where: { id: complianceDocument.id },
      data: {
        status: nextDocumentStatus,
        lastSubmissionStatus: nextSubmissionStatus,
        lastSubmittedAt: completedAt,
        lastError: transportError.message,
        failureCategory: transportError.category,
        externalSubmissionId: transportError.externalSubmissionId,
      },
    });

    await input.prisma.reportedDocument.upsert({
      where: {
        salesInvoiceId: salesInvoice.id,
      },
      update: {
        documentNumber: salesInvoice.invoiceNumber,
        status: nextDocumentStatus,
        submissionFlow: submission.flow,
        lastSubmissionStatus: nextSubmissionStatus,
        failureCategory: transportError.category,
        externalSubmissionId: transportError.externalSubmissionId,
        responseCode:
          transportError.statusCode !== null
            ? String(transportError.statusCode)
            : null,
        responseMessage: transportError.message,
        submittedAt: completedAt,
      },
      create: {
        organizationId: submission.organizationId,
        salesInvoiceId: salesInvoice.id,
        complianceDocumentId: complianceDocument.id,
        documentNumber: salesInvoice.invoiceNumber,
        status: nextDocumentStatus,
        submissionFlow: submission.flow,
        lastSubmissionStatus: nextSubmissionStatus,
        failureCategory: transportError.category,
        externalSubmissionId: transportError.externalSubmissionId,
        responseCode:
          transportError.statusCode !== null
            ? String(transportError.statusCode)
            : null,
        responseMessage: transportError.message,
        submittedAt: completedAt,
      },
    });

    await createComplianceEvent(input.prisma, {
      organizationId: submission.organizationId,
      salesInvoiceId: salesInvoice.id,
      complianceDocumentId: complianceDocument.id,
      complianceOnboardingId: complianceDocument.onboardingId ?? null,
      zatcaSubmissionId: submission.id,
      action: retryable
        ? "compliance.submission.retry_scheduled"
        : nextDocumentStatus === "REJECTED"
          ? "compliance.submission.rejected"
          : "compliance.submission.failed",
      status: nextDocumentStatus,
      message: transportError.message,
      metadata: {
        category: transportError.category,
        nextRetryAt: nextRetryAt?.toISOString() ?? null,
      } as Prisma.InputJsonValue,
    });

    if (retryable) {
      const enqueueRetry =
        input.enqueueRetry ??
        (async (submissionId: string, delayMs: number) => {
          await enqueueComplianceSubmission({
            submissionId,
            delayMs,
          });
        });
      await enqueueRetry(submission.id, calculateRetryDelayMs(attemptNumber));
    }

    return {
      status: nextDocumentStatus,
      submissionStatus: nextSubmissionStatus,
    };
  }
}

export async function processDueComplianceSubmissions(input?: {
  prisma?: PrismaClientLike;
  transport?: ComplianceTransportClient;
  enqueueRetry?: (submissionId: string, delayMs: number) => Promise<void>;
}) {
  const prisma = input?.prisma ?? new PrismaClient();
  const now = new Date();

  try {
    const submissions = await prisma.zatcaSubmission.findMany({
      where: {
        status: {
          in: ["QUEUED", "RETRY_SCHEDULED"],
        },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        availableAt: { lte: now },
      },
      orderBy: [{ createdAt: "asc" }],
      select: { id: true },
    });

    const results = [];
    for (const submission of submissions) {
      const result = await processComplianceSubmission({
        prisma,
        submissionId: submission.id,
        transport: input?.transport,
        enqueueRetry: input?.enqueueRetry,
      });
      results.push(result);
    }

    return results;
  } finally {
    if (!input?.prisma) {
      await (prisma as PrismaClient).$disconnect();
    }
  }
}

export function defaultMaxAttempts() {
  return maxComplianceAttempts;
}
