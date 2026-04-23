import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ComplianceFailureCategory,
  ComplianceDeadLetterDetailRecord,
  ComplianceDeadLetterRecord,
  ComplianceDeadLetterState,
  ComplianceDocumentRecord,
  ComplianceMonitorInvoiceRecord,
  ComplianceOnboardingRecord,
  ComplianceOverviewRecord,
  ComplianceSubmissionAttemptRecord,
  ComplianceSubmissionRecord,
  ComplianceTimelineRecord,
  EInvoiceIntegrationRecord,
  ReportedDocumentRecord,
} from "@daftar/types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  buildInvoiceXml,
  buildQrPayload,
  canShareInvoiceWithCustomer,
  complianceFlowForInvoiceKind,
  firstPreviousInvoiceHash,
  generateComplianceUuid,
  isTerminalSubmissionStatus,
  maxComplianceAttempts,
  nextInvoiceCounter,
} from "./compliance-core";
import {
  ComplianceOnboardingClient,
  type ComplianceCheckResult,
  ComplianceOnboardingClientError,
} from "./compliance-onboarding.client";
import { ComplianceCryptoService } from "./compliance-crypto.service";
import { ComplianceEncryptionService } from "./encryption.service";
import { ComplianceLocalValidationService } from "./compliance-local-validation.service";
import { ComplianceQueueService } from "./compliance-queue.service";
import { fingerprintSecret } from "./compliance-transport";
import { injectSignatureExtensionIntoInvoiceXml } from "./compliance-ubl";
import {
  redactSensitiveText,
  sanitizeSensitiveObject,
} from "./secret-redaction";

const eInvoiceIntegrationKey = "week10.einvoice.integration";
const paymentMeansOptions = [
  { code: "10", label: "Cash" },
  { code: "30", label: "Credit Transfer" },
  { code: "48", label: "Bank Card" },
  { code: "49", label: "Direct Debit" },
] as const;

const complianceDocumentWithRelationsInclude = {
  salesInvoice: true,
  submission: {
    include: {
      attempts: {
        orderBy: { startedAt: "desc" },
      },
    },
  },
  events: {
    orderBy: { createdAt: "desc" },
  },
} as const satisfies Prisma.ComplianceDocumentInclude;

type ComplianceDocumentWithRelations = Prisma.ComplianceDocumentGetPayload<{
  include: {
    salesInvoice: true;
    submission: {
      include: {
        attempts: true;
      };
    };
    events: true;
  };
}>;

type PrepareOnboardingInput = {
  deviceSerial: string;
  commonName: string;
  organizationUnitName?: string;
  organizationName: string;
  vatNumber: string;
  branchName?: string;
  countryCode?: string;
  locationAddress?: string;
  industry?: string;
};

type RenewOnboardingInput = {
  otpCode: string;
};

type RevokeOnboardingInput = {
  reason?: string;
};

type CredentialSnapshot = {
  csid: string | null;
  certificateId: string | null;
  secretFingerprint: string | null;
  certificateIssuedAt: string | null;
  certificateExpiresAt: string | null;
  revokedAt: string | null;
};

type DeadLetterLifecycleSnapshot = {
  state: ComplianceDeadLetterState;
  reason: string;
  failedAt: string;
  wasRetryable: boolean;
  acknowledgedAt: string | null;
  escalatedAt: string | null;
  requeuedAt: string | null;
};

type IntegrationConfig = {
  environment: "Production" | "Sandbox";
  integrationDate?: string | null;
  status?: "REGISTERED" | "NOT_REGISTERED";
  mappings?: Record<string, string | null>;
};

type ComplianceEnvironment = IntegrationConfig["environment"];

const deadLetterLifecycleActions = [
  "compliance.submission.dead_lettered",
  "compliance.submission.dead_letter_acknowledged",
  "compliance.submission.dead_letter_escalated",
  "compliance.submission.dead_letter_requeued",
] as const;

function reportedDocumentRecord(record: {
  id: string;
  organizationId: string;
  salesInvoiceId: string;
  complianceDocumentId: string;
  documentNumber: string;
  status: string;
  submissionFlow: "CLEARANCE" | "REPORTING";
  lastSubmissionStatus:
    | "QUEUED"
    | "PROCESSING"
    | "ACCEPTED"
    | "ACCEPTED_WITH_WARNINGS"
    | "RETRY_SCHEDULED"
    | "REJECTED"
    | "FAILED"
    | null;
  failureCategory:
    | "CONFIGURATION"
    | "AUTHENTICATION"
    | "CONNECTIVITY"
    | "VALIDATION"
    | "ZATCA_REJECTION"
    | "TERMINAL"
    | "UNKNOWN"
    | null;
  externalSubmissionId: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  submittedAt: Date;
  createdAt: Date;
}): ReportedDocumentRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    salesInvoiceId: record.salesInvoiceId,
    complianceDocumentId: record.complianceDocumentId,
    documentNumber: record.documentNumber,
    status: record.status,
    submissionFlow: record.submissionFlow,
    lastSubmissionStatus: record.lastSubmissionStatus,
    failureCategory: record.failureCategory,
    externalSubmissionId: record.externalSubmissionId,
    responseCode: record.responseCode,
    responseMessage: record.responseMessage,
    submittedAt: record.submittedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

function timelineRecord(record: {
  id: string;
  action: string;
  status: string;
  message: string | null;
  createdAt: Date;
}): ComplianceTimelineRecord {
  return {
    id: record.id,
    action: record.action,
    status: record.status,
    message: record.message,
    createdAt: record.createdAt.toISOString(),
  };
}

function extractTransportMessages(payload: Prisma.JsonValue | null | undefined) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      requestId: null,
      warnings: [] as string[],
      errors: [] as string[],
    };
  }

  const data = payload as Record<string, unknown>;
  const normalizeMessages = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((entry) => {
            if (typeof entry === "string") {
              return redactSensitiveText(entry.trim());
            }
            if (entry && typeof entry === "object") {
              const message = (entry as { message?: unknown }).message;
              return typeof message === "string"
                ? redactSensitiveText(message.trim())
                : "";
            }
            return "";
          })
          .filter((entry): entry is string => entry.length > 0)
      : [];
  const requestId =
    typeof data.requestId === "string" && data.requestId.trim().length > 0
      ? data.requestId.trim()
      : null;

  return {
    requestId,
    warnings: normalizeMessages(data.warnings),
    errors: normalizeMessages(data.errors),
  };
}

function deadLetterMetadataObject(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if ("deadLetter" in value) {
    const deadLetter = (value as { deadLetter?: unknown }).deadLetter;
    if (deadLetter && typeof deadLetter === "object" && !Array.isArray(deadLetter)) {
      return deadLetter as Record<string, unknown>;
    }
  }

  return null;
}

function deadLetterReasonFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): string | null {
  const object = deadLetterMetadataObject(metadata);
  if (!object) {
    return null;
  }

  const raw = object.reason;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return redactSensitiveText(raw.trim());
  }

  return null;
}

function deadLetterTimestampFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
  key: "failedAt" | "acknowledgedAt" | "escalatedAt" | "requeuedAt",
) {
  const object = deadLetterMetadataObject(metadata);
  if (!object) {
    return null;
  }

  const raw = object[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function deadLetterRetryableFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
) {
  const object = deadLetterMetadataObject(metadata);
  if (!object) {
    return null;
  }

  const raw = object.wasRetryable;
  return typeof raw === "boolean" ? raw : null;
}

function isDeadLetterRequeueEligible(
  category: ComplianceFailureCategory | null,
  wasRetryable: boolean,
) {
  if (!wasRetryable) {
    return false;
  }

  return category === "CONNECTIVITY" || category === "UNKNOWN";
}

function deadLetterLifecycleSnapshot(input: {
  events: {
    action: string;
    createdAt: Date;
    metadata: Prisma.JsonValue | null;
    message: string | null;
  }[];
  fallbackReason: string | null;
  fallbackFailedAt: Date;
  fallbackRetryable: boolean;
}): DeadLetterLifecycleSnapshot | null {
  let current: DeadLetterLifecycleSnapshot | null = null;

  for (const event of input.events) {
    if (event.action === "compliance.submission.dead_lettered") {
      current = {
        state: "OPEN",
        reason:
          deadLetterReasonFromMetadata(event.metadata) ??
          (event.message ? redactSensitiveText(event.message) : null) ??
          (input.fallbackReason ? redactSensitiveText(input.fallbackReason) : null) ??
          "Submission reached dead-letter queue.",
        failedAt:
          deadLetterTimestampFromMetadata(event.metadata, "failedAt") ??
          event.createdAt.toISOString(),
        wasRetryable:
          deadLetterRetryableFromMetadata(event.metadata) ?? input.fallbackRetryable,
        acknowledgedAt: null,
        escalatedAt: null,
        requeuedAt: null,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (event.action === "compliance.submission.dead_letter_acknowledged") {
      current = {
        ...current,
        state: "ACKNOWLEDGED",
        acknowledgedAt:
          deadLetterTimestampFromMetadata(event.metadata, "acknowledgedAt") ??
          event.createdAt.toISOString(),
      };
      continue;
    }

    if (event.action === "compliance.submission.dead_letter_escalated") {
      current = {
        ...current,
        state: "ESCALATED",
        escalatedAt:
          deadLetterTimestampFromMetadata(event.metadata, "escalatedAt") ??
          event.createdAt.toISOString(),
      };
      continue;
    }

    if (event.action === "compliance.submission.dead_letter_requeued") {
      current = {
        ...current,
        state: "REQUEUED",
        requeuedAt:
          deadLetterTimestampFromMetadata(event.metadata, "requeuedAt") ??
          event.createdAt.toISOString(),
      };
    }
  }

  return current;
}

function submissionRecord(record: {
  id: string;
  complianceDocumentId: string;
  flow: "CLEARANCE" | "REPORTING";
  status:
    | "QUEUED"
    | "PROCESSING"
    | "ACCEPTED"
    | "ACCEPTED_WITH_WARNINGS"
    | "RETRY_SCHEDULED"
    | "REJECTED"
    | "FAILED";
  retryable: boolean;
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  nextRetryAt: Date | null;
  lastAttemptAt: Date | null;
  finishedAt: Date | null;
  failureCategory:
    | "CONFIGURATION"
    | "AUTHENTICATION"
    | "CONNECTIVITY"
    | "VALIDATION"
    | "ZATCA_REJECTION"
    | "TERMINAL"
    | "UNKNOWN"
    | null;
  responsePayload: Prisma.JsonValue | null;
  externalSubmissionId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ComplianceSubmissionRecord {
  const response = extractTransportMessages(record.responsePayload);

  return {
    id: record.id,
    complianceDocumentId: record.complianceDocumentId,
    flow: record.flow,
    status: record.status,
    retryable: record.retryable,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    availableAt: record.availableAt.toISOString(),
    nextRetryAt: record.nextRetryAt?.toISOString() ?? null,
    lastAttemptAt: record.lastAttemptAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    failureCategory: record.failureCategory,
    externalSubmissionId: record.externalSubmissionId,
    errorMessage: record.errorMessage ? redactSensitiveText(record.errorMessage) : null,
    requestId: response.requestId,
    warnings: response.warnings,
    errors: response.errors,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function attemptRecord(record: {
  id: string;
  complianceDocumentId: string;
  zatcaSubmissionId: string;
  attemptNumber: number;
  flow: "CLEARANCE" | "REPORTING";
  status:
    | "QUEUED"
    | "PROCESSING"
    | "ACCEPTED"
    | "ACCEPTED_WITH_WARNINGS"
    | "RETRY_SCHEDULED"
    | "REJECTED"
    | "FAILED";
  retryable: boolean;
  endpoint: string;
  httpStatus: number | null;
  failureCategory:
    | "CONFIGURATION"
    | "AUTHENTICATION"
    | "CONNECTIVITY"
    | "VALIDATION"
    | "ZATCA_REJECTION"
    | "TERMINAL"
    | "UNKNOWN"
    | null;
  responsePayload: Prisma.JsonValue | null;
  externalSubmissionId: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): ComplianceSubmissionAttemptRecord {
  const response = extractTransportMessages(record.responsePayload);

  return {
    id: record.id,
    complianceDocumentId: record.complianceDocumentId,
    submissionId: record.zatcaSubmissionId,
    attemptNumber: record.attemptNumber,
    flow: record.flow,
    status: record.status,
    retryable: record.retryable,
    endpoint: record.endpoint,
    httpStatus: record.httpStatus,
    failureCategory: record.failureCategory,
    externalSubmissionId: record.externalSubmissionId,
    errorMessage: record.errorMessage ? redactSensitiveText(record.errorMessage) : null,
    requestId: response.requestId,
    warnings: response.warnings,
    errors: response.errors,
    startedAt: record.startedAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null,
  };
}

function onboardingRecord(record: {
  id: string;
  environment: string;
  deviceName: string;
  deviceSerial: string;
  status: ComplianceOnboardingRecord["status"];
  certificateStatus: ComplianceOnboardingRecord["certificateStatus"];
  commonName: string | null;
  egsSerialNumber: string | null;
  organizationUnitName: string | null;
  organizationName: string | null;
  countryCode: string | null;
  vatNumber: string | null;
  branchName: string | null;
  locationAddress: string | null;
  industry: string | null;
  csrPem: string | null;
  csrBase64: string | null;
  otpReceivedAt: Date | null;
  csrGeneratedAt: Date | null;
  csrSubmittedAt: Date | null;
  csid: string | null;
  certificateId: string | null;
  certificatePem: string | null;
  certificateBase64: string | null;
  secretFingerprint: string | null;
  certificateIssuedAt: Date | null;
  certificateExpiresAt: Date | null;
  lastActivatedAt: Date | null;
  lastRenewedAt: Date | null;
  revokedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ComplianceOnboardingRecord {
  return {
    id: record.id,
    environment: record.environment === "Production" ? "Production" : "Sandbox",
    deviceName: record.deviceName,
    deviceSerial: record.deviceSerial,
    status: record.status,
    certificateStatus: record.certificateStatus,
    commonName: record.commonName,
    egsSerialNumber: record.egsSerialNumber,
    organizationUnitName: record.organizationUnitName,
    organizationName: record.organizationName,
    countryCode: record.countryCode,
    vatNumber: record.vatNumber,
    branchName: record.branchName,
    locationAddress: record.locationAddress,
    industry: record.industry,
    hasCsr: Boolean(record.csrPem || record.csrBase64),
    hasCertificate: Boolean(
      record.certificatePem ||
        record.certificateBase64 ||
        record.certificateId ||
        record.csid,
    ),
    csrGeneratedAt: record.csrGeneratedAt?.toISOString() ?? null,
    otpReceivedAt: record.otpReceivedAt?.toISOString() ?? null,
    csrSubmittedAt: record.csrSubmittedAt?.toISOString() ?? null,
    csid: record.csid,
    certificateId: record.certificateId,
    secretFingerprint: record.secretFingerprint,
    certificateIssuedAt: record.certificateIssuedAt?.toISOString() ?? null,
    certificateExpiresAt: record.certificateExpiresAt?.toISOString() ?? null,
    lastActivatedAt: record.lastActivatedAt?.toISOString() ?? null,
    lastRenewedAt: record.lastRenewedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    lastError: record.lastError,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class ComplianceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ComplianceQueueService)
    private readonly complianceQueueService: ComplianceQueueService,
    @Inject(ComplianceCryptoService)
    private readonly complianceCryptoService: ComplianceCryptoService,
    @Inject(ComplianceEncryptionService)
    private readonly complianceEncryptionService: ComplianceEncryptionService,
    @Inject(ComplianceLocalValidationService)
    private readonly complianceLocalValidationService: ComplianceLocalValidationService,
    @Inject(ComplianceOnboardingClient)
    private readonly complianceOnboardingClient: ComplianceOnboardingClient,
  ) {}

  async getOverview(organizationId: string): Promise<ComplianceOverviewRecord> {
    const [readyCount, submissions, recentReportedDocuments, totalReportedDocuments] =
      await Promise.all([
        this.prisma.salesInvoice.count({
          where: {
            organizationId,
            status: {
              in: ["ISSUED", "PARTIALLY_PAID", "PAID"],
            },
            OR: [
              { complianceDocument: null },
              {
                complianceDocument: {
                  status: {
                    in: ["FAILED", "REJECTED"],
                  },
                },
              },
            ],
          },
        }),
        this.prisma.zatcaSubmission.groupBy({
          by: ["status"],
          where: { organizationId },
          _count: { status: true },
        }),
        this.prisma.reportedDocument.findMany({
          where: { organizationId },
          orderBy: { submittedAt: "desc" },
          take: 10,
        }),
        this.prisma.reportedDocument.count({
          where: {
            organizationId,
            status: {
              in: [
                "CLEARED",
                "CLEARED_WITH_WARNINGS",
                "REPORTED",
                "REPORTED_WITH_WARNINGS",
              ],
            },
          },
        }),
      ]);

    const countFor = (status: string) =>
      submissions.find((entry) => entry.status === status)?._count.status ?? 0;

    return {
      totalInvoicesReady: readyCount,
      totalReportedDocuments,
      queuedSubmissions: countFor("QUEUED"),
      processingSubmissions: countFor("PROCESSING"),
      retryScheduledSubmissions: countFor("RETRY_SCHEDULED"),
      failedSubmissions: countFor("FAILED") + countFor("REJECTED"),
      recentReportedDocuments: recentReportedDocuments.map(reportedDocumentRecord),
    };
  }

  async listReportedDocuments(
    organizationId: string,
  ): Promise<ReportedDocumentRecord[]> {
    const documents = await this.prisma.reportedDocument.findMany({
      where: { organizationId },
      orderBy: { submittedAt: "desc" },
    });

    return documents.map(reportedDocumentRecord);
  }

  async listComplianceDocuments(
    organizationId: string,
  ): Promise<ComplianceMonitorInvoiceRecord[]> {
    const documents = await this.prisma.complianceDocument.findMany({
      where: { organizationId },
      orderBy: [{ updatedAt: "desc" }],
      include: complianceDocumentWithRelationsInclude,
    });

    return documents.map((document) => ({
      salesInvoiceId: document.salesInvoiceId,
      invoiceNumber: document.salesInvoice.invoiceNumber,
      invoiceStatus: document.salesInvoice.status,
      issueDate: document.salesInvoice.issueDate.toISOString(),
      dueDate: document.salesInvoice.dueDate.toISOString(),
      currencyCode: document.salesInvoice.currencyCode,
      total: document.salesInvoice.total.toString(),
      compliance: this.complianceDocumentRecord(document),
    }));
  }

  async listDeadLetterItems(
    organizationId: string,
  ): Promise<ComplianceDeadLetterRecord[]> {
    const submissions = await this.prisma.zatcaSubmission.findMany({
      where: {
        organizationId,
        events: {
          some: {
            action: "compliance.submission.dead_lettered",
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        complianceDocument: {
          include: {
            salesInvoice: true,
          },
        },
        events: {
          where: {
            action: {
              in: [...deadLetterLifecycleActions],
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return submissions
      .map((submission) => this.deadLetterRecord(submission))
      .filter(
        (record): record is ComplianceDeadLetterRecord =>
          Boolean(record && record.state !== "REQUEUED"),
      );
  }

  async getDeadLetterItem(
    organizationId: string,
    submissionId: string,
  ): Promise<ComplianceDeadLetterDetailRecord> {
    const submission = await this.prisma.zatcaSubmission.findFirst({
      where: {
        id: submissionId,
        organizationId,
        events: {
          some: {
            action: "compliance.submission.dead_lettered",
          },
        },
      },
      include: {
        complianceDocument: {
          include: complianceDocumentWithRelationsInclude,
        },
        events: {
          where: {
            action: {
              in: [...deadLetterLifecycleActions],
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException("Dead-letter submission not found.");
    }

    const deadLetter = this.deadLetterRecord(submission);
    if (!deadLetter) {
      throw new NotFoundException("Dead-letter submission not found.");
    }

    return {
      ...deadLetter,
      compliance: this.complianceDocumentRecord(submission.complianceDocument),
      timeline: submission.complianceDocument.events.map(timelineRecord),
    };
  }

  async acknowledgeDeadLetterItem(
    organizationId: string,
    userId: string,
    submissionId: string,
    note?: string | null,
  ): Promise<ComplianceDeadLetterDetailRecord> {
    const context = await this.deadLetterContextOrThrow(organizationId, submissionId);
    if (context.lifecycle.state === "REQUEUED") {
      throw new BadRequestException("Dead-letter submission is already requeued.");
    }

    if (context.lifecycle.state === "ACKNOWLEDGED") {
      return this.getDeadLetterItem(organizationId, submissionId);
    }

    const acknowledgedAt = new Date();
    await this.prisma.complianceEvent.create({
      data: {
        organizationId,
        salesInvoiceId: context.submission.complianceDocument.salesInvoiceId,
        complianceDocumentId: context.submission.complianceDocumentId,
        zatcaSubmissionId: context.submission.id,
        actorUserId: userId,
        action: "compliance.submission.dead_letter_acknowledged",
        status: "ACKNOWLEDGED",
        message: "Dead-letter submission acknowledged for operator follow-up.",
        metadata: {
          acknowledgedAt: acknowledgedAt.toISOString(),
          note: note ? redactSensitiveText(note) : null,
          failureCategory: context.submission.failureCategory,
          attemptCount: context.submission.attemptCount,
          maxAttempts: context.submission.maxAttempts,
        } as Prisma.InputJsonValue,
      },
    });

    return this.getDeadLetterItem(organizationId, submissionId);
  }

  async escalateDeadLetterItem(
    organizationId: string,
    userId: string,
    submissionId: string,
    note?: string | null,
  ): Promise<ComplianceDeadLetterDetailRecord> {
    const context = await this.deadLetterContextOrThrow(organizationId, submissionId);
    if (context.lifecycle.state === "REQUEUED") {
      throw new BadRequestException("Dead-letter submission is already requeued.");
    }

    const escalatedAt = new Date();
    await this.prisma.complianceEvent.create({
      data: {
        organizationId,
        salesInvoiceId: context.submission.complianceDocument.salesInvoiceId,
        complianceDocumentId: context.submission.complianceDocumentId,
        zatcaSubmissionId: context.submission.id,
        actorUserId: userId,
        action: "compliance.submission.dead_letter_escalated",
        status: "ESCALATED",
        message: "Dead-letter submission escalated for administrator review.",
        metadata: {
          escalatedAt: escalatedAt.toISOString(),
          note: note ? redactSensitiveText(note) : null,
          failureCategory: context.submission.failureCategory,
          attemptCount: context.submission.attemptCount,
          maxAttempts: context.submission.maxAttempts,
        } as Prisma.InputJsonValue,
      },
    });

    return this.getDeadLetterItem(organizationId, submissionId);
  }

  async requeueDeadLetterItem(
    organizationId: string,
    userId: string,
    submissionId: string,
  ): Promise<ComplianceDeadLetterDetailRecord> {
    const context = await this.deadLetterContextOrThrow(organizationId, submissionId);
    if (context.lifecycle.state === "REQUEUED") {
      return this.getDeadLetterItem(organizationId, submissionId);
    }
    if (!context.canRequeue) {
      throw new BadRequestException(
        "This dead-letter submission is terminal and cannot be requeued.",
      );
    }

    const targetEnvironment = await this.resolveTargetEnvironment({
      organizationId,
      preferredEnvironment: context.submission.complianceDocument.onboarding?.environment,
    });
    const onboarding = await this.findActiveOnboardingForEnvironment(
      organizationId,
      targetEnvironment,
    );
    if (!onboarding) {
      throw new BadRequestException(
        `ZATCA onboarding is not active for ${targetEnvironment} environment. Complete device setup before requeueing.`,
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.complianceDocument.update({
        where: { id: context.submission.complianceDocumentId },
        data: {
          onboardingId: onboarding.id,
          status: "QUEUED",
          lastSubmissionStatus: "QUEUED",
          lastSubmittedAt: now,
          lastError: null,
          failureCategory: null,
          externalSubmissionId: null,
        },
      });

      const responsePayloadObject = this.metadataObject(
        context.submission.responsePayload,
      );
      const existingDeadLetter =
        responsePayloadObject.deadLetter &&
        typeof responsePayloadObject.deadLetter === "object" &&
        !Array.isArray(responsePayloadObject.deadLetter)
          ? (responsePayloadObject.deadLetter as Record<string, unknown>)
          : {};
      await tx.zatcaSubmission.update({
        where: { id: context.submission.id },
        data: {
          status: "QUEUED",
          retryable: false,
          attemptCount: 0,
          availableAt: now,
          lockedAt: null,
          nextRetryAt: null,
          errorMessage: null,
          failureCategory: null,
          externalSubmissionId: null,
          responsePayload: {
            ...responsePayloadObject,
            deadLettered: false,
            deadLetter: {
              ...existingDeadLetter,
              state: "REQUEUED",
              requeuedAt: now.toISOString(),
              requeuedByUserId: userId,
            },
          } as Prisma.InputJsonValue,
        },
      });

      await tx.reportedDocument.upsert({
        where: {
          salesInvoiceId: context.submission.complianceDocument.salesInvoiceId,
        },
        update: {
          status: "QUEUED",
          submissionFlow: context.submission.flow,
          lastSubmissionStatus: "QUEUED",
          failureCategory: null,
          externalSubmissionId: null,
          responseCode: null,
          responseMessage: "Dead-letter submission requeued by operator.",
          submittedAt: now,
        },
        create: {
          organizationId,
          salesInvoiceId: context.submission.complianceDocument.salesInvoiceId,
          complianceDocumentId: context.submission.complianceDocumentId,
          documentNumber: context.submission.complianceDocument.salesInvoice.invoiceNumber,
          status: "QUEUED",
          submissionFlow: context.submission.flow,
          lastSubmissionStatus: "QUEUED",
          responseMessage: "Dead-letter submission requeued by operator.",
          submittedAt: now,
        },
      });

      await tx.complianceEvent.create({
        data: {
          organizationId,
          salesInvoiceId: context.submission.complianceDocument.salesInvoiceId,
          complianceDocumentId: context.submission.complianceDocumentId,
          complianceOnboardingId: onboarding.id,
          zatcaSubmissionId: context.submission.id,
          actorUserId: userId,
          action: "compliance.submission.dead_letter_requeued",
          status: "QUEUED",
          message: "Dead-letter submission requeued by operator.",
          metadata: {
            requeuedAt: now.toISOString(),
            failureCategory: context.submission.failureCategory,
            attemptCount: context.submission.attemptCount,
            maxAttempts: context.submission.maxAttempts,
            previousDeadLetterState: context.lifecycle.state,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.invoiceStatusEvent.create({
        data: {
          salesInvoiceId: context.submission.complianceDocument.salesInvoiceId,
          actorUserId: userId,
          action: "sales.invoice.compliance_dead_letter_requeued",
          fromStatus: context.submission.complianceDocument.salesInvoice.status,
          toStatus: context.submission.complianceDocument.salesInvoice.status,
          message: "Dead-letter submission was requeued by an operator.",
        },
      });
    });

    await this.complianceQueueService.enqueueSubmission(submissionId);
    return this.getDeadLetterItem(organizationId, submissionId);
  }

  async getIntegration(organizationId: string): Promise<EInvoiceIntegrationRecord> {
    const [
      organization,
      taxDetail,
      bankAccounts,
      setting,
      latestOnboarding,
      activeOnboarding,
      timeline,
    ] =
      await Promise.all([
        this.prisma.organization.findUniqueOrThrow({
          where: { id: organizationId },
        }),
        this.prisma.organizationTaxDetail.findUnique({
          where: { organizationId },
        }),
        this.prisma.bankAccount.findMany({
          where: { organizationId },
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        }),
        this.prisma.organizationSetting.findUnique({
          where: {
            organizationId_key: {
              organizationId,
              key: eInvoiceIntegrationKey,
            },
          },
        }),
        this.prisma.complianceOnboarding.findFirst({
          where: { organizationId },
          orderBy: { updatedAt: "desc" },
        }),
        this.findActiveOnboarding(organizationId),
        this.prisma.complianceEvent.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
      ]);
    const config = this.integrationConfig(setting?.value);
    const optionMap = new Map<string, string>(
      paymentMeansOptions.map((option) => [option.code, option.label]),
    );
    const currentOnboarding = latestOnboarding ? onboardingRecord(latestOnboarding) : null;
    const registeredOnboarding = activeOnboarding
      ? onboardingRecord(activeOnboarding)
      : null;
    const status = registeredOnboarding ? "REGISTERED" : "NOT_REGISTERED";

    return {
      organizationName: organization.name,
      legalName: taxDetail?.legalName ?? null,
      taxNumber: taxDetail?.taxNumber ?? null,
      registrationNumber: taxDetail?.registrationNumber ?? null,
      environment: config.environment ?? "Production",
      integrationDate:
        registeredOnboarding?.lastActivatedAt ??
        currentOnboarding?.lastActivatedAt ??
        config.integrationDate ??
        null,
      status,
      onboarding: currentOnboarding,
      timeline: timeline.map(timelineRecord),
      mappings: bankAccounts.map((account) => {
        const paymentMeansCode = config.mappings?.[account.id] ?? null;
        return {
          bankAccountId: account.id,
          accountName: account.name,
          paymentMeansCode,
          paymentMeansLabel: paymentMeansCode
            ? optionMap.get(paymentMeansCode) ?? null
            : null,
        };
      }),
      availablePaymentMeans: paymentMeansOptions.map((option) => ({
        code: option.code,
        label: option.label,
      })),
    };
  }

  async updateIntegration(
    organizationId: string,
    input: {
      environment: "Production" | "Sandbox";
      mappings: { bankAccountId: string; paymentMeansCode: string | null }[];
    },
  ) {
    const existing = await this.getIntegration(organizationId);
    const mappings = Object.fromEntries(
      input.mappings.map((entry) => [entry.bankAccountId, entry.paymentMeansCode]),
    );

    await this.prisma.organizationSetting.upsert({
      where: {
        organizationId_key: {
          organizationId,
          key: eInvoiceIntegrationKey,
        },
      },
      update: {
        value: {
          environment: input.environment,
          integrationDate: existing.integrationDate,
          status: existing.status,
          mappings,
        } as Prisma.InputJsonValue,
      },
      create: {
        organizationId,
        key: eInvoiceIntegrationKey,
        value: {
          environment: input.environment,
          integrationDate: existing.integrationDate,
          status: existing.status,
          mappings,
        } as Prisma.InputJsonValue,
      },
    });

    return this.getIntegration(organizationId);
  }

  async getOnboarding(
    organizationId: string,
    onboardingId: string,
  ): Promise<ComplianceOnboardingRecord> {
    const onboarding = await this.getOnboardingEntityOrThrow(
      organizationId,
      onboardingId,
    );

    return onboardingRecord(onboarding);
  }

  async prepareOnboarding(
    organizationId: string,
    input: PrepareOnboardingInput,
  ): Promise<ComplianceOnboardingRecord> {
    const environment = await this.integrationEnvironment(organizationId);
    const onboarding = await this.prisma.complianceOnboarding.upsert({
      where: {
        organizationId_deviceSerial: {
          organizationId,
          deviceSerial: input.deviceSerial,
        },
      },
      update: {
        environment,
        deviceName: input.commonName,
        deviceSerial: input.deviceSerial,
        commonName: input.commonName,
        egsSerialNumber: input.deviceSerial,
        organizationUnitName: input.organizationUnitName ?? null,
        organizationName: input.organizationName,
        countryCode: input.countryCode ?? "SA",
        vatNumber: input.vatNumber,
        branchName: input.branchName ?? null,
        locationAddress: input.locationAddress ?? null,
        industry: input.industry ?? null,
        status: "DRAFT",
        certificateStatus: "NOT_REQUESTED",
        csrPem: null,
        csrBase64: null,
        privateKeyPem: null,
        publicKeyPem: null,
        otpCode: null,
        otpReceivedAt: null,
        csrGeneratedAt: null,
        csrSubmittedAt: null,
        csid: null,
        certificateId: null,
        certificatePem: null,
        certificateBase64: null,
        certificateSecret: null,
        secretFingerprint: null,
        certificateIssuedAt: null,
        certificateExpiresAt: null,
        lastActivatedAt: null,
        lastRenewedAt: null,
        zatcaRequestId: null,
        revokedAt: null,
        lastError: null,
        metadata: Prisma.JsonNull,
      },
      create: {
        organizationId,
        environment,
        deviceName: input.commonName,
        deviceSerial: input.deviceSerial,
        commonName: input.commonName,
        egsSerialNumber: input.deviceSerial,
        organizationUnitName: input.organizationUnitName ?? null,
        organizationName: input.organizationName,
        countryCode: input.countryCode ?? "SA",
        vatNumber: input.vatNumber,
        branchName: input.branchName ?? null,
        locationAddress: input.locationAddress ?? null,
        industry: input.industry ?? null,
        status: "DRAFT",
        certificateStatus: "NOT_REQUESTED",
        metadata: Prisma.JsonNull,
      },
    });

    await this.prisma.complianceEvent.create({
      data: {
        organizationId,
        complianceOnboardingId: onboarding.id,
        action: "compliance.onboarding.prepared",
        status: onboarding.status,
        message: "Tenant device onboarding draft prepared.",
      },
    });

    return onboardingRecord(onboarding);
  }

  async generateCsrForOnboarding(
    organizationId: string,
    onboardingId: string,
  ): Promise<ComplianceOnboardingRecord> {
    const onboarding = await this.getOnboardingEntityOrThrow(
      organizationId,
      onboardingId,
    );
    this.ensureOnboardingStatus(
      onboarding.status,
      ["DRAFT", "FAILED"],
      "Onboarding must be in DRAFT or FAILED status before CSR generation.",
    );
    const missingField = this.requiredOnboardingField(onboarding);
    if (missingField) {
      throw new BadRequestException(
        `Onboarding field ${missingField} is required before CSR generation.`,
      );
    }

    const generated = await this.complianceCryptoService.generateCsr({
      commonName: onboarding.commonName!,
      organizationName: onboarding.organizationName!,
      organizationUnitName: onboarding.organizationUnitName ?? undefined,
      vatNumber: onboarding.vatNumber!,
      countryCode: onboarding.countryCode!,
      deviceSerial: onboarding.deviceSerial,
    });
    const updated = await this.prisma.complianceOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: "CSR_GENERATED",
        certificateStatus: "CSR_GENERATED",
        privateKeyPem: this.complianceEncryptionService.encrypt(generated.privateKeyPem),
        publicKeyPem: generated.publicKeyPem,
        csrPem: generated.csrPem,
        csrBase64: generated.csrBase64,
        csrGeneratedAt: new Date(),
        otpCode: null,
        otpReceivedAt: null,
        csrSubmittedAt: null,
        csid: null,
        certificateId: null,
        certificatePem: null,
        certificateBase64: null,
        certificateSecret: null,
        secretFingerprint: null,
        certificateIssuedAt: null,
        certificateExpiresAt: null,
        lastActivatedAt: null,
        lastError: null,
        zatcaRequestId: null,
      },
    });

    await this.prisma.complianceEvent.create({
      data: {
        organizationId,
        complianceOnboardingId: updated.id,
        action: "compliance.onboarding.csr_generated",
        status: updated.status,
        message: "CSR material generated for the tenant device onboarding record.",
      },
    });

    return onboardingRecord(updated);
  }

  async markOtpPending(
    organizationId: string,
    onboardingId: string,
  ): Promise<ComplianceOnboardingRecord> {
    const onboarding = await this.getOnboardingEntityOrThrow(
      organizationId,
      onboardingId,
    );
    this.ensureOnboardingStatus(
      onboarding.status,
      ["CSR_GENERATED"],
      "CSR must be generated and onboarding must be in CSR_GENERATED status before requesting OTP.",
    );
    if (!onboarding.csrPem && !onboarding.csrBase64) {
      throw new BadRequestException(
        "CSR must be generated before the onboarding record can wait for OTP.",
      );
    }

    const updated = await this.prisma.complianceOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: "OTP_PENDING",
        certificateStatus: "OTP_PENDING",
        lastError: null,
      },
    });

    await this.prisma.complianceEvent.create({
      data: {
        organizationId,
        complianceOnboardingId: updated.id,
        action: "compliance.onboarding.otp_pending",
        status: updated.status,
        message: "CSR is ready and the onboarding record is waiting for OTP submission.",
      },
    });

    return onboardingRecord(updated);
  }

  async submitOtp(
    organizationId: string,
    onboardingId: string,
    otpCode: string,
  ): Promise<ComplianceOnboardingRecord> {
    const onboarding = await this.getOnboardingEntityOrThrow(
      organizationId,
      onboardingId,
    );
    this.ensureOnboardingStatus(
      onboarding.status,
      ["OTP_PENDING"],
      "Onboarding must be in OTP_PENDING status before OTP submission.",
    );
    if (!onboarding.csrPem && !onboarding.csrBase64) {
      throw new BadRequestException(
        "CSR must be generated before OTP submission.",
      );
    }

    const csr = onboarding.csrPem ?? onboarding.csrBase64!;
    await this.prisma.complianceEvent.create({
      data: {
        organizationId,
        complianceOnboardingId: onboarding.id,
        action: "compliance.onboarding.otp_submitted",
        status: "CSR_SUBMITTED",
        message: "OTP submitted and compliance CSID issuance started.",
      },
    });

    try {
      const issued = await this.complianceOnboardingClient.submitComplianceCsid({
        csr,
        otpCode,
        environment: onboarding.environment,
      });
      const now = new Date();
      const updated = await this.prisma.complianceOnboarding.update({
        where: { id: onboarding.id },
        data: {
          otpCode: null,
          otpReceivedAt: now,
          csrSubmittedAt: now,
          status: "CERTIFICATE_ISSUED",
          certificateStatus: "CERTIFICATE_ISSUED",
          csid: issued.csid,
          certificateId: issued.certificateId,
          certificatePem: issued.certificatePem,
          certificateBase64: issued.certificateBase64,
          certificateSecret: this.complianceEncryptionService.encrypt(issued.secret),
          secretFingerprint: fingerprintSecret(issued.secret),
          certificateIssuedAt: issued.issuedAt ?? now,
          certificateExpiresAt: issued.expiresAt,
          zatcaRequestId: issued.requestId,
          revokedAt: null,
          lastError: null,
          metadata: this.mergeOnboardingMetadata(onboarding.metadata, {
            onboardingLifecycle: {
              stage: "COMPLIANCE_CERTIFICATE_ISSUED",
              complianceRequestId: issued.requestId,
              complianceDisposition: issued.dispositionMessage,
              complianceResponse: this.sanitizeOnboardingMetadata(issued.rawPayload),
            },
          }),
        },
      });

      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          complianceOnboardingId: updated.id,
          action: "compliance.onboarding.compliance_csid_issued",
          status: updated.status,
          message:
            "Compliance CSID issued and persisted for this device onboarding record.",
        },
      });

      return onboardingRecord(updated);
    } catch (error) {
      const message = this.onboardingClientErrorMessage(
        error,
        "Compliance CSID onboarding failed.",
      );
      await this.prisma.complianceOnboarding.update({
        where: { id: onboarding.id },
        data: {
          otpCode: null,
          otpReceivedAt: new Date(),
          csrSubmittedAt: new Date(),
          status: "FAILED",
          certificateStatus: "FAILED",
          lastError: message,
          metadata: this.mergeOnboardingMetadata(onboarding.metadata, {
            onboardingLifecycle: {
              stage: "COMPLIANCE_CERTIFICATE_FAILED",
              lastError: message,
            },
          }),
        },
      });

      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          complianceOnboardingId: onboarding.id,
          action: "compliance.onboarding.compliance_csid_failed",
          status: "FAILED",
          message,
        },
      });

      throw new BadRequestException(message);
    }
  }

  async activateOnboarding(
    organizationId: string,
    onboardingId: string,
  ): Promise<ComplianceOnboardingRecord> {
    const onboarding = await this.getOnboardingEntityOrThrow(
      organizationId,
      onboardingId,
    );
    this.ensureOnboardingStatus(
      onboarding.status,
      ["CERTIFICATE_ISSUED", "CSR_SUBMITTED", "ACTIVE", "FAILED"],
      "Onboarding must have an issued compliance certificate before activation.",
    );
    if (!onboarding.csrPem && !onboarding.csrBase64) {
      throw new BadRequestException(
        "CSR must exist before production activation.",
      );
    }
    if (!onboarding.zatcaRequestId) {
      throw new BadRequestException(
        "A compliance request id is required before production activation.",
      );
    }
    if (!onboarding.csid || !onboarding.certificateSecret) {
      throw new BadRequestException(
        "Compliance credentials are required before production activation.",
      );
    }
    if (!onboarding.privateKeyPem) {
      throw new BadRequestException(
        "Private key material is required before production activation.",
      );
    }
    const certificateSecret = await this.readOnboardingSecret({
      onboardingId: onboarding.id,
      field: "certificateSecret",
      value: onboarding.certificateSecret,
      errorMessage:
        "Compliance onboarding secret cannot be decrypted. Verify encryption key configuration.",
    });
    const privateKeyPem = await this.readOnboardingSecret({
      onboardingId: onboarding.id,
      field: "privateKeyPem",
      value: onboarding.privateKeyPem,
      errorMessage:
        "Onboarding private key cannot be decrypted. Verify encryption key configuration.",
    });
    if (!certificateSecret || !privateKeyPem) {
      throw new BadRequestException(
        "Compliance credentials are required before production activation.",
      );
    }

    const csr = onboarding.csrPem ?? onboarding.csrBase64!;
    const priorCredential = this.credentialSnapshot(onboarding);
    let complianceCheckResult: ComplianceCheckResult | null = null;

    try {
      complianceCheckResult = await this.runOnboardingComplianceCheck({
        onboarding,
        organizationId,
        privateKeyPem,
        certificatePem:
          onboarding.certificatePem ??
          this.certificatePemFromBase64(onboarding.certificateBase64),
        credentials: {
          csid: onboarding.csid,
          secret: certificateSecret,
        },
      });
      if (!complianceCheckResult.passed) {
        await this.prisma.complianceEvent.create({
          data: {
            organizationId,
            complianceOnboardingId: onboarding.id,
            action: "compliance.onboarding.compliance_check_failed",
            status: "FAILED",
            message:
              complianceCheckResult.errors[0] ??
              "Sandbox compliance-check failed before production activation.",
            metadata: this.sanitizeOnboardingMetadata(
              complianceCheckResult.rawPayload,
            ) as Prisma.InputJsonValue,
          },
        });
        throw new BadRequestException(
          `Sandbox compliance-check failed before production activation. ${
            complianceCheckResult.errors[0] ?? "No error details returned."
          }`,
        );
      }
      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          complianceOnboardingId: onboarding.id,
          action: "compliance.onboarding.compliance_check_passed",
          status: "PASSED",
          message: "Sandbox compliance-check passed before production activation.",
          metadata: this.sanitizeOnboardingMetadata(
            complianceCheckResult.rawPayload,
          ) as Prisma.InputJsonValue,
        },
      });

      const activated = await this.complianceOnboardingClient.activateProductionCsid({
        csr,
        complianceRequestId: onboarding.zatcaRequestId,
        environment: onboarding.environment,
        complianceCredentials: {
          csid: onboarding.csid,
          secret: certificateSecret,
        },
      });
      const now = new Date();
      const { updated } = await this.prisma.$transaction(async (tx) => {
        const conflictingActive = await tx.complianceOnboarding.findMany({
          where: {
            organizationId,
            environment: onboarding.environment,
            id: { not: onboarding.id },
            status: "ACTIVE",
            certificateStatus: "ACTIVE",
            revokedAt: null,
          },
          orderBy: { updatedAt: "desc" },
        });

        for (const conflict of conflictingActive) {
          const conflictSnapshot = this.credentialSnapshot(conflict);
          await tx.complianceOnboarding.update({
            where: { id: conflict.id },
            data: {
              status: "CERTIFICATE_ISSUED",
              certificateStatus: "CERTIFICATE_ISSUED",
              lastError: null,
              metadata: this.lifecycleMetadata({
                existing: conflict.metadata,
                patch: {
                  stage: "DEACTIVATED_BY_DEVICE_SWITCH",
                  deactivatedAt: now.toISOString(),
                  deactivatedReason:
                    "Another device was activated for this environment.",
                  activeOnboardingId: onboarding.id,
                },
                archiveCredential: {
                  snapshot: conflictSnapshot,
                  reason: "DEVICE_SWITCH_DEACTIVATED",
                  archivedAt: now.toISOString(),
                  replacedByOnboardingId: onboarding.id,
                },
              }),
            },
          });

          await tx.complianceEvent.create({
            data: {
              organizationId,
              complianceOnboardingId: conflict.id,
              action: "compliance.onboarding.deactivated",
              status: "CERTIFICATE_ISSUED",
              message:
                "Device deactivated because another onboarding device was activated for the same environment.",
            },
          });
        }

        const next = await tx.complianceOnboarding.update({
          where: { id: onboarding.id },
          data: {
            status: "ACTIVE",
            certificateStatus: "ACTIVE",
            csid: activated.csid,
            certificateId: activated.certificateId,
            certificatePem: activated.certificatePem,
            certificateBase64: activated.certificateBase64,
            certificateSecret: this.complianceEncryptionService.encrypt(activated.secret),
            secretFingerprint: fingerprintSecret(activated.secret),
            certificateIssuedAt: activated.issuedAt ?? now,
            certificateExpiresAt: activated.expiresAt,
            lastActivatedAt: now,
            revokedAt: null,
            lastError: null,
            metadata: this.lifecycleMetadata({
              existing: onboarding.metadata,
              patch: {
                stage: "PRODUCTION_ACTIVE",
                activatedAt: now.toISOString(),
                complianceCheck: complianceCheckResult,
                activationResponse: this.sanitizeOnboardingMetadata(activated.rawPayload),
                previousCredential: priorCredential,
              },
              archiveCredential: {
                snapshot: priorCredential,
                reason: "PRODUCTION_ACTIVATION_REPLACED",
                archivedAt: now.toISOString(),
              },
            }),
          },
        });

        await tx.complianceEvent.create({
          data: {
            organizationId,
            complianceOnboardingId: next.id,
            action: "compliance.onboarding.activated",
            status: next.status,
            message:
              "Production credential activated and now used for invoice submission.",
          },
        });

        return { updated: next };
      });

      return onboardingRecord(updated);
    } catch (error) {
      const message = this.onboardingClientErrorMessage(
        error,
        "Production activation failed.",
      );
      await this.prisma.complianceOnboarding.update({
        where: { id: onboarding.id },
        data: {
          status: "CERTIFICATE_ISSUED",
          certificateStatus: "CERTIFICATE_ISSUED",
          lastError: message,
          metadata: this.mergeOnboardingMetadata(onboarding.metadata, {
            onboardingLifecycle: {
              stage: "PRODUCTION_ACTIVATION_FAILED",
              lastError: message,
            },
          }),
        },
      });

      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          complianceOnboardingId: onboarding.id,
          action: "compliance.onboarding.activation_failed",
          status: onboarding.status,
          message,
        },
      });

      throw new BadRequestException(message);
    }
  }

  async renewOnboarding(
    organizationId: string,
    onboardingId: string,
    input: RenewOnboardingInput,
  ): Promise<ComplianceOnboardingRecord> {
    const onboarding = await this.getOnboardingEntityOrThrow(
      organizationId,
      onboardingId,
    );
    this.ensureOnboardingStatus(
      onboarding.status,
      ["ACTIVE", "RENEWAL_REQUIRED"],
      "Onboarding must be ACTIVE before renewal.",
    );
    if (onboarding.certificateStatus !== "ACTIVE") {
      throw new BadRequestException(
        "Certificate status must be ACTIVE before renewal.",
      );
    }
    if (onboarding.revokedAt) {
      throw new BadRequestException(
        "Revoked onboarding credentials cannot be renewed.",
      );
    }

    const missingField = this.requiredOnboardingField(onboarding);
    if (missingField) {
      throw new BadRequestException(
        `Onboarding field ${missingField} is required before renewal CSR generation.`,
      );
    }
    if (!onboarding.csid || !onboarding.certificateSecret) {
      throw new BadRequestException(
        "Active credential material is required before renewal.",
      );
    }
    const certificateSecret = await this.readOnboardingSecret({
      onboardingId: onboarding.id,
      field: "certificateSecret",
      value: onboarding.certificateSecret,
      errorMessage:
        "Compliance onboarding secret cannot be decrypted. Verify encryption key configuration.",
    });
    if (!certificateSecret) {
      throw new BadRequestException(
        "Active credential material is required before renewal.",
      );
    }

    const generated = await this.complianceCryptoService.generateCsr({
      commonName: onboarding.commonName!,
      organizationName: onboarding.organizationName!,
      organizationUnitName: onboarding.organizationUnitName ?? undefined,
      vatNumber: onboarding.vatNumber!,
      countryCode: onboarding.countryCode!,
      deviceSerial: onboarding.deviceSerial,
    });
    const now = new Date();
    const priorCredential = this.credentialSnapshot(onboarding);

    try {
      const renewed = await this.complianceOnboardingClient.renewProductionCsid({
        csr: generated.csrPem,
        otpCode: input.otpCode,
        environment: onboarding.environment,
        currentCredentials: {
          csid: onboarding.csid,
          secret: certificateSecret,
        },
      });

      const updated = await this.prisma.complianceOnboarding.update({
        where: { id: onboarding.id },
        data: {
          status: "ACTIVE",
          certificateStatus: "ACTIVE",
          privateKeyPem: this.complianceEncryptionService.encrypt(generated.privateKeyPem),
          publicKeyPem: generated.publicKeyPem,
          csrPem: generated.csrPem,
          csrBase64: generated.csrBase64,
          csrGeneratedAt: now,
          otpCode: null,
          otpReceivedAt: now,
          csrSubmittedAt: now,
          csid: renewed.csid,
          certificateId: renewed.certificateId,
          certificatePem: renewed.certificatePem,
          certificateBase64: renewed.certificateBase64,
          certificateSecret: this.complianceEncryptionService.encrypt(renewed.secret),
          secretFingerprint: fingerprintSecret(renewed.secret),
          certificateIssuedAt: renewed.issuedAt ?? now,
          certificateExpiresAt: renewed.expiresAt,
          zatcaRequestId: renewed.requestId ?? onboarding.zatcaRequestId,
          lastRenewedAt: now,
          lastError: null,
          revokedAt: null,
          metadata: this.lifecycleMetadata({
            existing: onboarding.metadata,
            patch: {
              stage: "PRODUCTION_RENEWED",
              renewedAt: now.toISOString(),
              renewalResponse: this.sanitizeOnboardingMetadata(renewed.rawPayload),
              replacedCredential: priorCredential,
            },
            archiveCredential: {
              snapshot: priorCredential,
              reason: "RENEWAL_REPLACED",
              archivedAt: now.toISOString(),
            },
          }),
        },
      });

      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          complianceOnboardingId: updated.id,
          action: "compliance.onboarding.renewed",
          status: updated.status,
          message: "Production credential renewed and replaced.",
        },
      });

      return onboardingRecord(updated);
    } catch (error) {
      const message = this.onboardingClientErrorMessage(
        error,
        "Production renewal failed.",
      );
      await this.prisma.complianceOnboarding.update({
        where: { id: onboarding.id },
        data: {
          status: "ACTIVE",
          certificateStatus: "ACTIVE",
          lastError: message,
          metadata: this.mergeOnboardingMetadata(onboarding.metadata, {
            onboardingLifecycle: {
              stage: "PRODUCTION_RENEWAL_FAILED",
              lastError: message,
            },
          }),
        },
      });

      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          complianceOnboardingId: onboarding.id,
          action: "compliance.onboarding.renewal_failed",
          status: "ACTIVE",
          message,
        },
      });

      throw new BadRequestException(message);
    }
  }

  async revokeOnboarding(
    organizationId: string,
    onboardingId: string,
    input: RevokeOnboardingInput,
  ): Promise<ComplianceOnboardingRecord> {
    const onboarding = await this.getOnboardingEntityOrThrow(
      organizationId,
      onboardingId,
    );
    if (onboarding.status === "REVOKED" || onboarding.certificateStatus === "REVOKED") {
      return onboardingRecord(onboarding);
    }
    if (!onboarding.csid || !onboarding.certificateSecret) {
      throw new BadRequestException(
        "Credential material is required before revocation.",
      );
    }
    const certificateSecret = await this.readOnboardingSecret({
      onboardingId: onboarding.id,
      field: "certificateSecret",
      value: onboarding.certificateSecret,
      errorMessage:
        "Compliance onboarding secret cannot be decrypted. Verify encryption key configuration.",
    });
    if (!certificateSecret) {
      throw new BadRequestException(
        "Credential material is required before revocation.",
      );
    }

    try {
      const revokeResult = await this.complianceOnboardingClient.revokeProductionCsid({
        environment: onboarding.environment,
        currentCredentials: {
          csid: onboarding.csid,
          secret: certificateSecret,
        },
        reason: input.reason,
      });

      const revokedAt = new Date();
      const updated = await this.prisma.complianceOnboarding.update({
        where: { id: onboarding.id },
        data: {
          status: "REVOKED",
          certificateStatus: "REVOKED",
          revokedAt,
          lastError: null,
          metadata: this.mergeOnboardingMetadata(onboarding.metadata, {
            onboardingLifecycle: {
              stage: "PRODUCTION_REVOKED",
              revokedAt: revokedAt.toISOString(),
              reason: input.reason ?? null,
              revokeResponse: this.sanitizeOnboardingMetadata(revokeResult),
            },
          }),
        },
      });

      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          complianceOnboardingId: updated.id,
          action: "compliance.onboarding.revoked",
          status: updated.status,
          message: "Device credential revoked and deactivated.",
        },
      });

      return onboardingRecord(updated);
    } catch (error) {
      const message = this.onboardingClientErrorMessage(
        error,
        "Production revocation failed.",
      );
      await this.prisma.complianceOnboarding.update({
        where: { id: onboarding.id },
        data: {
          lastError: message,
          metadata: this.mergeOnboardingMetadata(onboarding.metadata, {
            onboardingLifecycle: {
              stage: "PRODUCTION_REVOCATION_FAILED",
              lastError: message,
            },
          }),
        },
      });

      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          complianceOnboardingId: onboarding.id,
          action: "compliance.onboarding.revocation_failed",
          status: onboarding.status,
          message,
        },
      });

      throw new BadRequestException(message);
    }
  }

  async getCurrentOnboarding(organizationId: string): Promise<ComplianceOnboardingRecord | null> {
    const onboarding =
      (await this.findActiveOnboarding(organizationId)) ??
      (await this.prisma.complianceOnboarding.findFirst({
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
      }));

    return onboarding ? onboardingRecord(onboarding) : null;
  }

  async onboard(organizationId: string) {
    const [taxDetail, organization, integration, existingOnboarding] =
      await Promise.all([
        this.prisma.organizationTaxDetail.findUnique({
          where: { organizationId },
        }),
        this.prisma.organization.findUniqueOrThrow({
          where: { id: organizationId },
        }),
        this.getIntegration(organizationId),
        this.prisma.complianceOnboarding.findFirst({
          where: { organizationId },
          orderBy: { updatedAt: "desc" },
        }),
      ]);

    if (!taxDetail) {
      throw new NotFoundException("Organisation tax details are not configured.");
    }

    const prepared = await this.prepareOnboarding(organizationId, {
      deviceSerial:
        existingOnboarding?.deviceSerial ??
        `egs-${organization.slug}-${organizationId.slice(-6)}`,
      commonName: existingOnboarding?.commonName ?? `${organization.name} EGS Unit`,
      organizationUnitName:
        existingOnboarding?.organizationUnitName ??
        taxDetail.registrationNumber ??
        undefined,
      organizationName: taxDetail.legalName ?? organization.name,
      vatNumber: taxDetail.taxNumber,
      branchName: existingOnboarding?.branchName ?? organization.name,
      countryCode: taxDetail.countryCode,
      locationAddress:
        existingOnboarding?.locationAddress ??
        [taxDetail.addressLine1, taxDetail.addressLine2, taxDetail.city]
          .filter(Boolean)
          .join(", "),
      industry: existingOnboarding?.industry ?? "General",
    });
    const onboarding = await this.generateCsrForOnboarding(
      organizationId,
      prepared.id,
    );

    await this.prisma.complianceEvent.create({
      data: {
        organizationId,
        complianceOnboardingId: onboarding.id,
        action: "compliance.integration.onboarded",
        status: onboarding.status,
        message: `Device onboarding prepared in ${integration.environment} with staged CSR generation.`,
      },
    });

    return this.getIntegration(organizationId);
  }

  async renewIntegration(organizationId: string) {
    const onboarding = await this.prisma.complianceOnboarding.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
    });

    if (!onboarding) {
      return this.onboard(organizationId);
    }

    throw new BadRequestException(
      "Use the staged onboarding endpoints to continue device renewal.",
    );
  }

  async removeIntegration(organizationId: string) {
    const existing = await this.prisma.complianceOnboarding.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
    });

    if (existing) {
      await this.revokeOnboarding(organizationId, existing.id, {
        reason: "Integration removed via legacy endpoint.",
      });
    }

    return this.getIntegration(organizationId);
  }

  private integrationConfig(value: Prisma.JsonValue | null | undefined): IntegrationConfig {
    return (
      (value as IntegrationConfig | null) ?? {
        environment: "Production",
        integrationDate: null,
        status: "NOT_REGISTERED",
        mappings: {},
      }
    );
  }

  private async integrationEnvironment(organizationId: string) {
    const setting = await this.prisma.organizationSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: eInvoiceIntegrationKey,
        },
      },
    });

    return this.integrationConfig(setting?.value).environment ?? "Production";
  }

  private async getOnboardingEntityOrThrow(
    organizationId: string,
    onboardingId: string,
  ) {
    const onboarding = await this.prisma.complianceOnboarding.findFirst({
      where: {
        id: onboardingId,
        organizationId,
      },
    });

    if (!onboarding) {
      throw new NotFoundException("Compliance onboarding record not found.");
    }

    return onboarding;
  }

  private requiredOnboardingField(record: {
    commonName: string | null;
    organizationName: string | null;
    vatNumber: string | null;
    countryCode: string | null;
    deviceSerial: string;
  }) {
    if (!record.commonName) {
      return "commonName";
    }

    if (!record.organizationName) {
      return "organizationName";
    }

    if (!record.vatNumber) {
      return "vatNumber";
    }

    if (!record.countryCode) {
      return "countryCode";
    }

    if (!record.deviceSerial) {
      return "deviceSerial";
    }

    return null;
  }

  private ensureOnboardingStatus(
    currentStatus: string,
    allowedStatuses: readonly string[],
    message: string,
  ) {
    if (allowedStatuses.includes(currentStatus)) {
      return;
    }

    throw new BadRequestException(`${message} Current status: ${currentStatus}.`);
  }

  private certificatePemFromBase64(certificateBase64: string | null) {
    if (!certificateBase64) {
      return null;
    }

    const normalized = certificateBase64.replace(/\s+/g, "");
    if (!normalized) {
      return null;
    }

    const chunks = normalized.match(/.{1,64}/g) ?? [];
    return [
      "-----BEGIN CERTIFICATE-----",
      ...chunks,
      "-----END CERTIFICATE-----",
    ].join("\n");
  }

  private async runOnboardingComplianceCheck(input: {
    organizationId: string;
    onboarding: {
      id: string;
      environment: string;
      commonName: string | null;
      organizationName: string | null;
      vatNumber: string | null;
      countryCode: string | null;
      deviceSerial: string;
    };
    privateKeyPem: string;
    certificatePem: string | null;
    credentials: {
      csid: string;
      secret: string;
    };
  }): Promise<ComplianceCheckResult> {
    if (!input.certificatePem) {
      throw new BadRequestException(
        "Certificate material is required for onboarding compliance-check.",
      );
    }

    const probeUuid = generateComplianceUuid();
    const probeIssueDate = new Date().toISOString();
    const probeInvoiceNumber = `ONBOARDING-CHECK-${input.onboarding.deviceSerial.slice(-8)}`;
    const provisionalQr = buildQrPayload({
      sellerName:
        input.onboarding.organizationName ??
        input.onboarding.commonName ??
        "Onboarding Device",
      taxNumber: input.onboarding.vatNumber ?? "",
      issuedAtIso: probeIssueDate,
      total: "115.00",
      taxTotal: "15.00",
    });
    const unsignedProbeXml = buildInvoiceXml({
      uuid: probeUuid,
      invoiceNumber: probeInvoiceNumber,
      invoiceKind: "SIMPLIFIED",
      submissionFlow: "REPORTING",
      issueDateIso: probeIssueDate,
      invoiceCounter: 1,
      previousHash: firstPreviousInvoiceHash(),
      qrPayload: provisionalQr,
      currencyCode: "SAR",
      seller: {
        registrationName:
          input.onboarding.organizationName ??
          input.onboarding.commonName ??
          "Onboarding Device",
        taxNumber: input.onboarding.vatNumber,
        registrationNumber: input.onboarding.deviceSerial,
        address: {
          countryCode: input.onboarding.countryCode ?? "SA",
        },
      },
      buyer: null,
      subtotal: "100.00",
      taxTotal: "15.00",
      total: "115.00",
      lines: [
        {
          description: "Onboarding compliance probe",
          quantity: "1.00",
          unitPrice: "100.00",
          lineExtensionAmount: "100.00",
          taxAmount: "15.00",
          taxRatePercent: "15.00",
          taxRateName: "VAT 15%",
        },
      ],
    });
    const signing = await this.complianceCryptoService.signPhase2Invoice({
      xmlContent: unsignedProbeXml,
      privateKeyPem: input.privateKeyPem,
      certificatePem: input.certificatePem,
    });
    const probeQr = buildQrPayload({
      sellerName:
        input.onboarding.organizationName ??
        input.onboarding.commonName ??
        "Onboarding Device",
      taxNumber: input.onboarding.vatNumber ?? "",
      issuedAtIso: probeIssueDate,
      total: "115.00",
      taxTotal: "15.00",
      invoiceHash: signing.invoiceHash,
      xmlSignature: signing.xmlSignature,
      publicKey: signing.publicKey,
      technicalStamp: signing.technicalStamp,
    });
    const probeXml = injectSignatureExtensionIntoInvoiceXml(
      buildInvoiceXml({
        uuid: probeUuid,
        invoiceNumber: probeInvoiceNumber,
        invoiceKind: "SIMPLIFIED",
        submissionFlow: "REPORTING",
        issueDateIso: probeIssueDate,
        invoiceCounter: 1,
        previousHash: firstPreviousInvoiceHash(),
        qrPayload: probeQr,
        currencyCode: "SAR",
        seller: {
          registrationName:
            input.onboarding.organizationName ??
            input.onboarding.commonName ??
            "Onboarding Device",
          taxNumber: input.onboarding.vatNumber,
          registrationNumber: input.onboarding.deviceSerial,
          address: {
            countryCode: input.onboarding.countryCode ?? "SA",
          },
        },
        buyer: null,
        subtotal: "100.00",
        taxTotal: "15.00",
        total: "115.00",
        lines: [
          {
            description: "Onboarding compliance probe",
            quantity: "1.00",
            unitPrice: "100.00",
            lineExtensionAmount: "100.00",
            taxAmount: "15.00",
            taxRatePercent: "15.00",
            taxRateName: "VAT 15%",
          },
        ],
      }),
      signing.signatureExtensionXml,
    );

    return this.complianceOnboardingClient.runComplianceCheck({
      environment: input.onboarding.environment,
      credentials: input.credentials,
      invoiceHash: signing.invoiceHash,
      uuid: probeUuid,
      xmlContent: probeXml,
    });
  }

  async reportInvoice(
    organizationId: string,
    userId: string,
    invoiceId: string,
  ): Promise<ComplianceDocumentRecord> {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        contact: {
          include: {
            addresses: true,
          },
        },
        lines: {
          orderBy: {
            sortOrder: "asc",
          },
        },
        payments: {
          orderBy: {
            paymentDate: "asc",
          },
          select: {
            bankAccountId: true,
          },
        },
        complianceDocument: {
          include: {
            onboarding: true,
            submission: {
              include: {
                attempts: {
                  orderBy: { startedAt: "desc" },
                },
              },
            },
            events: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException("Invoice not found.");
    }

    if (invoice.status === "DRAFT" || invoice.status === "VOID") {
      throw new BadRequestException(
        "Only issued invoices can be submitted to ZATCA.",
      );
    }

    if (
      invoice.complianceDocument &&
      isTerminalSubmissionStatus(invoice.complianceDocument.status)
    ) {
      return this.getInvoiceComplianceDocument(organizationId, invoiceId);
    }

    if (
      invoice.complianceDocument?.submission &&
      ["QUEUED", "PROCESSING", "RETRY_SCHEDULED"].includes(
        invoice.complianceDocument.submission.status,
      )
    ) {
      return this.getInvoiceComplianceDocument(organizationId, invoiceId);
    }

    const [organizationTaxDetail, previousDocument, integrationSetting] =
      await Promise.all([
        this.prisma.organizationTaxDetail.findUnique({
          where: { organizationId },
        }),
        this.prisma.complianceDocument.findFirst({
          where: {
            organizationId,
            salesInvoiceId: { not: invoiceId },
            status: {
              in: [
                "CLEARED",
                "CLEARED_WITH_WARNINGS",
                "REPORTED",
                "REPORTED_WITH_WARNINGS",
              ],
            },
          },
          orderBy: [{ invoiceCounter: "desc" }, { updatedAt: "desc" }],
        }),
        this.prisma.organizationSetting.findUnique({
          where: {
            organizationId_key: {
              organizationId,
              key: eInvoiceIntegrationKey,
            },
          },
        }),
      ]);
    const integrationConfig = this.integrationConfig(integrationSetting?.value);
    const activeOnboarding = await this.findActiveOnboardingForEnvironment(
      organizationId,
      integrationConfig.environment,
    );

    if (!organizationTaxDetail) {
      throw new NotFoundException("Organisation tax details are not configured.");
    }

    if (!activeOnboarding) {
      throw new BadRequestException(
        `ZATCA onboarding is not active for ${integrationConfig.environment} environment. Complete device setup before submitting invoices.`,
      );
    }

    const submissionFlow = complianceFlowForInvoiceKind(
      invoice.complianceInvoiceKind,
    );
    const invoiceCounter =
      invoice.complianceDocument?.invoiceCounter && invoice.complianceDocument.invoiceCounter > 0
        ? invoice.complianceDocument.invoiceCounter
        : nextInvoiceCounter(previousDocument?.invoiceCounter);
    const uuid =
      invoice.complianceDocument?.uuid ?? generateComplianceUuid();
    const previousHash = previousDocument?.currentHash ?? firstPreviousInvoiceHash();
    const mappedPaymentMeansCode =
      invoice.payments
        .map((payment) =>
          payment.bankAccountId
            ? integrationConfig.mappings?.[payment.bankAccountId] ?? null
            : null,
        )
        .find((value): value is string => Boolean(value)) ?? null;
    const buyerAddress =
      invoice.contact.addresses.find((address) => address.type === "BILLING") ??
      invoice.contact.addresses.find((address) => address.type === "PRIMARY") ??
      invoice.contact.addresses.find((address) => address.type === "DELIVERY") ??
      null;
    if (invoice.lines.length === 0) {
      throw new BadRequestException(
        "Invoice must include at least one line before ZATCA XML generation.",
      );
    }
    const certificatePem =
      activeOnboarding.certificatePem ??
      this.certificatePemFromBase64(activeOnboarding.certificateBase64);
    if (!activeOnboarding.privateKeyPem || !certificatePem) {
      throw new BadRequestException(
        "Active onboarding does not include signing key and certificate material.",
      );
    }
    const privateKeyPem = await this.readOnboardingSecret({
      onboardingId: activeOnboarding.id,
      field: "privateKeyPem",
      value: activeOnboarding.privateKeyPem,
      errorMessage:
        "Active onboarding private key cannot be decrypted. Verify encryption key configuration.",
    });
    if (!privateKeyPem) {
      throw new BadRequestException(
        "Active onboarding does not include signing key and certificate material.",
      );
    }

    const provisionalQrPayload = buildQrPayload({
      sellerName: organizationTaxDetail.legalName,
      taxNumber: organizationTaxDetail.taxNumber,
      issuedAtIso: invoice.issueDate.toISOString(),
      total: invoice.total.toString(),
      taxTotal: invoice.taxTotal.toString(),
    });

    const unsignedInvoiceXml = buildInvoiceXml({
      uuid,
      invoiceNumber: invoice.invoiceNumber,
      invoiceKind: invoice.complianceInvoiceKind,
      submissionFlow,
      issueDateIso: invoice.issueDate.toISOString(),
      invoiceCounter,
      previousHash,
      qrPayload: provisionalQrPayload,
      currencyCode: invoice.currencyCode,
      seller: {
        registrationName: organizationTaxDetail.legalName,
        taxNumber: organizationTaxDetail.taxNumber,
        registrationNumber: organizationTaxDetail.registrationNumber,
        address: {
          streetName: organizationTaxDetail.addressLine1,
          additionalStreetName: organizationTaxDetail.addressLine2,
          cityName: organizationTaxDetail.city,
          postalZone: organizationTaxDetail.postalCode,
          countryCode: organizationTaxDetail.countryCode,
        },
      },
      buyer: {
        registrationName:
          invoice.contact.companyName?.trim() || invoice.contact.displayName,
        taxNumber: invoice.contact.taxNumber,
        address: buyerAddress
          ? {
              streetName: buyerAddress.line1,
              additionalStreetName: buyerAddress.line2,
              cityName: buyerAddress.city,
              postalZone: buyerAddress.postalCode,
              countryCode: buyerAddress.countryCode,
            }
          : null,
      },
      deliveryDateIso: invoice.issueDate.toISOString(),
      paymentMeansCode: mappedPaymentMeansCode,
      subtotal: invoice.subtotal.toString(),
      total: invoice.total.toString(),
      taxTotal: invoice.taxTotal.toString(),
      note: invoice.notes,
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        lineExtensionAmount: line.lineSubtotal.toString(),
        taxAmount: line.lineTax.toString(),
        taxRatePercent: line.taxRatePercent.toString(),
        taxRateName: line.taxRateName,
      })),
    });
    const signing = await this.complianceCryptoService.signPhase2Invoice({
      xmlContent: unsignedInvoiceXml,
      privateKeyPem,
      certificatePem,
    });
    const qrPayload = buildQrPayload({
      sellerName: organizationTaxDetail.legalName,
      taxNumber: organizationTaxDetail.taxNumber,
      issuedAtIso: invoice.issueDate.toISOString(),
      total: invoice.total.toString(),
      taxTotal: invoice.taxTotal.toString(),
      invoiceHash: signing.invoiceHash,
      xmlSignature: signing.xmlSignature,
      publicKey: signing.publicKey,
      technicalStamp:
        invoice.complianceInvoiceKind === "SIMPLIFIED"
          ? signing.technicalStamp
          : null,
    });
    const unsignedInvoiceXmlWithQr = buildInvoiceXml({
      uuid,
      invoiceNumber: invoice.invoiceNumber,
      invoiceKind: invoice.complianceInvoiceKind,
      submissionFlow,
      issueDateIso: invoice.issueDate.toISOString(),
      invoiceCounter,
      previousHash,
      qrPayload,
      currencyCode: invoice.currencyCode,
      seller: {
        registrationName: organizationTaxDetail.legalName,
        taxNumber: organizationTaxDetail.taxNumber,
        registrationNumber: organizationTaxDetail.registrationNumber,
        address: {
          streetName: organizationTaxDetail.addressLine1,
          additionalStreetName: organizationTaxDetail.addressLine2,
          cityName: organizationTaxDetail.city,
          postalZone: organizationTaxDetail.postalCode,
          countryCode: organizationTaxDetail.countryCode,
        },
      },
      buyer: {
        registrationName:
          invoice.contact.companyName?.trim() || invoice.contact.displayName,
        taxNumber: invoice.contact.taxNumber,
        address: buyerAddress
          ? {
              streetName: buyerAddress.line1,
              additionalStreetName: buyerAddress.line2,
              cityName: buyerAddress.city,
              postalZone: buyerAddress.postalCode,
              countryCode: buyerAddress.countryCode,
            }
          : null,
      },
      deliveryDateIso: invoice.issueDate.toISOString(),
      paymentMeansCode: mappedPaymentMeansCode,
      subtotal: invoice.subtotal.toString(),
      total: invoice.total.toString(),
      taxTotal: invoice.taxTotal.toString(),
      note: invoice.notes,
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        lineExtensionAmount: line.lineSubtotal.toString(),
        taxAmount: line.lineTax.toString(),
        taxRatePercent: line.taxRatePercent.toString(),
        taxRateName: line.taxRateName,
      })),
    });
    const xmlContent = injectSignatureExtensionIntoInvoiceXml(
      unsignedInvoiceXmlWithQr,
      signing.signatureExtensionXml,
    );
    const localValidation =
      await this.complianceLocalValidationService.validateInvoiceXml({
        invoiceNumber: invoice.invoiceNumber,
        xmlContent,
      });
    const validationWarnings = localValidation.warnings.map((entry) => entry.message);
    const validationErrors = localValidation.errors.map((entry) => entry.message);
    const validationMetadata = {
      commands: localValidation.commands.map((command) => ({
        command: command.command,
        status: command.status,
        exitCode: command.exitCode,
        warnings: command.issues
          .filter((issue) => issue.severity === "warning")
          .map((issue) => issue.message),
        errors: command.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message),
      })),
    } as const;
    const hashMetadata = {
      algorithm: "SHA-256",
      previousHash,
      currentHash: signing.invoiceHash,
      invoiceCounter,
      uuid,
    } as const;
    const qrMetadata = {
      payloadBase64Length: qrPayload.length,
      includesTechnicalStamp: invoice.complianceInvoiceKind === "SIMPLIFIED",
      generatedAt: new Date().toISOString(),
    } as const;
    const signatureMetadata = {
      signingTime: signing.signingTimeIso,
      signedPropertiesHash: signing.signedPropertiesHash,
      certificateDigest: signing.certificateDigest,
      xmlSignatureLength: signing.xmlSignature.length,
      publicKeyLength: signing.publicKey.length,
      technicalStampLength: signing.technicalStamp?.length ?? 0,
    } as const;
    const localValidationSummary = {
      status: localValidation.status,
      warnings: validationWarnings,
      errors: validationErrors,
    } as const;
    if (localValidation.status === "FAILED") {
      const validationFailureMessage = redactSensitiveText(
        `Local ZATCA SDK validation failed before submission. ${localValidationSummary.errors
          .map((entry) => entry)
          .join(" | ")}`,
      );
      const failureDocument = await this.prisma.complianceDocument.upsert({
        where: { salesInvoiceId: invoiceId },
        update: {
          onboardingId: activeOnboarding.id,
          invoiceKind: invoice.complianceInvoiceKind,
          submissionFlow,
          invoiceCounter,
          uuid,
          qrPayload,
          previousHash,
          currentHash: signing.invoiceHash,
          xmlContent,
          status: "READY",
          lastError: validationFailureMessage,
          failureCategory: "VALIDATION",
          externalSubmissionId: null,
          validationStatus: localValidationSummary.status,
          validationWarnings: validationWarnings as unknown as Prisma.InputJsonValue,
          validationErrors: validationErrors as unknown as Prisma.InputJsonValue,
          validationMetadata: validationMetadata as unknown as Prisma.InputJsonValue,
          validationRanAt: new Date(),
          hashMetadata: hashMetadata as unknown as Prisma.InputJsonValue,
          qrMetadata: qrMetadata as unknown as Prisma.InputJsonValue,
          signatureMetadata: signatureMetadata as unknown as Prisma.InputJsonValue,
        },
        create: {
          organizationId,
          salesInvoiceId: invoiceId,
          onboardingId: activeOnboarding.id,
          invoiceKind: invoice.complianceInvoiceKind,
          submissionFlow,
          invoiceCounter,
          uuid,
          qrPayload,
          previousHash,
          currentHash: signing.invoiceHash,
          xmlContent,
          status: "READY",
          lastError: validationFailureMessage,
          failureCategory: "VALIDATION",
          validationStatus: localValidationSummary.status,
          validationWarnings: validationWarnings as unknown as Prisma.InputJsonValue,
          validationErrors: validationErrors as unknown as Prisma.InputJsonValue,
          validationMetadata: validationMetadata as unknown as Prisma.InputJsonValue,
          validationRanAt: new Date(),
          hashMetadata: hashMetadata as unknown as Prisma.InputJsonValue,
          qrMetadata: qrMetadata as unknown as Prisma.InputJsonValue,
          signatureMetadata: signatureMetadata as unknown as Prisma.InputJsonValue,
        },
      });
      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          salesInvoiceId: invoiceId,
          complianceDocumentId: failureDocument.id,
          complianceOnboardingId: activeOnboarding.id,
          actorUserId: userId,
          action: "compliance.validation.failed",
          status: "FAILED",
          message: "Local ZATCA SDK validation failed before submission queueing.",
          metadata: {
            ...localValidationSummary,
            ...validationMetadata,
          } as Prisma.InputJsonValue,
        },
      });
      throw new BadRequestException(validationFailureMessage);
    }

    const now = new Date();
    let queuedSubmissionId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const complianceDocument = await tx.complianceDocument.upsert({
        where: { salesInvoiceId: invoiceId },
        update: {
          onboardingId: activeOnboarding.id,
          invoiceKind: invoice.complianceInvoiceKind,
          submissionFlow,
          invoiceCounter,
          uuid,
          qrPayload,
          previousHash,
          currentHash: signing.invoiceHash,
          xmlContent,
          status: "QUEUED",
          lastSubmissionStatus: "QUEUED",
          lastSubmittedAt: now,
          lastError: null,
          failureCategory: null,
          externalSubmissionId: null,
          validationStatus: localValidationSummary.status,
          validationWarnings: validationWarnings as unknown as Prisma.InputJsonValue,
          validationErrors: validationErrors as unknown as Prisma.InputJsonValue,
          validationMetadata: validationMetadata as unknown as Prisma.InputJsonValue,
          validationRanAt: now,
          hashMetadata: hashMetadata as unknown as Prisma.InputJsonValue,
          qrMetadata: qrMetadata as unknown as Prisma.InputJsonValue,
          signatureMetadata: signatureMetadata as unknown as Prisma.InputJsonValue,
        },
        create: {
          organizationId,
          salesInvoiceId: invoiceId,
          onboardingId: activeOnboarding.id,
          invoiceKind: invoice.complianceInvoiceKind,
          submissionFlow,
          invoiceCounter,
          uuid,
          qrPayload,
          previousHash,
          currentHash: signing.invoiceHash,
          xmlContent,
          status: "QUEUED",
          lastSubmissionStatus: "QUEUED",
          lastSubmittedAt: now,
          validationStatus: localValidationSummary.status,
          validationWarnings: validationWarnings as unknown as Prisma.InputJsonValue,
          validationErrors: validationErrors as unknown as Prisma.InputJsonValue,
          validationMetadata: validationMetadata as unknown as Prisma.InputJsonValue,
          validationRanAt: now,
          hashMetadata: hashMetadata as unknown as Prisma.InputJsonValue,
          qrMetadata: qrMetadata as unknown as Prisma.InputJsonValue,
          signatureMetadata: signatureMetadata as unknown as Prisma.InputJsonValue,
        },
      });
      const submission = await tx.zatcaSubmission.upsert({
        where: { complianceDocumentId: complianceDocument.id },
        update: {
          flow: submissionFlow,
          status: "QUEUED",
          retryable: false,
          maxAttempts: maxComplianceAttempts,
          availableAt: now,
          lockedAt: null,
          nextRetryAt: null,
          errorMessage: null,
          failureCategory: null,
          externalSubmissionId: null,
          requestPayload: {
            invoiceNumber: invoice.invoiceNumber,
            invoiceCounter,
            invoiceHash: signing.invoiceHash,
            localValidation: localValidationSummary,
            signature: {
              signingTime: signing.signingTimeIso,
              signedPropertiesHash: signing.signedPropertiesHash,
              certificateDigest: signing.certificateDigest,
            },
          } as Prisma.InputJsonValue,
        },
        create: {
          organizationId,
          complianceDocumentId: complianceDocument.id,
          requestedByUserId: userId,
          flow: submissionFlow,
          status: "QUEUED",
          retryable: false,
          maxAttempts: maxComplianceAttempts,
          availableAt: now,
          requestPayload: {
            invoiceNumber: invoice.invoiceNumber,
            invoiceCounter,
            invoiceHash: signing.invoiceHash,
            localValidation: localValidationSummary,
            signature: {
              signingTime: signing.signingTimeIso,
              signedPropertiesHash: signing.signedPropertiesHash,
              certificateDigest: signing.certificateDigest,
            },
          } as Prisma.InputJsonValue,
        },
      });
      queuedSubmissionId = submission.id;

      await tx.complianceEvent.create({
        data: {
          organizationId,
          salesInvoiceId: invoiceId,
          complianceDocumentId: complianceDocument.id,
          complianceOnboardingId: activeOnboarding.id,
          zatcaSubmissionId: submission.id,
          actorUserId: userId,
          action: "compliance.validation.passed",
          status: localValidationSummary.status,
          message:
            localValidationSummary.status === "SKIPPED"
              ? "Local SDK validation skipped in best-effort mode."
              : "Local ZATCA SDK validation passed before queueing.",
          metadata: localValidationSummary as Prisma.InputJsonValue,
        },
      });

      await tx.complianceEvent.create({
        data: {
          organizationId,
          salesInvoiceId: invoiceId,
          complianceDocumentId: complianceDocument.id,
          complianceOnboardingId: activeOnboarding.id,
          zatcaSubmissionId: submission.id,
          actorUserId: userId,
          action: "compliance.invoice.queued",
          status: "QUEUED",
          message:
            submissionFlow === "CLEARANCE"
              ? "Invoice queued for ZATCA clearance."
              : "Invoice queued for ZATCA reporting.",
        },
      });

      await tx.invoiceStatusEvent.create({
        data: {
          salesInvoiceId: invoiceId,
          actorUserId: userId,
          action: "sales.invoice.compliance_queued",
          fromStatus: invoice.status,
          toStatus: invoice.status,
          message:
            submissionFlow === "CLEARANCE"
              ? "Invoice queued for ZATCA clearance."
              : "Invoice queued for ZATCA reporting.",
        },
      });

      await tx.reportedDocument.deleteMany({
        where: {
          salesInvoiceId: invoiceId,
          status: {
            in: ["FAILED", "REJECTED", "RETRY_SCHEDULED"],
          },
        },
      });
    });
    if (queuedSubmissionId) {
      await this.complianceQueueService.enqueueSubmission(queuedSubmissionId);
    }

    return this.getInvoiceComplianceDocument(organizationId, invoiceId);
  }

  async retryInvoiceSubmission(
    organizationId: string,
    userId: string,
    invoiceId: string,
  ) {
    const document = await this.prisma.complianceDocument.findFirst({
      where: {
        salesInvoiceId: invoiceId,
        organizationId,
      },
      include: {
        submission: true,
        salesInvoice: true,
        onboarding: {
          select: {
            environment: true,
          },
        },
      },
    });

    if (!document || !document.submission) {
      throw new NotFoundException("Compliance submission not found.");
    }

    if (!["FAILED", "REJECTED"].includes(document.status)) {
      return this.getInvoiceComplianceDocument(organizationId, invoiceId);
    }

    const targetEnvironment = await this.resolveTargetEnvironment({
      organizationId,
      preferredEnvironment: document.onboarding?.environment ?? null,
    });
    const onboarding = await this.findActiveOnboardingForEnvironment(
      organizationId,
      targetEnvironment,
    );
    if (!onboarding) {
      throw new BadRequestException(
        `ZATCA onboarding is not active for ${targetEnvironment} environment. Complete device setup before retrying.`,
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.complianceDocument.update({
        where: { id: document.id },
        data: {
          onboardingId: onboarding.id,
          status: "QUEUED",
          lastSubmissionStatus: "QUEUED",
          lastSubmittedAt: now,
          lastError: null,
          failureCategory: null,
        },
      });

      await tx.zatcaSubmission.update({
        where: { id: document.submission!.id },
        data: {
          status: "QUEUED",
          retryable: false,
          availableAt: now,
          lockedAt: null,
          nextRetryAt: null,
          errorMessage: null,
          failureCategory: null,
          externalSubmissionId: null,
        },
      });

      await tx.complianceEvent.create({
        data: {
          organizationId,
          salesInvoiceId: document.salesInvoiceId,
          complianceDocumentId: document.id,
          complianceOnboardingId: onboarding.id,
          zatcaSubmissionId: document.submission!.id,
          actorUserId: userId,
          action: "compliance.submission.retry_requested",
          status: "QUEUED",
          message: "Operator requested an immediate retry.",
        },
      });

      await tx.invoiceStatusEvent.create({
        data: {
          salesInvoiceId: document.salesInvoiceId,
          actorUserId: userId,
          action: "sales.invoice.compliance_retry_requested",
          fromStatus: document.salesInvoice.status,
          toStatus: document.salesInvoice.status,
          message: "Compliance retry requested.",
        },
      });
    });

    await this.complianceQueueService.enqueueSubmission(document.submission.id);
    return this.getInvoiceComplianceDocument(organizationId, invoiceId);
  }

  async getInvoiceXml(organizationId: string, invoiceId: string) {
    const document = await this.prisma.complianceDocument.findFirst({
      where: { organizationId, salesInvoiceId: invoiceId },
      include: { salesInvoice: true },
    });

    if (!document || !document.xmlContent) {
      throw new NotFoundException("No compliance XML is available for this invoice.");
    }

    return {
      fileName: `${document.salesInvoice.invoiceNumber.toLowerCase()}.xml`,
      xmlContent: document.xmlContent,
    };
  }

  async getInvoiceComplianceDocument(
    organizationId: string,
    invoiceId: string,
  ): Promise<ComplianceDocumentRecord> {
    const document = await this.prisma.complianceDocument.findFirst({
      where: { organizationId, salesInvoiceId: invoiceId },
      include: complianceDocumentWithRelationsInclude,
    });

    if (!document) {
      throw new NotFoundException("Compliance document not found.");
    }

    return this.complianceDocumentRecord(document);
  }

  private complianceDocumentRecord(
    document: ComplianceDocumentWithRelations,
  ): ComplianceDocumentRecord {
    const jsonStringArray = (value: Prisma.JsonValue | null | undefined) =>
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];
    const jsonObject = (
      value: Prisma.JsonValue | null | undefined,
    ): Record<string, unknown> | null =>
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

    const localValidationFromDocument =
      document.validationStatus !== null
        ? {
            status: document.validationStatus,
            warnings: jsonStringArray(document.validationWarnings),
            errors: jsonStringArray(document.validationErrors),
          }
        : null;
    const localValidationFromSubmission =
      document.submission?.requestPayload &&
      typeof document.submission.requestPayload === "object" &&
      !Array.isArray(document.submission.requestPayload) &&
      "localValidation" in document.submission.requestPayload
        ? ((document.submission.requestPayload as {
            localValidation?: {
              status?: unknown;
              warnings?: unknown;
              errors?: unknown;
            };
          }).localValidation ?? null)
        : null;
    const localValidation =
      localValidationFromDocument ?? localValidationFromSubmission;

    return {
      id: document.id,
      salesInvoiceId: document.salesInvoiceId,
      invoiceKind: document.invoiceKind,
      submissionFlow: document.submissionFlow,
      invoiceCounter: document.invoiceCounter,
      uuid: document.uuid,
      qrPayload: document.qrPayload,
      previousHash: document.previousHash,
      currentHash: document.currentHash,
      xmlAvailable: Boolean(document.xmlContent),
      status: document.status,
      lastSubmissionStatus: document.lastSubmissionStatus,
      lastSubmittedAt: document.lastSubmittedAt?.toISOString() ?? null,
      lastError: document.lastError,
      failureCategory: document.failureCategory,
      externalSubmissionId: document.externalSubmissionId,
      clearedAt: document.clearedAt?.toISOString() ?? null,
      reportedAt: document.reportedAt?.toISOString() ?? null,
      localValidation: localValidation
        ? {
            status:
              localValidation.status === "FAILED"
                ? "FAILED"
                : localValidation.status === "SKIPPED"
                  ? "SKIPPED"
                  : "PASSED",
            warnings: Array.isArray(localValidation.warnings)
              ? localValidation.warnings.filter(
                  (warning): warning is string => typeof warning === "string",
                )
              : [],
            errors: Array.isArray(localValidation.errors)
              ? localValidation.errors.filter(
                  (error): error is string => typeof error === "string",
                )
              : [],
          }
        : null,
      localValidationMetadata: jsonObject(document.validationMetadata),
      hashMetadata: jsonObject(document.hashMetadata),
      qrMetadata: jsonObject(document.qrMetadata),
      signatureMetadata: jsonObject(document.signatureMetadata),
      retryAllowed: Boolean(
        document.submission &&
          document.submission.attemptCount < document.submission.maxAttempts &&
          ["FAILED", "REJECTED"].includes(document.status),
      ),
      canShareWithCustomer: canShareInvoiceWithCustomer({
        invoiceKind: document.invoiceKind,
        complianceStatus: document.status,
        invoiceStatus: document.salesInvoice.status,
      }),
      submission: document.submission ? submissionRecord(document.submission) : null,
      attempts: document.submission
        ? document.submission.attempts.map(attemptRecord)
        : [],
      timeline: document.events.map(timelineRecord),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  private deadLetterRecord(
    submission: {
      id: string;
      complianceDocumentId: string;
      flow: "CLEARANCE" | "REPORTING";
      status:
        | "QUEUED"
        | "PROCESSING"
        | "ACCEPTED"
        | "ACCEPTED_WITH_WARNINGS"
        | "RETRY_SCHEDULED"
        | "REJECTED"
        | "FAILED";
      failureCategory:
        | "CONFIGURATION"
        | "AUTHENTICATION"
        | "CONNECTIVITY"
        | "VALIDATION"
        | "ZATCA_REJECTION"
        | "TERMINAL"
        | "UNKNOWN"
        | null;
      errorMessage: string | null;
      responsePayload: Prisma.JsonValue | null;
      externalSubmissionId: string | null;
      attemptCount: number;
      maxAttempts: number;
      updatedAt: Date;
      finishedAt: Date | null;
      lastAttemptAt: Date | null;
      events: {
        action: string;
        createdAt: Date;
        metadata: Prisma.JsonValue | null;
        message: string | null;
      }[];
      complianceDocument: {
        salesInvoiceId: string;
        salesInvoice: {
          invoiceNumber: string;
        };
      };
    },
  ): ComplianceDeadLetterRecord | null {
    const lifecycle = deadLetterLifecycleSnapshot({
      events: submission.events,
      fallbackReason: submission.errorMessage,
      fallbackFailedAt:
        submission.finishedAt ?? submission.lastAttemptAt ?? submission.updatedAt,
      fallbackRetryable: submission.failureCategory === "CONNECTIVITY",
    });
    if (!lifecycle) {
      return null;
    }

    const transport = extractTransportMessages(submission.responsePayload);
    const failedAt =
      lifecycle.failedAt ??
      (submission.finishedAt ?? submission.lastAttemptAt ?? submission.updatedAt)
        .toISOString();
    const canRequeue = isDeadLetterRequeueEligible(
      submission.failureCategory,
      lifecycle.wasRetryable,
    );

    return {
      submissionId: submission.id,
      complianceDocumentId: submission.complianceDocumentId,
      salesInvoiceId: submission.complianceDocument.salesInvoiceId,
      invoiceNumber: submission.complianceDocument.salesInvoice.invoiceNumber,
      submissionFlow: submission.flow,
      submissionStatus: submission.status,
      state: lifecycle.state,
      failureCategory: submission.failureCategory,
      lastError: submission.errorMessage
        ? redactSensitiveText(submission.errorMessage)
        : null,
      reason: lifecycle.reason,
      failedAt,
      attemptCount: submission.attemptCount,
      maxAttempts: submission.maxAttempts,
      wasRetryable: lifecycle.wasRetryable,
      canRequeue,
      acknowledgedAt: lifecycle.acknowledgedAt,
      escalatedAt: lifecycle.escalatedAt,
      requeuedAt: lifecycle.requeuedAt,
      requestId: transport.requestId,
      externalSubmissionId: submission.externalSubmissionId,
      updatedAt: submission.updatedAt.toISOString(),
    };
  }

  private async deadLetterContextOrThrow(
    organizationId: string,
    submissionId: string,
  ) {
    const submission = await this.prisma.zatcaSubmission.findFirst({
      where: {
        id: submissionId,
        organizationId,
        events: {
          some: {
            action: "compliance.submission.dead_lettered",
          },
        },
      },
      include: {
        complianceDocument: {
          include: {
            salesInvoice: true,
            onboarding: {
              select: {
                environment: true,
              },
            },
          },
        },
        events: {
          where: {
            action: {
              in: [...deadLetterLifecycleActions],
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException("Dead-letter submission not found.");
    }

    const record = this.deadLetterRecord(submission);
    if (!record) {
      throw new NotFoundException("Dead-letter submission not found.");
    }

    return {
      submission,
      lifecycle: {
        state: record.state,
      },
      canRequeue: record.canRequeue,
    };
  }

  private async readOnboardingSecret(input: {
    onboardingId: string;
    field: "privateKeyPem" | "certificateSecret";
    value: string | null;
    errorMessage: string;
  }) {
    if (!input.value) {
      return null;
    }

    try {
      const decrypted = this.complianceEncryptionService.decrypt(input.value);
      const rotated =
        this.complianceEncryptionService.reencryptWithCurrentKey(input.value);
      if (rotated !== input.value) {
        await this.prisma.complianceOnboarding.update({
          where: { id: input.onboardingId },
          data: {
            [input.field]: rotated,
          } as Prisma.ComplianceOnboardingUpdateInput,
        });
      }
      return decrypted;
    } catch {
      throw new BadRequestException(input.errorMessage);
    }
  }

  private sanitizeOnboardingMetadata(
    value: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    return sanitizeSensitiveObject(value);
  }

  private mergeOnboardingMetadata(
    existing: Prisma.JsonValue | null,
    patch: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const base = this.metadataObject(existing);
    return {
      ...base,
      ...patch,
    } as Prisma.InputJsonValue;
  }

  private lifecycleMetadata(input: {
    existing: Prisma.JsonValue | null | undefined;
    patch: Record<string, unknown>;
    archiveCredential?: {
      snapshot: CredentialSnapshot;
      reason: string;
      archivedAt: string;
      replacedByOnboardingId?: string | null;
    };
  }): Prisma.InputJsonValue {
    const base = this.metadataObject(input.existing);
    const lifecycle = this.onboardingLifecycleObject(input.existing);
    const nextLifecycle = {
      ...lifecycle,
      ...input.patch,
    } as Record<string, unknown>;

    if (input.archiveCredential) {
      const existingArchive = Array.isArray(lifecycle.archivedCertificates)
        ? [...lifecycle.archivedCertificates]
        : [];
      existingArchive.push({
        ...input.archiveCredential.snapshot,
        reason: input.archiveCredential.reason,
        archivedAt: input.archiveCredential.archivedAt,
        replacedByOnboardingId: input.archiveCredential.replacedByOnboardingId ?? null,
      });
      nextLifecycle.archivedCertificates = existingArchive;
    }

    return {
      ...base,
      onboardingLifecycle: nextLifecycle,
    } as Prisma.InputJsonValue;
  }

  private metadataObject(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {} as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }

  private onboardingLifecycleObject(value: Prisma.JsonValue | null | undefined) {
    const base = this.metadataObject(value);
    const lifecycle = base.onboardingLifecycle;
    if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) {
      return {} as Record<string, unknown>;
    }
    return lifecycle as Record<string, unknown>;
  }

  private onboardingClientErrorMessage(error: unknown, fallback: string) {
    if (error instanceof ComplianceOnboardingClientError && error.message.trim()) {
      return redactSensitiveText(error.message);
    }
    if (error instanceof Error && error.message.trim()) {
      return redactSensitiveText(error.message);
    }
    return redactSensitiveText(fallback);
  }

  private credentialSnapshot(record: {
    csid: string | null;
    certificateId: string | null;
    secretFingerprint: string | null;
    certificateIssuedAt: Date | null;
    certificateExpiresAt: Date | null;
    revokedAt: Date | null;
  }): CredentialSnapshot {
    return {
      csid: record.csid,
      certificateId: record.certificateId,
      secretFingerprint: record.secretFingerprint,
      certificateIssuedAt: record.certificateIssuedAt?.toISOString() ?? null,
      certificateExpiresAt: record.certificateExpiresAt?.toISOString() ?? null,
      revokedAt: record.revokedAt?.toISOString() ?? null,
    };
  }

  private async findActiveOnboarding(organizationId: string) {
    const now = new Date();
    return this.prisma.complianceOnboarding.findFirst({
      where: {
        organizationId,
        status: "ACTIVE",
        certificateStatus: "ACTIVE",
        revokedAt: null,
        OR: [{ certificateExpiresAt: null }, { certificateExpiresAt: { gt: now } }],
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  private async findActiveOnboardingForEnvironment(
    organizationId: string,
    environment: ComplianceEnvironment,
  ) {
    const now = new Date();
    return this.prisma.complianceOnboarding.findFirst({
      where: {
        organizationId,
        environment: {
          in: this.environmentAliases(environment),
        },
        status: "ACTIVE",
        certificateStatus: "ACTIVE",
        revokedAt: null,
        OR: [{ certificateExpiresAt: null }, { certificateExpiresAt: { gt: now } }],
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  private async resolveTargetEnvironment(input: {
    organizationId: string;
    preferredEnvironment?: string | null;
  }): Promise<ComplianceEnvironment> {
    const normalized = this.normalizeEnvironment(input.preferredEnvironment);
    if (normalized) {
      return normalized;
    }
    return this.integrationEnvironment(input.organizationId);
  }

  private normalizeEnvironment(
    environment: string | null | undefined,
  ): ComplianceEnvironment | null {
    if (!environment) {
      return null;
    }

    const lowered = environment.trim().toLowerCase();
    if (!lowered) {
      return null;
    }

    if (lowered.includes("sandbox") || lowered.includes("simulation")) {
      return "Sandbox";
    }

    if (lowered.includes("production") || lowered.includes("core")) {
      return "Production";
    }

    return null;
  }

  private environmentAliases(environment: ComplianceEnvironment) {
    if (environment === "Sandbox") {
      return ["Sandbox", "sandbox", "Simulation", "simulation"];
    }
    return ["Production", "production", "Core", "core"];
  }
}
