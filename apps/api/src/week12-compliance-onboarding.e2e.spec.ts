import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";
import { processComplianceSubmission } from "./modules/compliance/compliance-processor";

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

  it("runs the staged onboarding lifecycle and keeps integration summary behavior intact", async () => {
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

    const submitBeforeOtpPending = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/submit-otp`)
      .set("Cookie", cookies)
      .send({ otpCode: "123456" })
      .expect(400);
    expect(String(submitBeforeOtpPending.body.message)).toMatch(/OTP_PENDING/i);

    const pendingOtp = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/request-otp`)
      .set("Cookie", cookies)
      .expect(201);
    expect(pendingOtp.body.status).toBe("OTP_PENDING");
    expect(pendingOtp.body.certificateStatus).toBe("OTP_PENDING");

    const regenerateWhileOtpPending = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/generate-csr`)
      .set("Cookie", cookies)
      .expect(400);
    expect(String(regenerateWhileOtpPending.body.message)).toMatch(
      /DRAFT|FAILED/i,
    );

    const submittedOtp = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/submit-otp`)
      .set("Cookie", cookies)
      .send({ otpCode: "123456" })
      .expect(201);
    expect(submittedOtp.body.status).toBe("CSR_SUBMITTED");
    expect(submittedOtp.body.certificateStatus).toBe("CSR_SUBMITTED");
    expect(submittedOtp.body.otpReceivedAt).toBeTruthy();
    expect(submittedOtp.body.csrSubmittedAt).toBeTruthy();
    expect("otpCode" in submittedOtp.body).toBe(false);

    const requestOtpAfterSubmit = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/request-otp`)
      .set("Cookie", cookies)
      .expect(400);
    expect(String(requestOtpAfterSubmit.body.message)).toMatch(/CSR_GENERATED/i);

    const onboardingDetail = await request(app.getHttpServer())
      .get(`/v1/compliance/onboarding/${prepared.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(onboardingDetail.body.id).toBe(prepared.body.id);
    expect(onboardingDetail.body.status).toBe("CSR_SUBMITTED");
    expect("privateKeyPem" in onboardingDetail.body).toBe(false);
    expect("certificatePem" in onboardingDetail.body).toBe(false);

    const integration = await request(app.getHttpServer())
      .get("/v1/compliance/integration")
      .set("Cookie", cookies)
      .expect(200);
    expect(integration.body.status).toBe("REGISTERED");
    expect(integration.body.onboarding.id).toBe(prepared.body.id);
    expect(integration.body.onboarding.status).toBe("CSR_SUBMITTED");
    expect("certificateSecret" in integration.body.onboarding).toBe(false);
    expect("otpCode" in integration.body.onboarding).toBe(false);
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

  it("fails queued submissions in the processor path when onboarding is not active", async () => {
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
      },
      orderBy: { updatedAt: "desc" },
    });
    const originalStatus = activeOnboarding.status;
    const originalCertificateStatus = activeOnboarding.certificateStatus;

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
          status: "DRAFT",
          certificateStatus: "CSR_GENERATED",
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
        },
      });
    }
  });
});
