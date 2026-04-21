import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";

describe.sequential("Daftar Week 4 extensions", () => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: loadEnv().DATABASE_URL
      }
    }
  });
  let app: INestApplication;

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

  it("supports sales credit notes and repeating invoices end to end", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const labsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" }
    });
    const vatRate = await prisma.taxRate.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, code: "VAT15" }
    });
    const invoice = await prisma.salesInvoice.findFirstOrThrow({
      where: { organizationId: eventsOrg.id }
    });
    const customer = await prisma.contact.findUniqueOrThrow({
      where: { id: invoice.contactId }
    });
    const invoiceAmountDueBefore = Number(invoice.amountDue).toFixed(2);
    const labsCreditNote = await prisma.salesCreditNote.findFirstOrThrow({
      where: { organizationId: labsOrg.id }
    });

    const createdCreditNote = await request(app.getHttpServer())
      .post("/v1/sales/credit-notes")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        salesInvoiceId: invoice.id,
        creditNoteNumber: "SCN-NE-0901",
        status: "ISSUED",
        issueDate: "2026-04-13T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Week 4 sales credit note",
        lines: [
          {
            description: "Customer goodwill credit",
            quantity: "1",
            unitPrice: "200.00",
            taxRateId: vatRate.id
          }
        ]
      })
      .expect(201);
    expect(createdCreditNote.body.total).toBe("230.00");
    expect(createdCreditNote.body.status).toBe("ISSUED");

    const updatedCreditNote = await request(app.getHttpServer())
      .patch(`/v1/sales/credit-notes/${createdCreditNote.body.id}`)
      .set("Cookie", cookies)
      .send({
        status: "APPLIED",
        notes: "Week 4 sales credit note applied"
      })
      .expect(200);
    expect(updatedCreditNote.body.status).toBe("APPLIED");

    const invoiceAfterCredit = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${invoice.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(invoiceAfterCredit.body.amountDue).toBe(
      Math.max(0, Number(invoiceAmountDueBefore) - 230).toFixed(2)
    );

    await request(app.getHttpServer())
      .patch(`/v1/sales/credit-notes/${createdCreditNote.body.id}`)
      .set("Cookie", cookies)
      .send({
        lines: [{ description: "Forbidden", quantity: "1", unitPrice: "10.00" }]
      })
      .expect(400);

    const createdSchedule = await request(app.getHttpServer())
      .post("/v1/sales/repeating-invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        templateName: "Managed Support Retainer",
        status: "ACTIVE",
        frequencyLabel: "Monthly",
        intervalCount: 1,
        nextRunAt: "2026-05-01T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Week 4 repeating invoice",
        lines: [
          {
            description: "Retainer",
            quantity: "2",
            unitPrice: "300.00",
            taxRateId: vatRate.id
          }
        ]
      })
      .expect(201);
    expect(createdSchedule.body.total).toBe("690.00");
    expect(createdSchedule.body.status).toBe("ACTIVE");

    const updatedSchedule = await request(app.getHttpServer())
      .patch(`/v1/sales/repeating-invoices/${createdSchedule.body.id}`)
      .set("Cookie", cookies)
      .send({
        status: "PAUSED",
        intervalCount: 2,
        notes: "Paused after customer request"
      })
      .expect(200);
    expect(updatedSchedule.body.status).toBe("PAUSED");
    expect(updatedSchedule.body.intervalCount).toBe(2);

    await request(app.getHttpServer())
      .get(`/v1/sales/credit-notes/${labsCreditNote.id}`)
      .set("Cookie", cookies)
      .expect(404);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: eventsOrg.id,
        action: {
          in: [
            "sales.credit_note.create",
            "sales.credit_note.update",
            "sales.repeating_invoice.create",
            "sales.repeating_invoice.update"
          ]
        }
      }
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(4);
  });

  it("supports purchase credit notes, purchase orders, and repeating bills end to end", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const vatRate = await prisma.taxRate.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, code: "VAT15" }
    });
    const bill = await prisma.purchaseBill.findFirstOrThrow({
      where: { organizationId: eventsOrg.id }
    });
    const supplier = await prisma.contact.findUniqueOrThrow({
      where: { id: bill.contactId }
    });
    const billAmountDueBefore = Number(bill.amountDue).toFixed(2);

    const createdCreditNote = await request(app.getHttpServer())
      .post("/v1/purchases/credit-notes")
      .set("Cookie", cookies)
      .send({
        contactId: supplier.id,
        purchaseBillId: bill.id,
        creditNoteNumber: "PCN-NE-0901",
        status: "ISSUED",
        issueDate: "2026-04-13T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Week 4 supplier credit note",
        lines: [
          {
            description: "Volume rebate",
            quantity: "1",
            unitPrice: "100.00",
            taxRateId: vatRate.id
          }
        ]
      })
      .expect(201);
    expect(createdCreditNote.body.total).toBe("115.00");

    const updatedCreditNote = await request(app.getHttpServer())
      .patch(`/v1/purchases/credit-notes/${createdCreditNote.body.id}`)
      .set("Cookie", cookies)
      .send({
        status: "APPLIED",
        notes: "Applied to supplier account"
      })
      .expect(200);
    expect(updatedCreditNote.body.status).toBe("APPLIED");

    const billAfterCredit = await request(app.getHttpServer())
      .get(`/v1/purchases/bills/${bill.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(billAfterCredit.body.amountDue).toBe(
      Math.max(0, Number(billAmountDueBefore) - 115).toFixed(2)
    );

    const createdOrder = await request(app.getHttpServer())
      .post("/v1/purchases/orders")
      .set("Cookie", cookies)
      .send({
        contactId: supplier.id,
        orderNumber: "PO-NE-0901",
        status: "SENT",
        issueDate: "2026-04-13T09:00:00.000Z",
        expectedDate: "2026-04-20T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Week 4 purchase order",
        lines: [
          {
            description: "Stage build materials",
            quantity: "2",
            unitPrice: "250.00",
            taxRateId: vatRate.id
          }
        ]
      })
      .expect(201);
    expect(createdOrder.body.total).toBe("575.00");

    const updatedOrder = await request(app.getHttpServer())
      .patch(`/v1/purchases/orders/${createdOrder.body.id}`)
      .set("Cookie", cookies)
      .send({
        status: "RECEIVED",
        notes: "Delivered ahead of schedule"
      })
      .expect(200);
    expect(updatedOrder.body.status).toBe("RECEIVED");

    await request(app.getHttpServer())
      .patch(`/v1/purchases/orders/${createdOrder.body.id}`)
      .set("Cookie", cookies)
      .send({
        lines: [{ description: "Forbidden", quantity: "1", unitPrice: "10.00" }]
      })
      .expect(400);

    const createdRepeatingBill = await request(app.getHttpServer())
      .post("/v1/purchases/repeating-bills")
      .set("Cookie", cookies)
      .send({
        contactId: supplier.id,
        templateName: "Warehouse Maintenance",
        status: "ACTIVE",
        frequencyLabel: "Monthly",
        intervalCount: 1,
        nextRunAt: "2026-05-03T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Week 4 repeating bill",
        lines: [
          {
            description: "Maintenance retainer",
            quantity: "1",
            unitPrice: "400.00",
            taxRateId: vatRate.id
          }
        ]
      })
      .expect(201);
    expect(createdRepeatingBill.body.total).toBe("460.00");

    const updatedRepeatingBill = await request(app.getHttpServer())
      .patch(`/v1/purchases/repeating-bills/${createdRepeatingBill.body.id}`)
      .set("Cookie", cookies)
      .send({
        status: "PAUSED",
        intervalCount: 2
      })
      .expect(200);
    expect(updatedRepeatingBill.body.status).toBe("PAUSED");
    expect(updatedRepeatingBill.body.intervalCount).toBe(2);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: eventsOrg.id,
        action: {
          in: [
            "purchases.credit_note.create",
            "purchases.credit_note.update",
            "purchases.order.create",
            "purchases.order.update",
            "purchases.repeating_bill.create",
            "purchases.repeating_bill.update"
          ]
        }
      }
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(6);
  });

  it("supports connector readiness, read-only billing posture, fixed assets, and extended reports", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const xeroAccount = await prisma.connectorAccount.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, provider: "XERO" }
    });
    const preview = await request(app.getHttpServer())
      .get(`/v1/connectors/accounts/${xeroAccount.id}/export-preview`)
      .set("Cookie", cookies)
      .expect(200);
    expect(preview.body.organizationId).toBe(eventsOrg.id);
    expect(preview.body.connectorAccountId).toBe(xeroAccount.id);
    expect(preview.body.scope).toBeNull();
    expect(String(preview.body.message)).toMatch(/not implemented/i);

    const syncResult = await request(app.getHttpServer())
      .post(`/v1/connectors/accounts/${xeroAccount.id}/sync`)
      .set("Cookie", cookies)
      .send({ direction: "EXPORT", scope: "contacts,invoices,bills,quotes" })
      .expect(201);
    expect(syncResult.body.connectorAccountId).toBe(xeroAccount.id);
    expect(syncResult.body.scope).toBe("contacts,invoices,bills,quotes");
    expect(String(syncResult.body.message)).toMatch(/not implemented/i);

    const billingSummaryBefore = await request(app.getHttpServer())
      .get("/v1/billing/summary")
      .set("Cookie", cookies)
      .expect(200);
    expect(billingSummaryBefore.body.billingEmail).toContain("@");

    const billingSummary = await request(app.getHttpServer())
      .put("/v1/billing/summary")
      .set("Cookie", cookies)
      .send({
        stripeCustomerId: "cus_NE_upgrade",
        billingEmail: "finance@nomad-events.example",
        subscriptionId: "sub_NE_scale",
        planCode: "SCALE",
        status: "ACTIVE",
        seats: 20,
        currentPeriodStart: "2026-05-01T00:00:00.000Z",
        currentPeriodEnd: "2026-05-31T23:59:59.000Z",
        cancelAtPeriodEnd: false
      })
      .expect(409);
    expect(billingSummary.body.message).toMatch(/read-only/i);

    const createdBillingInvoice = await request(app.getHttpServer())
      .post("/v1/billing/invoices")
      .set("Cookie", cookies)
      .send({
        stripeInvoiceId: "in_NE_0999",
        invoiceNumber: "SUB-NE-0999",
        status: "open",
        total: "499.00",
        currencyCode: "USD",
        issuedAt: "2026-05-01T00:00:00.000Z",
        dueAt: "2026-05-05T00:00:00.000Z",
        hostedInvoiceUrl: "https://billing.daftar.local/invoice/sub-ne-0999"
      })
      .expect(409);
    expect(createdBillingInvoice.body.message).toMatch(/read-only/i);

    const createdAsset = await request(app.getHttpServer())
      .post("/v1/assets")
      .set("Cookie", cookies)
      .send({
        assetNumber: "FA-NE-0901",
        name: "Conference Display System",
        category: "AV Equipment",
        purchaseDate: "2026-04-01T00:00:00.000Z",
        cost: "1200.00",
        salvageValue: "0.00",
        usefulLifeMonths: 12,
        depreciationMethod: "STRAIGHT_LINE"
      })
      .expect(201);
    expect(createdAsset.body.netBookValue).toBe("1200.00");

    const depreciationResult = await request(app.getHttpServer())
      .post(`/v1/assets/${createdAsset.body.id}/depreciate`)
      .set("Cookie", cookies)
      .send({
        runDate: "2026-05-01T00:00:00.000Z"
      })
      .expect(201);
    expect(depreciationResult.body.asset.accumulatedDepreciation).toBe("100.00");
    expect(depreciationResult.body.asset.netBookValue).toBe("1100.00");

    const reports = await request(app.getHttpServer())
      .get("/v1/reports/dashboard")
      .set("Cookie", cookies)
      .expect(200);
    expect(reports.body.budgetSummary.activeRepeatingInvoices).toBeGreaterThan(0);
    expect(Number(reports.body.expenseBreakdown.totalExpenses)).toBeGreaterThan(0);
    expect(Number(reports.body.balanceSheet.assets)).toBeGreaterThan(0);
    expect(reports.body.trialBalance.lines.length).toBeGreaterThan(0);

    const charts = await request(app.getHttpServer())
      .get("/v1/charts/dashboard")
      .set("Cookie", cookies)
      .expect(200);
    expect(charts.body.expenses.length).toBeGreaterThan(0);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: eventsOrg.id,
        action: {
          in: [
            "assets.asset.create",
            "assets.asset.depreciate"
          ]
        }
      }
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(2);
  });

  it("enforces Week 4 write restrictions while keeping read access intact", async () => {
    const cookies = await signIn("viewer@daftar.local");
    const labsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" }
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: labsOrg.id, isCustomer: true }
    });
    const supplier = await prisma.contact.findFirstOrThrow({
      where: { organizationId: labsOrg.id, isSupplier: true }
    });
    const xeroAccount = await prisma.connectorAccount.findFirstOrThrow({
      where: { organizationId: labsOrg.id, provider: "XERO" }
    });

    await request(app.getHttpServer())
      .get("/v1/sales/credit-notes")
      .set("Cookie", cookies)
      .expect(200);
    await request(app.getHttpServer())
      .get("/v1/purchases/orders")
      .set("Cookie", cookies)
      .expect(200);
    await request(app.getHttpServer())
      .get("/v1/billing/summary")
      .set("Cookie", cookies)
      .expect(200);
    await request(app.getHttpServer())
      .get("/v1/assets")
      .set("Cookie", cookies)
      .expect(200);

    await request(app.getHttpServer())
      .post("/v1/sales/credit-notes")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        status: "DRAFT",
        issueDate: "2026-04-13T09:00:00.000Z",
        currencyCode: "USD",
        lines: [{ description: "Forbidden", quantity: "1", unitPrice: "10.00" }]
      })
      .expect(403);

    await request(app.getHttpServer())
      .post("/v1/purchases/orders")
      .set("Cookie", cookies)
      .send({
        contactId: supplier.id,
        status: "DRAFT",
        issueDate: "2026-04-13T09:00:00.000Z",
        expectedDate: "2026-04-20T09:00:00.000Z",
        currencyCode: "USD",
        lines: [{ description: "Forbidden", quantity: "1", unitPrice: "10.00" }]
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/connectors/accounts/${xeroAccount.id}/sync`)
      .set("Cookie", cookies)
      .send({ direction: "EXPORT" })
      .expect(403);

    await request(app.getHttpServer())
      .put("/v1/billing/summary")
      .set("Cookie", cookies)
      .send({
        stripeCustomerId: "cus_forbidden",
        billingEmail: "viewer@nomad-labs.example",
        subscriptionId: "sub_forbidden",
        planCode: "STARTER",
        status: "ACTIVE",
        seats: 1,
        currentPeriodStart: "2026-05-01T00:00:00.000Z",
        currentPeriodEnd: "2026-05-31T23:59:59.000Z",
        cancelAtPeriodEnd: false
      })
      .expect(403);

    await request(app.getHttpServer())
      .post("/v1/assets")
      .set("Cookie", cookies)
      .send({
        name: "Forbidden Asset",
        category: "Equipment",
        purchaseDate: "2026-04-01T00:00:00.000Z",
        cost: "100.00",
        salvageValue: "0.00",
        usefulLifeMonths: 12,
        depreciationMethod: "STRAIGHT_LINE"
      })
      .expect(403);
  });
});
