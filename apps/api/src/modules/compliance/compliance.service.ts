import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ComplianceDocumentRecord,
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
  buildComplianceHashes,
  buildInvoiceXml,
  buildQrPayload,
  canShareInvoiceWithCustomer,
  complianceFlowForInvoiceKind,
  generateComplianceUuid,
  isTerminalSubmissionStatus,
  maxComplianceAttempts,
  nextInvoiceCounter,
} from "./compliance-core";
import { ComplianceCryptoService } from "./compliance-crypto.service";
import { ComplianceQueueService } from "./compliance-queue.service";

const eInvoiceIntegrationKey = "week10.einvoice.integration";
const paymentMeansOptions = [
  { code: "10", label: "Cash" },
  { code: "30", label: "Credit Transfer" },
  { code: "48", label: "Bank Card" },
  { code: "49", label: "Direct Debit" },
] as const;

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

type IntegrationConfig = {
  environment: "Production" | "Sandbox";
  integrationDate?: string | null;
  status?: "REGISTERED" | "NOT_REGISTERED";
  mappings?: Record<string, string | null>;
};

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
  externalSubmissionId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ComplianceSubmissionRecord {
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
    errorMessage: record.errorMessage,
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
  externalSubmissionId: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): ComplianceSubmissionAttemptRecord {
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
    errorMessage: record.errorMessage,
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
        privateKeyPem: generated.privateKeyPem,
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

    const updated = await this.prisma.complianceOnboarding.update({
      where: { id: onboarding.id },
      data: {
        otpCode,
        otpReceivedAt: new Date(),
        csrSubmittedAt: new Date(),
        status: "CSR_SUBMITTED",
        certificateStatus: "CSR_SUBMITTED",
        lastError: null,
      },
    });

    await this.prisma.complianceEvent.create({
      data: {
        organizationId,
        complianceOnboardingId: updated.id,
        action: "compliance.onboarding.otp_submitted",
        status: updated.status,
        message: "OTP captured for staged CSR submission.",
      },
    });

    return onboardingRecord(updated);
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
      await this.prisma.complianceOnboarding.update({
        where: { id: existing.id },
        data: {
          status: "REVOKED",
          certificateStatus: "REVOKED",
          revokedAt: new Date(),
          lastError: null,
        },
      });

      await this.prisma.complianceEvent.create({
        data: {
          organizationId,
          complianceOnboardingId: existing.id,
          action: "compliance.integration.removed",
          status: "REVOKED",
          message: "Device lifecycle marked as revoked.",
        },
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

  async reportInvoice(
    organizationId: string,
    userId: string,
    invoiceId: string,
  ): Promise<ComplianceDocumentRecord> {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: {
        contact: true,
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

    const [organizationTaxDetail, activeOnboarding, previousDocument] =
      await Promise.all([
        this.prisma.organizationTaxDetail.findUnique({
          where: { organizationId },
        }),
        this.findActiveOnboarding(organizationId),
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
      ]);

    if (!organizationTaxDetail) {
      throw new NotFoundException("Organisation tax details are not configured.");
    }

    if (!activeOnboarding) {
      throw new BadRequestException(
        "ZATCA onboarding is not active. Complete device setup before submitting invoices.",
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
    const hashes = buildComplianceHashes({
      previousHash: previousDocument?.currentHash ?? null,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total.toString(),
      taxTotal: invoice.taxTotal.toString(),
      issueDateIso: invoice.issueDate.toISOString(),
      uuid,
      invoiceCounter,
    });
    const xmlContent = buildInvoiceXml({
      uuid,
      invoiceNumber: invoice.invoiceNumber,
      invoiceKind: invoice.complianceInvoiceKind,
      submissionFlow,
      issueDateIso: invoice.issueDate.toISOString(),
      sellerName: organizationTaxDetail.legalName,
      taxNumber: organizationTaxDetail.taxNumber,
      customerName: invoice.contact.displayName,
      invoiceCounter,
      total: invoice.total.toString(),
      taxTotal: invoice.taxTotal.toString(),
      previousHash: hashes.previousHash,
    });
    const onboardingMetadata =
      (activeOnboarding.metadata as
        | {
            xmlSignature?: string | null;
            publicKey?: string | null;
            technicalStamp?: string | null;
          }
        | null) ?? null;
    const qrPayload = buildQrPayload({
      sellerName: organizationTaxDetail.legalName,
      taxNumber: organizationTaxDetail.taxNumber,
      issuedAtIso: invoice.issueDate.toISOString(),
      total: invoice.total.toString(),
      taxTotal: invoice.taxTotal.toString(),
      invoiceHash: hashes.currentHash,
      xmlSignature: onboardingMetadata?.xmlSignature ?? null,
      publicKey: onboardingMetadata?.publicKey ?? null,
      technicalStamp:
        invoice.complianceInvoiceKind === "SIMPLIFIED"
          ? onboardingMetadata?.technicalStamp ?? null
          : null,
    });

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
          previousHash: hashes.previousHash,
          currentHash: hashes.currentHash,
          xmlContent,
          status: "QUEUED",
          lastSubmissionStatus: "QUEUED",
          lastSubmittedAt: now,
          lastError: null,
          failureCategory: null,
          externalSubmissionId: null,
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
          previousHash: hashes.previousHash,
          currentHash: hashes.currentHash,
          xmlContent,
          status: "QUEUED",
          lastSubmissionStatus: "QUEUED",
          lastSubmittedAt: now,
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
      },
    });

    if (!document || !document.submission) {
      throw new NotFoundException("Compliance submission not found.");
    }

    if (!["FAILED", "REJECTED"].includes(document.status)) {
      return this.getInvoiceComplianceDocument(organizationId, invoiceId);
    }

    const onboarding = await this.findActiveOnboarding(organizationId);
    if (!onboarding) {
      throw new BadRequestException(
        "ZATCA onboarding is not active. Complete device setup before retrying.",
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
      include: {
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
      },
    });

    if (!document) {
      throw new NotFoundException("Compliance document not found.");
    }

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

  private async findActiveOnboarding(organizationId: string) {
    return this.prisma.complianceOnboarding.findFirst({
      where: {
        organizationId,
        status: "ACTIVE",
        certificateStatus: "ACTIVE",
      },
      orderBy: { updatedAt: "desc" },
    });
  }
}
