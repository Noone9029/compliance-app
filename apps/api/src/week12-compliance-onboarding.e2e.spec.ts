import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";
import { calculateRetryDelayMs } from "./modules/compliance/compliance-core";
import { ComplianceEncryptionService } from "./modules/compliance/encryption.service";
import { processComplianceSubmission } from "./modules/compliance/compliance-processor";
import {
  ComplianceTransportError,
  type ComplianceTransportRequest,
} from "./modules/compliance/compliance-transport";
import { prepareSubmissionForManualProcessing } from "./test/compliance-processing";

describe.sequential("Daftar staged compliance onboarding", () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: loadEnv().DATABASE_URL,
      },
    },
  });
  let app: INestApplication;
  const complianceEncryptionService = new ComplianceEncryptionService(loadEnv());

  async function signIn(email: string) {
    const response = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email, password: "Password123!" })
      .expect(201);

    const cookies = response.headers["set-cookie"];
    return Array.isArray(cookies) ? cookies : [cookies].filter(Boolean);
  }

  async function switchOrg(cookies: string[], orgSlug: string) {
    await request(app.getHttpServer())
      .post("/v1/organizations/switch")
      .set("Cookie", cookies)
      .send({ orgSlug })
      .expect(201);
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("keeps GET /v1/compliance/integration compatible with the existing summary contract", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");

    const integration = await request(app.getHttpServer())
      .get("/v1/compliance/integration")
      .set("Cookie", cookies)
      .expect(200);

    expect(integration.body.organizationName).toBeTypeOf("string");
    expect(["REGISTERED", "NOT_REGISTERED"]).toContain(integration.body.status);
    expect(Array.isArray(integration.body.timeline)).toBe(true);
    expect(Array.isArray(integration.body.mappings)).toBe(true);
    expect(Array.isArray(integration.body.availablePaymentMeans)).toBe(true);

    if (integration.body.onboarding) {
      expect("privateKeyPem" in integration.body.onboarding).toBe(false);
      expect("certificatePem" in integration.body.onboarding).toBe(false);
      expect("certificateBase64" in integration.body.onboarding).toBe(false);
      expect("certificateSecret" in integration.body.onboarding).toBe(false);
      expect("otpCode" in integration.body.onboarding).toBe(false);
    }
  });

  it("exposes compliance monitor documents without secret-bearing fields", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");

    const monitor = await request(app.getHttpServer())
      .get("/v1/compliance/documents")
      .set("Cookie", cookies)
      .expect(200);

    expect(Array.isArray(monitor.body)).toBe(true);

    if (monitor.body.length > 0) {
      const first = monitor.body[0] as {
        compliance?: Record<string, unknown>;
      };
      expect(first).toHaveProperty("salesInvoiceId");
      expect(first).toHaveProperty("invoiceNumber");
      expect(first).toHaveProperty("invoiceStatus");
      expect(first).toHaveProperty("compliance");

      const compliance = first.compliance ?? {};
      expect("xmlContent" in compliance).toBe(false);
      expect("requestPayload" in compliance).toBe(false);
      expect("responsePayload" in compliance).toBe(false);
    }
  });

  it("runs onboarding through compliance issuance, activation, renewal, and revocation", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");
    const suffix = Date.now().toString();

    const prepared = await request(app.getHttpServer())
      .post("/v1/compliance/onboarding/prepare")
      .set("Cookie", cookies)
      .send({
        deviceSerial: `egs-stage-${suffix}`,
        commonName: `Nomad Events Arabia Limited Stage ${suffix}`,
        organizationUnitName: "Riyadh Operations",
        organizationName: "Nomad Events Arabia Limited",
        vatNumber: "300123456700003",
        branchName: "Riyadh HQ",
        countryCode: "SA",
        locationAddress: "Olaya Street, Office 402, Riyadh",
        industry: "Events",
      })
      .expect(201);

    expect(prepared.body.status).toBe("DRAFT");
    expect(prepared.body.certificateStatus).toBe("NOT_REQUESTED");
    expect(prepared.body.hasCsr).toBe(false);
    expect("privateKeyPem" in prepared.body).toBe(false);
    expect("otpCode" in prepared.body).toBe(false);
    expect("certificateSecret" in prepared.body).toBe(false);

    const otpBeforeCsr = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/request-otp`)
      .set("Cookie", cookies)
      .expect(400);
    expect(String(otpBeforeCsr.body.message)).toMatch(/CSR must be generated/i);

    const generated = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/generate-csr`)
      .set("Cookie", cookies)
      .expect(201);
    expect(generated.body.status).toBe("CSR_GENERATED");
    expect(generated.body.certificateStatus).toBe("CSR_GENERATED");
    expect(generated.body.hasCsr).toBe(true);
    expect(generated.body.csrGeneratedAt).toBeTruthy();
    const storedAfterCsr = await prisma.complianceOnboarding.findUniqueOrThrow({
      where: { id: prepared.body.id },
      select: { privateKeyPem: true },
    });
    expect(storedAfterCsr.privateKeyPem).toBeTruthy();
    expect(storedAfterCsr.privateKeyPem).toMatch(/^enc:v1:/);
    expect(storedAfterCsr.privateKeyPem).not.toContain("BEGIN PRIVATE KEY");

    const pendingOtp = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/request-otp`)
      .set("Cookie", cookies)
      .expect(201);
    expect(pendingOtp.body.status).toBe("OTP_PENDING");
    expect(pendingOtp.body.certificateStatus).toBe("OTP_PENDING");

    const submittedOtp = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/submit-otp`)
      .set("Cookie", cookies)
      .send({ otpCode: "123456" })
      .expect(201);
    expect(submittedOtp.body.status).toBe("CERTIFICATE_ISSUED");
    expect(submittedOtp.body.certificateStatus).toBe("CERTIFICATE_ISSUED");
    expect(submittedOtp.body.otpReceivedAt).toBeTruthy();
    expect(submittedOtp.body.csrSubmittedAt).toBeTruthy();
    expect("otpCode" in submittedOtp.body).toBe(false);
    expect("certificateSecret" in submittedOtp.body).toBe(false);
    expect("certificatePem" in submittedOtp.body).toBe(false);
    const storedAfterOtp = await prisma.complianceOnboarding.findUniqueOrThrow({
      where: { id: prepared.body.id },
      select: { certificateSecret: true },
    });
    expect(storedAfterOtp.certificateSecret).toBeTruthy();
    expect(storedAfterOtp.certificateSecret).toMatch(/^enc:v1:/);

    const activated = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/activate`)
      .set("Cookie", cookies)
      .expect(201);
    expect(activated.body.status).toBe("ACTIVE");
    expect(activated.body.certificateStatus).toBe("ACTIVE");
    expect(activated.body.lastActivatedAt).toBeTruthy();

    const renewed = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/renew`)
      .set("Cookie", cookies)
      .send({ otpCode: "123456" })
      .expect(201);
    expect(renewed.body.status).toBe("ACTIVE");
    expect(renewed.body.certificateStatus).toBe("ACTIVE");
    expect(renewed.body.lastRenewedAt).toBeTruthy();
    expect("certificateSecret" in renewed.body).toBe(false);
    const storedAfterRenewal = await prisma.complianceOnboarding.findUniqueOrThrow({
      where: { id: prepared.body.id },
      select: { privateKeyPem: true, certificateSecret: true, metadata: true },
    });
    expect(storedAfterRenewal.privateKeyPem).toMatch(/^enc:v1:/);
    expect(storedAfterRenewal.certificateSecret).toMatch(/^enc:v1:/);
    const lifecycleMetadata =
      storedAfterRenewal.metadata &&
      typeof storedAfterRenewal.metadata === "object" &&
      !Array.isArray(storedAfterRenewal.metadata) &&
      "onboardingLifecycle" in storedAfterRenewal.metadata
        ? (storedAfterRenewal.metadata as { onboardingLifecycle?: unknown }).onboardingLifecycle
        : null;
    const archivedCertificates =
      lifecycleMetadata &&
      typeof lifecycleMetadata === "object" &&
      !Array.isArray(lifecycleMetadata) &&
      "archivedCertificates" in lifecycleMetadata &&
      Array.isArray(
        (lifecycleMetadata as { archivedCertificates?: unknown }).archivedCertificates,
      )
        ? ((lifecycleMetadata as { archivedCertificates: unknown[] }).archivedCertificates ?? [])
        : [];
    expect(archivedCertificates.length).toBeGreaterThan(0);
    expect(
      archivedCertificates.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry as { reason?: string }).reason === "RENEWAL_REPLACED",
      ),
    ).toBe(true);

    const current = await request(app.getHttpServer())
      .get("/v1/compliance/onboarding/current")
      .set("Cookie", cookies)
      .expect(200);
    expect(current.body.id).toBe(prepared.body.id);
    expect(current.body.status).toBe("ACTIVE");
    expect("certificateSecret" in current.body).toBe(false);

    const registeredIntegration = await request(app.getHttpServer())
      .get("/v1/compliance/integration")
      .set("Cookie", cookies)
      .expect(200);
    expect(registeredIntegration.body.status).toBe("REGISTERED");
    expect(registeredIntegration.body.onboarding.id).toBe(prepared.body.id);
    expect(registeredIntegration.body.onboarding.status).toBe("ACTIVE");

    const revoked = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/revoke`)
      .set("Cookie", cookies)
      .send({ reason: "Rotation test completion" })
      .expect(201);
    expect(revoked.body.status).toBe("REVOKED");
    expect(revoked.body.certificateStatus).toBe("REVOKED");
    expect(revoked.body.revokedAt).toBeTruthy();
    expect("certificateSecret" in revoked.body).toBe(false);

    const integrationAfterRevocation = await request(app.getHttpServer())
      .get("/v1/compliance/integration")
      .set("Cookie", cookies)
      .expect(200);
    expect(["REGISTERED", "NOT_REGISTERED"]).toContain(
      integrationAfterRevocation.body.status,
    );
    expect(integrationAfterRevocation.body.onboarding.status).toBe("REVOKED");

    const lifecycleActions = await prisma.complianceEvent.findMany({
      where: {
        complianceOnboardingId: prepared.body.id,
      },
      select: {
        action: true,
      },
    });
    const actionSet = new Set(lifecycleActions.map((event) => event.action));
    expect(actionSet.has("compliance.onboarding.csr_generated")).toBe(true);
    expect(actionSet.has("compliance.onboarding.otp_submitted")).toBe(true);
    expect(actionSet.has("compliance.onboarding.activated")).toBe(true);
    expect(actionSet.has("compliance.onboarding.renewed")).toBe(true);
    expect(actionSet.has("compliance.onboarding.revoked")).toBe(true);
  });

  it("enforces a single active onboarding device per environment", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");
    const suffix = Date.now().toString();

    const prepareAndIssue = async (serial: string, commonName: string) => {
      const prepared = await request(app.getHttpServer())
        .post("/v1/compliance/onboarding/prepare")
        .set("Cookie", cookies)
        .send({
          deviceSerial: serial,
          commonName,
          organizationUnitName: "Riyadh Operations",
          organizationName: "Nomad Events Arabia Limited",
          vatNumber: "300123456700003",
          branchName: "Riyadh HQ",
          countryCode: "SA",
          locationAddress: "Olaya Street, Office 402, Riyadh",
          industry: "Events",
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/compliance/onboarding/${prepared.body.id}/generate-csr`)
        .set("Cookie", cookies)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/compliance/onboarding/${prepared.body.id}/request-otp`)
        .set("Cookie", cookies)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/compliance/onboarding/${prepared.body.id}/submit-otp`)
        .set("Cookie", cookies)
        .send({ otpCode: "123456" })
        .expect(201);

      return prepared.body.id as string;
    };

    const firstId = await prepareAndIssue(
      `egs-active-first-${suffix}`,
      `Nomad First Active ${suffix}`,
    );
    await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${firstId}/activate`)
      .set("Cookie", cookies)
      .expect(201);

    const secondId = await prepareAndIssue(
      `egs-active-second-${suffix}`,
      `Nomad Second Active ${suffix}`,
    );
    await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${secondId}/activate`)
      .set("Cookie", cookies)
      .expect(201);

    const firstAfterSwitch = await request(app.getHttpServer())
      .get(`/v1/compliance/onboarding/${firstId}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(firstAfterSwitch.body.status).toBe("CERTIFICATE_ISSUED");
    expect(firstAfterSwitch.body.certificateStatus).toBe("CERTIFICATE_ISSUED");

    const secondAfterSwitch = await request(app.getHttpServer())
      .get(`/v1/compliance/onboarding/${secondId}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(secondAfterSwitch.body.status).toBe("ACTIVE");
    expect(secondAfterSwitch.body.certificateStatus).toBe("ACTIVE");

    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
      select: { id: true },
    });
    const activeRecords = await prisma.complianceOnboarding.findMany({
      where: {
        organizationId: eventsOrg.id,
        environment: secondAfterSwitch.body.environment,
        status: "ACTIVE",
        certificateStatus: "ACTIVE",
        revokedAt: null,
      },
      select: { id: true },
    });
    expect(activeRecords).toHaveLength(1);
    expect(activeRecords[0]?.id).toBe(secondId);

    const firstStored = await prisma.complianceOnboarding.findUniqueOrThrow({
      where: { id: firstId },
      select: { metadata: true },
    });
    const firstLifecycle =
      firstStored.metadata &&
      typeof firstStored.metadata === "object" &&
      !Array.isArray(firstStored.metadata) &&
      "onboardingLifecycle" in firstStored.metadata
        ? (firstStored.metadata as { onboardingLifecycle?: unknown }).onboardingLifecycle
        : null;
    const firstArchived =
      firstLifecycle &&
      typeof firstLifecycle === "object" &&
      !Array.isArray(firstLifecycle) &&
      "archivedCertificates" in firstLifecycle &&
      Array.isArray((firstLifecycle as { archivedCertificates?: unknown }).archivedCertificates)
        ? ((firstLifecycle as { archivedCertificates: unknown[] }).archivedCertificates ?? [])
        : [];
    expect(
      firstArchived.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry as { reason?: string }).reason === "DEVICE_SWITCH_DEACTIVATED",
      ),
    ).toBe(true);
  });

  it("rejects CSR generation when required onboarding identity fields are missing", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });

    const incomplete = await prisma.complianceOnboarding.create({
      data: {
        organizationId: eventsOrg.id,
        environment: "Sandbox",
        deviceName: "Incomplete onboarding",
        deviceSerial: `egs-missing-${Date.now()}`,
        commonName: null,
        organizationName: "Nomad Events Arabia Limited",
        vatNumber: "300123456700003",
        countryCode: "SA",
        status: "DRAFT",
        certificateStatus: "NOT_REQUESTED",
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${incomplete.id}/generate-csr`)
      .set("Cookie", cookies)
      .expect(400);
    expect(String(response.body.message)).toContain("commonName");
  });

  it("records validation events and uses onboarding-scoped credentials during processing", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true },
    });
    const activeOnboarding = await prisma.complianceOnboarding.findFirstOrThrow({
      where: {
        organizationId: eventsOrg.id,
        status: "ACTIVE",
        certificateStatus: "ACTIVE",
        revokedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    });
    const invoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: `INV-NE-CRED-${Date.now()}`,
        status: "ISSUED",
        complianceInvoiceKind: "SIMPLIFIED",
        issueDate: "2026-04-19T09:00:00.000Z",
        dueDate: "2026-04-29T09:00:00.000Z",
        currencyCode: "SAR",
        lines: [{ description: "Credential flow assertion", quantity: "1", unitPrice: "175.00" }],
      })
      .expect(201);

    const queued = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${invoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);
    expect(queued.body.status).toBe("QUEUED");

    const validationEvent = await prisma.complianceEvent.findFirst({
      where: {
        organizationId: eventsOrg.id,
        salesInvoiceId: invoice.body.id,
        action: "compliance.validation.passed",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(validationEvent).toBeTruthy();

    let capturedCredentials:
      | {
          clientId: string;
          clientSecret: string;
        }
      | null = null;
    await prepareSubmissionForManualProcessing(prisma, queued.body.submission.id);
    await processComplianceSubmission({
      prisma,
      submissionId: queued.body.submission.id,
      transport: {
        endpointFor: () => "test://capture",
        submit: async (input: ComplianceTransportRequest) => {
          capturedCredentials = input.credentials
            ? {
                clientId: input.credentials.clientId,
                clientSecret: input.credentials.clientSecret,
              }
            : null;

          return {
            status: "ACCEPTED_WITH_WARNINGS",
            responseCode: "REPORTED_WITH_WARNINGS",
            responseMessage: "Invoice accepted with warnings for credential propagation test.",
            requestId: "REQ-CRED-PROPAGATION",
            warnings: ["Sandbox warning"],
            errors: [],
            stampedXmlContent: null,
            responsePayload: {
              requestId: "REQ-CRED-PROPAGATION",
              warnings: ["Sandbox warning"],
              errors: [],
            },
            externalSubmissionId: "external-cred-propagation",
          };
        },
      },
    });

    const acceptanceEvent = await prisma.complianceEvent.findFirst({
      where: {
        organizationId: eventsOrg.id,
        zatcaSubmissionId: queued.body.submission.id,
        action: "compliance.invoice.accepted_with_warnings",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(acceptanceEvent).toBeTruthy();

    const refreshedOnboarding = await prisma.complianceOnboarding.findUniqueOrThrow({
      where: { id: activeOnboarding.id },
      select: {
        csid: true,
        certificateSecret: true,
      },
    });
    expect(refreshedOnboarding.certificateSecret).toBeTruthy();
    const decryptedCertificateSecret = complianceEncryptionService.decrypt(
      refreshedOnboarding.certificateSecret ?? "",
    );
    expect(capturedCredentials).toEqual({
      clientId: refreshedOnboarding.csid,
      clientSecret: decryptedCertificateSecret,
    });
    if (!capturedCredentials) {
      throw new Error("Expected onboarding-scoped credentials to be captured.");
    }
    const ensuredCredentials = capturedCredentials as {
      clientId: string;
      clientSecret: string;
    };
    expect(refreshedOnboarding.certificateSecret).not.toBe(
      ensuredCredentials.clientSecret,
    );
    expect(refreshedOnboarding.certificateSecret).toMatch(/^enc:v1:/);

    const detail = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${invoice.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(detail.body.compliance.submission.requestId).toBe("REQ-CRED-PROPAGATION");
    expect(detail.body.compliance.submission.warnings).toEqual(["Sandbox warning"]);
    expect(detail.body.compliance.attempts[0].requestId).toBe("REQ-CRED-PROPAGATION");
    expect(["PASSED", "SKIPPED"]).toContain(
      detail.body.compliance.localValidation?.status,
    );
    expect(detail.body.compliance.localValidationMetadata).toBeTruthy();
    expect(detail.body.compliance.hashMetadata).toBeTruthy();
    expect(detail.body.compliance.qrMetadata).toBeTruthy();
    expect(detail.body.compliance.signatureMetadata).toBeTruthy();

    const storedDocument = await prisma.complianceDocument.findUniqueOrThrow({
      where: { salesInvoiceId: invoice.body.id },
      select: {
        validationStatus: true,
        validationWarnings: true,
        validationErrors: true,
        validationMetadata: true,
        hashMetadata: true,
        qrMetadata: true,
        signatureMetadata: true,
      },
    });
    expect(["PASSED", "SKIPPED"]).toContain(storedDocument.validationStatus);
    expect(Array.isArray(storedDocument.validationWarnings)).toBe(true);
    expect(Array.isArray(storedDocument.validationErrors)).toBe(true);
    expect(storedDocument.validationMetadata).toBeTruthy();
    expect(storedDocument.hashMetadata).toBeTruthy();
    expect(storedDocument.qrMetadata).toBeTruthy();
    expect(storedDocument.signatureMetadata).toBeTruthy();
  }, 15000);

  it("applies stronger retry backoff for throttled submission failures", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true },
    });
    const invoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: `INV-NE-THROTTLE-${Date.now()}`,
        status: "ISSUED",
        complianceInvoiceKind: "STANDARD",
        issueDate: "2026-04-19T09:00:00.000Z",
        dueDate: "2026-04-29T09:00:00.000Z",
        currencyCode: "SAR",
        lines: [{ description: "Throttle backoff assertion", quantity: "1", unitPrice: "210.00" }],
      })
      .expect(201);

    const queued = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${invoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);
    expect(queued.body.status).toBe("QUEUED");

    let scheduledDelay: number | null = null;
    await prepareSubmissionForManualProcessing(prisma, queued.body.submission.id);
    await processComplianceSubmission({
      prisma,
      submissionId: queued.body.submission.id,
      transport: {
        endpointFor: () => "test://throttle",
        submit: async (_input: ComplianceTransportRequest) => {
          throw new ComplianceTransportError({
            message: "Too many requests from sandbox gateway.",
            category: "CONNECTIVITY",
            retryable: true,
            statusCode: 429,
          });
        },
      },
      enqueueRetry: async (_submissionId, delayMs) => {
        scheduledDelay = delayMs;
      },
    });

    expect(scheduledDelay).toBe(calculateRetryDelayMs(1, { statusCode: 429 }));

    const submission = await prisma.zatcaSubmission.findUniqueOrThrow({
      where: { id: queued.body.submission.id },
    });
    expect(submission.status).toBe("RETRY_SCHEDULED");
    expect(submission.failureCategory).toBe("CONNECTIVITY");
    expect(submission.nextRetryAt).toBeTruthy();

    const retryEvent = await prisma.complianceEvent.findFirst({
      where: {
        organizationId: eventsOrg.id,
        zatcaSubmissionId: queued.body.submission.id,
        action: "compliance.submission.retry_scheduled",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(retryEvent).toBeTruthy();
  }, 15000);

  it("treats authentication failures as terminal without scheduling retries", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true },
    });
    const invoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: `INV-NE-AUTH-${Date.now()}`,
        status: "ISSUED",
        complianceInvoiceKind: "SIMPLIFIED",
        issueDate: "2026-04-19T09:00:00.000Z",
        dueDate: "2026-04-29T09:00:00.000Z",
        currencyCode: "SAR",
        lines: [{ description: "Auth terminal assertion", quantity: "1", unitPrice: "125.00" }],
      })
      .expect(201);

    const queued = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${invoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);
    expect(queued.body.status).toBe("QUEUED");

    let retryScheduled = false;
    await prepareSubmissionForManualProcessing(prisma, queued.body.submission.id);
    await processComplianceSubmission({
      prisma,
      submissionId: queued.body.submission.id,
      transport: {
        endpointFor: () => "test://auth",
        submit: async (_input: ComplianceTransportRequest) => {
          throw new ComplianceTransportError({
            message: "Credential rejected by ZATCA.",
            category: "AUTHENTICATION",
            retryable: false,
            statusCode: 401,
          });
        },
      },
      enqueueRetry: async () => {
        retryScheduled = true;
      },
    });

    expect(retryScheduled).toBe(false);

    const submission = await prisma.zatcaSubmission.findUniqueOrThrow({
      where: { id: queued.body.submission.id },
    });
    expect(submission.status).toBe("FAILED");
    expect(submission.failureCategory).toBe("AUTHENTICATION");
    expect(submission.nextRetryAt).toBeNull();

    const finalFailureEvent = await prisma.complianceEvent.findFirst({
      where: {
        organizationId: eventsOrg.id,
        zatcaSubmissionId: queued.body.submission.id,
        action: "compliance.submission.final_failure",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(finalFailureEvent).toBeTruthy();
  }, 15000);

  it("dead-letters exhausted retryable failures after max attempts", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true },
    });
    const invoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: `INV-NE-DLQ-${Date.now()}`,
        status: "ISSUED",
        complianceInvoiceKind: "STANDARD",
        issueDate: "2026-04-19T09:00:00.000Z",
        dueDate: "2026-04-29T09:00:00.000Z",
        currencyCode: "SAR",
        lines: [{ description: "Dead-letter assertion", quantity: "1", unitPrice: "200.00" }],
      })
      .expect(201);

    const queued = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${invoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);
    expect(queued.body.status).toBe("QUEUED");

    const seeded = await prisma.zatcaSubmission.findUniqueOrThrow({
      where: { id: queued.body.submission.id },
      select: { maxAttempts: true },
    });
    await prisma.zatcaSubmission.update({
      where: { id: queued.body.submission.id },
      data: {
        attemptCount: Math.max(seeded.maxAttempts - 1, 0),
      },
    });

    let deadLetterSubmissionId: string | null = null;
    let deadLetterFailureCategory: string | null = null;
    await prepareSubmissionForManualProcessing(prisma, queued.body.submission.id);
    await processComplianceSubmission({
      prisma,
      submissionId: queued.body.submission.id,
      transport: {
        endpointFor: () => "test://dead-letter",
        submit: async (_input: ComplianceTransportRequest) => {
          throw new ComplianceTransportError({
            message: "Sandbox gateway timeout after retries.",
            category: "CONNECTIVITY",
            retryable: true,
            statusCode: 503,
          });
        },
      },
      enqueueRetry: async () => {
        throw new Error("Retry should not be scheduled after max attempts are exhausted.");
      },
      enqueueDeadLetter: async (job) => {
        deadLetterSubmissionId = job.submissionId;
        deadLetterFailureCategory = job.failureCategory;
      },
    });

    expect(deadLetterSubmissionId).toBe(queued.body.submission.id);
    expect(deadLetterFailureCategory).toBe("CONNECTIVITY");

    const submission = await prisma.zatcaSubmission.findUniqueOrThrow({
      where: { id: queued.body.submission.id },
    });
    expect(submission.status).toBe("FAILED");
    expect(submission.retryable).toBe(false);
    expect(submission.responsePayload).toMatchObject({
      deadLettered: true,
    });

    const deadLetterEvent = await prisma.complianceEvent.findFirst({
      where: {
        organizationId: eventsOrg.id,
        zatcaSubmissionId: queued.body.submission.id,
        action: "compliance.submission.dead_lettered",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(deadLetterEvent).toBeTruthy();
  }, 15000);

  it("fails queued submissions in the processor path when onboarding is revoked", async () => {
    const cookies = await signIn("admin@daftar.local");
    await switchOrg(cookies, "nomad-events");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true },
    });
    const activeOnboarding = await prisma.complianceOnboarding.findFirstOrThrow({
      where: {
        organizationId: eventsOrg.id,
        status: "ACTIVE",
        certificateStatus: "ACTIVE",
        revokedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    });
    const originalStatus = activeOnboarding.status;
    const originalCertificateStatus = activeOnboarding.certificateStatus;
    const originalRevokedAt = activeOnboarding.revokedAt;

    try {
      const invoice = await request(app.getHttpServer())
        .post("/v1/sales/invoices")
        .set("Cookie", cookies)
        .send({
          contactId: customer.id,
          invoiceNumber: `INV-NE-GUARD-${Date.now()}`,
          status: "ISSUED",
          complianceInvoiceKind: "STANDARD",
          issueDate: "2026-04-19T09:00:00.000Z",
          dueDate: "2026-04-29T09:00:00.000Z",
          currencyCode: "SAR",
          lines: [{ description: "Submission guard", quantity: "1", unitPrice: "150.00" }],
        })
        .expect(201);

      const queued = await request(app.getHttpServer())
        .post(`/v1/compliance/invoices/${invoice.body.id}/report`)
        .set("Cookie", cookies)
        .expect(201);
      expect(queued.body.status).toBe("QUEUED");

      await prisma.complianceOnboarding.update({
        where: { id: activeOnboarding.id },
        data: {
          status: "ACTIVE",
          certificateStatus: "ACTIVE",
          revokedAt: new Date(),
        },
      });

      await prepareSubmissionForManualProcessing(prisma, queued.body.submission.id);
      await processComplianceSubmission({
        prisma,
        submissionId: queued.body.submission.id,
      });

      const detail = await request(app.getHttpServer())
        .get(`/v1/sales/invoices/${invoice.body.id}`)
        .set("Cookie", cookies)
        .expect(200);
      expect(detail.body.compliance.status).toBe("FAILED");
      expect(detail.body.compliance.lastError).toBe(
        "Compliance onboarding is not active for this organization/device.",
      );
      expect(detail.body.compliance.submission.failureCategory).toBe("CONFIGURATION");
    } finally {
      await prisma.complianceOnboarding.update({
        where: { id: activeOnboarding.id },
        data: {
          status: originalStatus,
          certificateStatus: originalCertificateStatus,
          revokedAt: originalRevokedAt,
        },
      });
    }
  }, 15000);
});
