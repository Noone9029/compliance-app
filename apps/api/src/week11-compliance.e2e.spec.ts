import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";
import { processComplianceSubmission } from "./modules/compliance/compliance-processor";
import {
  createDeterministicComplianceTransport,
  prepareSubmissionForManualProcessing,
} from "./test/compliance-processing";

describe.sequential("Daftar compliance queue and lifecycle", () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: loadEnv().DATABASE_URL,
      },
    },
  });
  let app: INestApplication;
  const transport = createDeterministicComplianceTransport();

  async function signIn(email: string) {
    const response = await request(app.getHttpServer())
      .post("/v1/auth/sign-in")
      .send({ email, password: "Password123!" })
      .expect(201);

    return response.headers["set-cookie"];
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });
    await prisma.organizationSetting.upsert({
      where: {
        organizationId_key: {
          organizationId: eventsOrg.id,
          key: "week10.einvoice.integration",
        },
      },
      update: {
        value: { environment: "Sandbox" },
      },
      create: {
        organizationId: eventsOrg.id,
        key: "week10.einvoice.integration",
        value: { environment: "Sandbox" },
      },
    });
  });

  it("separates clearance and reporting flows for standard and simplified invoices", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true },
    });

    const standardInvoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: "INV-NE-ZATCA-STD-0001",
        status: "ISSUED",
        complianceInvoiceKind: "STANDARD",
        issueDate: "2026-04-18T09:00:00.000Z",
        dueDate: "2026-04-28T09:00:00.000Z",
        currencyCode: "SAR",
        lines: [{ description: "Standard invoice", quantity: "1", unitPrice: "200.00" }],
      })
      .expect(201);

    const simplifiedInvoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: "INV-NE-ZATCA-SIM-0001",
        status: "ISSUED",
        complianceInvoiceKind: "SIMPLIFIED",
        issueDate: "2026-04-18T10:00:00.000Z",
        dueDate: "2026-04-28T10:00:00.000Z",
        currencyCode: "SAR",
        lines: [{ description: "Simplified invoice", quantity: "1", unitPrice: "90.00" }],
      })
      .expect(201);

    const queuedStandard = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${standardInvoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);
    const queuedSimplified = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${simplifiedInvoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);

    expect(queuedStandard.body.submission.flow).toBe("CLEARANCE");
    expect(queuedSimplified.body.submission.flow).toBe("REPORTING");

    await prepareSubmissionForManualProcessing(
      prisma,
      queuedStandard.body.submission.id,
    );
    await processComplianceSubmission({
      prisma,
      submissionId: queuedStandard.body.submission.id,
      transport,
    });
    await prepareSubmissionForManualProcessing(
      prisma,
      queuedSimplified.body.submission.id,
    );
    await processComplianceSubmission({
      prisma,
      submissionId: queuedSimplified.body.submission.id,
      transport,
    });

    const standardDetail = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${standardInvoice.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    const simplifiedDetail = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${simplifiedInvoice.body.id}`)
      .set("Cookie", cookies)
      .expect(200);

    expect(standardDetail.body.compliance.status).toBe("CLEARED");
    expect(standardDetail.body.compliance.canShareWithCustomer).toBe(true);
    expect(simplifiedDetail.body.compliance.status).toBe("REPORTED");
    expect(simplifiedDetail.body.compliance.canShareWithCustomer).toBe(true);
  }, 15000);

  it("persists retry history and supports operator-triggered retries after rejection", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" },
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true },
    });

    const retryableInvoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: "INV-NE-FAIL-CONNECT-ONCE-0001",
        status: "ISSUED",
        complianceInvoiceKind: "SIMPLIFIED",
        issueDate: "2026-04-18T11:00:00.000Z",
        dueDate: "2026-04-28T11:00:00.000Z",
        currencyCode: "SAR",
        lines: [{ description: "Retryable invoice", quantity: "1", unitPrice: "75.00" }],
      })
      .expect(201);

    const queuedRetryable = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${retryableInvoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);

    await prepareSubmissionForManualProcessing(
      prisma,
      queuedRetryable.body.submission.id,
    );
    await processComplianceSubmission({
      prisma,
      submissionId: queuedRetryable.body.submission.id,
      transport,
    });
    await prepareSubmissionForManualProcessing(
      prisma,
      queuedRetryable.body.submission.id,
    );
    await processComplianceSubmission({
      prisma,
      submissionId: queuedRetryable.body.submission.id,
      transport,
    });

    const retryableDetail = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${retryableInvoice.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(retryableDetail.body.compliance.attempts.length).toBeGreaterThanOrEqual(2);
    expect(retryableDetail.body.compliance.status).toBe("REPORTED");

    const rejectedInvoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: "INV-NE-FAIL-REJECT-0001",
        status: "ISSUED",
        complianceInvoiceKind: "STANDARD",
        issueDate: "2026-04-18T12:00:00.000Z",
        dueDate: "2026-04-28T12:00:00.000Z",
        currencyCode: "SAR",
        lines: [{ description: "Rejected invoice", quantity: "1", unitPrice: "130.00" }],
      })
      .expect(201);

    const queuedRejected = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${rejectedInvoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);

    await prepareSubmissionForManualProcessing(
      prisma,
      queuedRejected.body.submission.id,
    );
    await processComplianceSubmission({
      prisma,
      submissionId: queuedRejected.body.submission.id,
      transport,
    });

    const rejectedDetail = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${rejectedInvoice.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(rejectedDetail.body.compliance.status).toBe("REJECTED");
    expect(rejectedDetail.body.compliance.retryAllowed).toBe(true);

    const retriedDocument = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${rejectedInvoice.body.id}/retry`)
      .set("Cookie", cookies)
      .expect(201);
    expect(retriedDocument.body.status).toBe("QUEUED");

    await prepareSubmissionForManualProcessing(
      prisma,
      retriedDocument.body.submission.id,
    );
    await processComplianceSubmission({
      prisma,
      submissionId: retriedDocument.body.submission.id,
      transport,
    });

    const retriedDetail = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${rejectedInvoice.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(retriedDetail.body.compliance.attempts.length).toBeGreaterThanOrEqual(2);
    expect(retriedDetail.body.compliance.timeline.length).toBeGreaterThanOrEqual(3);
    expect(retriedDetail.body.compliance.status).toBe("REJECTED");
  }, 15000);
});
