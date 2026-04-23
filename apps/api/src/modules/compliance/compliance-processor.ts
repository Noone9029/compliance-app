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
import {
  enqueueComplianceDeadLetter,
  enqueueComplianceSubmission,
} from "./compliance-queue";
import { ComplianceEncryptionService } from "./encryption.service";

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

const complianceEncryptionService = new ComplianceEncryptionService();

function onboardingTransportCredentials(onboarding: {
  id: string;
  csid: string | null;
  certificateSecret: string | null;
  certificatePem: string | null;
} | null): {
  credentials: ComplianceTransportCredentials | null;
  rotatedSecretCipher: string | null;
} {
  if (!onboarding?.csid || !onboarding.certificateSecret) {
    return {
      credentials: null,
      rotatedSecretCipher: null,
    };
  }

  let clientSecret: string;
  try {
    clientSecret = complianceEncryptionService.decrypt(onboarding.certificateSecret);
  } catch {
    throw new ComplianceTransportError({
      message:
        "Compliance onboarding secret cannot be decrypted. Verify encryption key configuration.",
      category: "CONFIGURATION",
      retryable: false,
    });
  }
  const rotatedSecretCipher =
    complianceEncryptionService.reencryptWithCurrentKey(onboarding.certificateSecret);

  return {
    credentials: {
      clientId: onboarding.csid,
      clientSecret,
      certificatePem: onboarding.certificatePem,
      certificateSecret: clientSecret,
    },
    rotatedSecretCipher:
      rotatedSecretCipher !== onboarding.certificateSecret ? rotatedSecretCipher : null,
  };
}

function acceptedDocumentStatus(flow: "CLEARANCE" | "REPORTING", warned: boolean) {
  if (flow === "CLEARANCE") {
    return warned ? "CLEARED_WITH_WARNINGS" : "CLEARED";
  }

  return warned ? "REPORTED_WITH_WARNINGS" : "REPORTED";
}

function acceptedEventAction(warned: boolean) {
  return warned
    ? "compliance.invoice.accepted_with_warnings"
    : "compliance.invoice.accepted";
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
  enqueueDeadLetter?: (job: {
    submissionId: string;
    reason: string;
    failureCategory: ComplianceFailureCategory;
    attemptNumber: number;
    failedAt: Date;
  }) => Promise<void>;
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
    action: "compliance.invoice.submission_started",
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
      endpoint: transport.endpointFor(
        submission.flow,
        complianceDocument.onboarding?.environment ?? null,
      ),
      requestPayload: {
        invoiceNumber: salesInvoice.invoiceNumber,
        invoiceHash: complianceDocument.currentHash,
      } as Prisma.InputJsonValue,
    },
  });

  try {
    const onboardingExpired = Boolean(
      complianceDocument.onboarding?.certificateExpiresAt &&
        complianceDocument.onboarding.certificateExpiresAt <= new Date(),
    );
    if (
      !complianceDocument.onboarding ||
      complianceDocument.onboarding.status !== "ACTIVE" ||
      complianceDocument.onboarding.certificateStatus !== "ACTIVE" ||
      complianceDocument.onboarding.revokedAt !== null ||
      onboardingExpired
    ) {
      throw new ComplianceTransportError({
        message: "Compliance onboarding is not active for this organization/device.",
        category: "CONFIGURATION",
        retryable: false,
      });
    }
    const transportCredentials = onboardingTransportCredentials(
      complianceDocument.onboarding,
    );
    if (transportCredentials.rotatedSecretCipher) {
      await input.prisma.complianceOnboarding.update({
        where: { id: complianceDocument.onboarding.id },
        data: {
          certificateSecret: transportCredentials.rotatedSecretCipher,
        },
      });
      complianceDocument.onboarding.certificateSecret =
        transportCredentials.rotatedSecretCipher;
    }

    const result = await transport.submit({
      flow: submission.flow,
      invoiceId: salesInvoice.id,
      invoiceNumber: salesInvoice.invoiceNumber,
      uuid: complianceDocument.uuid,
      attemptNumber,
      invoiceHash: complianceDocument.currentHash,
      xmlContent: complianceDocument.xmlContent,
      credentials: transportCredentials.credentials,
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
        responsePayload: {
          ...result.responsePayload,
          requestId: result.requestId,
          warnings: result.warnings,
          errors: result.errors,
        } as Prisma.InputJsonValue,
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
        responsePayload: {
          ...result.responsePayload,
          requestId: result.requestId,
          warnings: result.warnings,
          errors: result.errors,
          stampedXmlAvailable: Boolean(result.stampedXmlContent),
        } as Prisma.InputJsonValue,
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
        ...(result.stampedXmlContent
          ? {
              xmlContent: result.stampedXmlContent,
            }
          : {}),
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
      action: acceptedEventAction(warned),
      status: nextDocumentStatus,
      message: result.responseMessage,
      metadata: {
        flow: submission.flow,
        ...result.responsePayload,
        requestId: result.requestId,
        warnings: result.warnings,
        errors: result.errors,
      } as Prisma.InputJsonValue,
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
          requestId: result.requestId,
          warnings: result.warnings,
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
    const retryDelayMs = retryable
      ? calculateRetryDelayMs(attemptNumber, {
          failureCategory: transportError.category,
          statusCode: transportError.statusCode,
        })
      : null;
    const nextRetryAt = retryable ? new Date(Date.now() + retryDelayMs!) : null;
    const nextSubmissionStatus = failureSubmissionStatus(
      retryable,
      transportError.category,
    );
    const nextDocumentStatus = failureDocumentStatus(
      retryable,
      transportError.category,
    );
    const completedAt = new Date();
    const shouldDeadLetter =
      !retryable && nextDocumentStatus === "FAILED" && transportError.retryable;
    const failureResponsePayload = shouldDeadLetter
      ? ({
          ...(transportError.responsePayload ?? {}),
          deadLettered: true,
          deadLetteredAt: completedAt.toISOString(),
          deadLetterReason: transportError.message,
        } as Record<string, unknown>)
      : transportError.responsePayload;

    await input.prisma.zatcaSubmissionAttempt.update({
      where: { id: attempt.id },
      data: {
        status: nextSubmissionStatus,
        retryable,
        httpStatus: transportError.statusCode,
        failureCategory: transportError.category,
        externalSubmissionId: transportError.externalSubmissionId,
        responsePayload: failureResponsePayload as Prisma.InputJsonValue,
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
        responsePayload: failureResponsePayload as Prisma.InputJsonValue,
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
          : "compliance.submission.final_failure",
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
      await enqueueRetry(submission.id, retryDelayMs!);
    } else if (shouldDeadLetter) {
      const enqueueDeadLetter =
        input.enqueueDeadLetter ??
        (async (job: {
          submissionId: string;
          reason: string;
          failureCategory: ComplianceFailureCategory;
          attemptNumber: number;
          failedAt: Date;
        }) => {
          await enqueueComplianceDeadLetter({
            job: {
              submissionId: job.submissionId,
              reason: job.reason,
              failureCategory: job.failureCategory,
              attemptNumber: job.attemptNumber,
              failedAt: job.failedAt.toISOString(),
            },
          });
        });

      await enqueueDeadLetter({
        submissionId: submission.id,
        reason: transportError.message,
        failureCategory: transportError.category,
        attemptNumber,
        failedAt: completedAt,
      });
      await createComplianceEvent(input.prisma, {
        organizationId: submission.organizationId,
        salesInvoiceId: salesInvoice.id,
        complianceDocumentId: complianceDocument.id,
        complianceOnboardingId: complianceDocument.onboardingId ?? null,
        zatcaSubmissionId: submission.id,
        action: "compliance.submission.dead_lettered",
        status: nextDocumentStatus,
        message: "Submission moved to dead-letter queue after terminal failure.",
        metadata: {
          category: transportError.category,
          attemptNumber,
        } as Prisma.InputJsonValue,
      });
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
  enqueueDeadLetter?: (job: {
    submissionId: string;
    reason: string;
    failureCategory: ComplianceFailureCategory;
    attemptNumber: number;
    failedAt: Date;
  }) => Promise<void>;
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
        enqueueDeadLetter: input?.enqueueDeadLetter,
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
