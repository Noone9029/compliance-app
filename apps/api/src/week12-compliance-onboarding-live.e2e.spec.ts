import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";
import { processComplianceSubmission } from "./modules/compliance/compliance-processor";

const liveLaneEnabled = process.env.LIVE_ZATCA_E2E === "1";

const describeLive = liveLaneEnabled ? describe.sequential : describe.sequential.skip;

describeLive("Daftar live ZATCA onboarding lane (non-mocked)", () => {
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

  it("runs real onboarding plus non-mocked invoice submission when credentials are provided", async () => {
    const required = [
      "LIVE_ZATCA_ORG_SLUG",
      "LIVE_ZATCA_DEVICE_SERIAL",
      "LIVE_ZATCA_COMMON_NAME",
      "LIVE_ZATCA_ORGANIZATION_NAME",
      "LIVE_ZATCA_VAT_NUMBER",
      "LIVE_ZATCA_OTP",
    ];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing live ZATCA env vars: ${missing.join(", ")}`,
      );
    }

    const authEmail = process.env.LIVE_ZATCA_TEST_EMAIL ?? "admin@daftar.local";
    const orgSlug = process.env.LIVE_ZATCA_ORG_SLUG!;
    const countryCode = process.env.LIVE_ZATCA_COUNTRY_CODE ?? "SA";

    const cookies = await signIn(authEmail);
    await switchOrg(cookies, orgSlug);

    const prepared = await request(app.getHttpServer())
      .post("/v1/compliance/onboarding/prepare")
      .set("Cookie", cookies)
      .send({
        deviceSerial: process.env.LIVE_ZATCA_DEVICE_SERIAL,
        commonName: process.env.LIVE_ZATCA_COMMON_NAME,
        organizationUnitName: process.env.LIVE_ZATCA_ORGANIZATION_UNIT_NAME,
        organizationName: process.env.LIVE_ZATCA_ORGANIZATION_NAME,
        vatNumber: process.env.LIVE_ZATCA_VAT_NUMBER,
        branchName: process.env.LIVE_ZATCA_BRANCH_NAME,
        countryCode,
        locationAddress: process.env.LIVE_ZATCA_LOCATION_ADDRESS,
        industry: process.env.LIVE_ZATCA_INDUSTRY,
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

    const submitted = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/submit-otp`)
      .set("Cookie", cookies)
      .send({
        otpCode: process.env.LIVE_ZATCA_OTP,
      })
      .expect(201);

    expect(submitted.body.status).toBe("CERTIFICATE_ISSUED");
    expect(submitted.body.id).toBe(prepared.body.id);

    const activated = await request(app.getHttpServer())
      .post(`/v1/compliance/onboarding/${prepared.body.id}/activate`)
      .set("Cookie", cookies)
      .expect(201);

    expect(activated.body.status).toBe("ACTIVE");
    expect(activated.body.certificateStatus).toBe("ACTIVE");

    const organization = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true },
    });
    if (!organization) {
      throw new Error(`Live org slug not found in local DB: ${orgSlug}`);
    }

    const contact = process.env.LIVE_ZATCA_CONTACT_ID
      ? await prisma.contact.findFirst({
          where: {
            id: process.env.LIVE_ZATCA_CONTACT_ID,
            organizationId: organization.id,
            isCustomer: true,
          },
        })
      : await prisma.contact.findFirst({
          where: {
            organizationId: organization.id,
            isCustomer: true,
          },
          orderBy: { createdAt: "asc" },
        });
    if (!contact) {
      throw new Error(
        "No customer contact found for live org. Set LIVE_ZATCA_CONTACT_ID or seed a customer contact.",
      );
    }

    const invoiceKind =
      process.env.LIVE_ZATCA_INVOICE_KIND === "STANDARD" ? "STANDARD" : "SIMPLIFIED";
    const now = Date.now();
    const issuedAtIso = new Date(now).toISOString();
    const dueAtIso = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

    const invoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: contact.id,
        invoiceNumber: `INV-LIVE-${now}`,
        status: "ISSUED",
        complianceInvoiceKind: invoiceKind,
        issueDate: issuedAtIso,
        dueDate: dueAtIso,
        currencyCode: "SAR",
        lines: [
          {
            description: "Live ZATCA integration lane item",
            quantity: "1",
            unitPrice: "100.00",
          },
        ],
      })
      .expect(201);

    const queued = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${invoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);

    expect(queued.body.status).toBe("QUEUED");
    expect(queued.body.submission?.id).toBeTypeOf("string");

    await processComplianceSubmission({
      prisma,
      submissionId: queued.body.submission.id,
    });

    const detail = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${invoice.body.id}`)
      .set("Cookie", cookies)
      .expect(200);

    if (invoiceKind === "STANDARD") {
      expect(["CLEARED", "CLEARED_WITH_WARNINGS"]).toContain(
        detail.body.compliance.status,
      );
    } else {
      expect(["REPORTED", "REPORTED_WITH_WARNINGS"]).toContain(
        detail.body.compliance.status,
      );
    }
    expect(["ACCEPTED", "ACCEPTED_WITH_WARNINGS"]).toContain(
      detail.body.compliance.submission.status,
    );
  });

  it("optionally runs renewal and revocation contract checks when explicit flags are set", async () => {
    const renewOtp = process.env.LIVE_ZATCA_RENEW_OTP;
    const allowRevoke = process.env.LIVE_ZATCA_ALLOW_REVOKE === "1";
    if (!renewOtp && !allowRevoke) {
      return;
    }

    const authEmail = process.env.LIVE_ZATCA_TEST_EMAIL ?? "admin@daftar.local";
    const orgSlug = process.env.LIVE_ZATCA_ORG_SLUG!;

    const cookies = await signIn(authEmail);
    await switchOrg(cookies, orgSlug);

    const onboarding = await prisma.complianceOnboarding.findFirst({
      where: {
        organization: { slug: orgSlug },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!onboarding) {
      throw new Error("No onboarding record found for live lane.");
    }

    if (renewOtp) {
      const renewed = await request(app.getHttpServer())
        .post(`/v1/compliance/onboarding/${onboarding.id}/renew`)
        .set("Cookie", cookies)
        .send({ otpCode: renewOtp })
        .expect(201);
      expect(renewed.body.status).toBe("ACTIVE");
    }

    if (allowRevoke) {
      const revoked = await request(app.getHttpServer())
        .post(`/v1/compliance/onboarding/${onboarding.id}/revoke`)
        .set("Cookie", cookies)
        .send({ reason: "LIVE_ZATCA_E2E contract verification" })
        .expect(201);
      expect(revoked.body.status).toBe("REVOKED");
    }
  });
});
