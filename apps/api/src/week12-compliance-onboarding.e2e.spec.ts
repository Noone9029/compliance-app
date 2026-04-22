import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";
import { calculateRetryDelayMs } from "./modules/compliance/compliance-core";
import { processComplianceSubmission } from "./modules/compliance/compliance-processor";
import {
  ComplianceTransportError,
  type ComplianceTransportRequest,
} from "./modules/compliance/compliance-transport";

describe.sequential("Daftar staged compliance onboarding", () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: loadEnv().DATABASE_URL,
      },
    },
  });
  let app: INestApplication;

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

    expect(capturedCredentials).toEqual({
      clientId: activeOnboarding.csid,
      clientSecret: activeOnboarding.certificateSecret,
    });
    if (!capturedCredentials) {
      throw new Error("Expected onboarding-scoped credentials to be captured.");
    }
    const ensuredCredentials = capturedCredentials as {
      clientId: string;
      clientSecret: string;
    };
    expect(ensuredCredentials.clientId).not.toBe(loadEnv().ZATCA_CLIENT_ID);
    expect(ensuredCredentials.clientSecret).not.toBe(loadEnv().ZATCA_CLIENT_SECRET);

    const detail = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${invoice.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(detail.body.compliance.submission.requestId).toBe("REQ-CRED-PROPAGATION");
    expect(detail.body.compliance.submission.warnings).toEqual(["Sandbox warning"]);
    expect(detail.body.compliance.attempts[0].requestId).toBe("REQ-CRED-PROPAGATION");
  });

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
  });

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
  });

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
  });
});
