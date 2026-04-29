import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";
import { encodeConnectorState } from "./modules/connectors/connector-state";

describe.sequential("Daftar Week 4 release blockers", () => {
  const env = loadEnv();
  const stripe = new Stripe("sk_test_webhook_signing_only");
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL
      }
    }
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

  function signedStripePayload(payload: unknown) {
    const rawPayload = JSON.stringify(payload);
    return {
      rawPayload,
      signature: stripe.webhooks.generateTestHeaderString({
        payload: rawPayload,
        secret: env.STRIPE_WEBHOOK_SECRET
      })
    };
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("exposes connector readiness data and follows the current connector guardrails", async () => {
    const cookies = await signIn("owner@daftar.local");
    await switchOrg(cookies, "nomad-events");

    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "owner@daftar.local" }
    });
    const xeroAccount = await prisma.connectorAccount.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, provider: "XERO" }
    });

    const accounts = await request(app.getHttpServer())
      .get("/v1/connectors/accounts")
      .set("Cookie", cookies)
      .expect(200);
    expect(accounts.body.length).toBe(3);

    const logs = await request(app.getHttpServer())
      .get("/v1/connectors/logs")
      .set("Cookie", cookies)
      .expect(200);
    expect(logs.body.length).toBeGreaterThan(0);

    const exportPreview = await request(app.getHttpServer())
      .get(`/v1/connectors/accounts/${xeroAccount.id}/export-preview`)
      .set("Cookie", cookies)
      .expect(501);
    expect(String(exportPreview.body.message)).toBe(
      "Connector exports are not implemented yet."
    );

    const connectAttempt = await request(app.getHttpServer())
      .get("/v1/connectors/providers/ZOHO_BOOKS/connect-url")
      .query({
        redirectUri: "https://app.daftar.local/connectors/callback"
      })
      .set("Cookie", cookies)
      .expect(200);
    expect(String(connectAttempt.body.authorizationUrl)).toContain(
      "accounts.zoho.com/oauth/v2/auth"
    );

    const state = encodeConnectorState({
      organizationId: eventsOrg.id,
      userId: owner.id,
      provider: "QUICKBOOKS_ONLINE",
      nonce: "week4-release-blockers"
    });

    const callbackAttempt = await request(app.getHttpServer())
      .post("/v1/connectors/providers/QUICKBOOKS_ONLINE/callback")
      .set("Cookie", cookies)
      .send({
        code: "dummy-authorization-code",
        state,
        redirectUri: "https://app.daftar.local/connectors/callback"
      })
      .expect(400);
    expect(String(callbackAttempt.body.message)).toMatch(/missing realmId/i);

    const syncAttempt = await request(app.getHttpServer())
      .post(`/v1/connectors/accounts/${xeroAccount.id}/sync`)
      .set("Cookie", cookies)
      .send({ direction: "EXPORT", scope: "contacts" })
      .expect(501);
    expect(String(syncAttempt.body.message)).toBe(
      "Connector exports are not implemented yet."
    );

    await switchOrg(cookies, "nomad-labs");
    const crossOrgPreview = await request(app.getHttpServer())
      .get(`/v1/connectors/accounts/${xeroAccount.id}/export-preview`)
      .set("Cookie", cookies);
    expect(crossOrgPreview.status).not.toBe(501);
    expect(String(crossOrgPreview.body.message)).not.toBe(
      "Connector exports are not implemented yet."
    );
  });

  it("shows persisted billing state and blocks manual customer-managed billing mutations", async () => {
    const cookies = await signIn("owner@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const labsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" }
    });

    await prisma.billingInvoice.deleteMany({ where: { organizationId: labsOrg.id } });
    await prisma.stripeSubscription.deleteMany({ where: { organizationId: labsOrg.id } });
    await prisma.stripeCustomer.deleteMany({ where: { organizationId: labsOrg.id } });

    await switchOrg(cookies, "nomad-labs");

    const plans = await request(app.getHttpServer())
      .get("/v1/billing/plans")
      .set("Cookie", cookies)
      .expect(200);
    expect(plans.body.map((plan: { code: string }) => plan.code)).toEqual([
      "STARTER",
      "GROWTH",
      "SCALE"
    ]);

    const summaryWriteAttempt = await request(app.getHttpServer())
      .put("/v1/billing/summary")
      .set("Cookie", cookies)
      .send({
        stripeCustomerId: "cus_NL_release",
        billingEmail: "billing@nomad-labs.example",
        subscriptionId: "sub_NL_release",
        planCode: "STARTER",
        status: "TRIALING",
        seats: 3,
        currentPeriodStart: "2026-05-01T00:00:00.000Z",
        currentPeriodEnd: "2026-05-31T23:59:59.000Z",
        cancelAtPeriodEnd: false
      })
      .expect(409);
    expect(summaryWriteAttempt.body.message).toMatch(/read-only/i);

    await request(app.getHttpServer())
      .post("/v1/billing/subscription")
      .set("Cookie", cookies)
      .send({
        stripeCustomerId: "cus_NL_release",
        billingEmail: "billing@nomad-labs.example",
        subscriptionId: "sub_NL_release",
        planCode: "STARTER",
        status: "TRIALING",
        seats: 3,
        currentPeriodStart: "2026-05-01T00:00:00.000Z",
        currentPeriodEnd: "2026-05-31T23:59:59.000Z",
        cancelAtPeriodEnd: false
      })
      .expect(409);

    await request(app.getHttpServer())
      .patch("/v1/billing/subscription")
      .set("Cookie", cookies)
      .send({
        planCode: "GROWTH",
        status: "ACTIVE",
        seats: 6
      })
      .expect(409);

    await request(app.getHttpServer())
      .post("/v1/billing/subscription/cancel")
      .set("Cookie", cookies)
      .send({ immediate: false })
      .expect(409);

    await request(app.getHttpServer())
      .post("/v1/billing/invoices")
      .set("Cookie", cookies)
      .send({
        stripeInvoiceId: "in_blocked_1",
        invoiceNumber: "SUB-BLOCKED-0001",
        status: "open",
        total: "199.00",
        currencyCode: "USD",
        issuedAt: "2026-06-01T00:00:00.000Z",
        dueAt: "2026-06-05T00:00:00.000Z",
        hostedInvoiceUrl: "https://billing.daftar.local/sub-blocked-0001"
      })
      .expect(409);

    const subscriptionUpdatedPayload = signedStripePayload({
      type: "customer.subscription.updated",
      data: {
        organizationId: labsOrg.id,
        stripeCustomerId: "cus_NL_release",
        stripeSubscriptionId: "sub_NL_release",
        billingEmail: "finance@nomad-labs.example",
        planCode: "SCALE",
        status: "ACTIVE",
        seats: 8,
        currentPeriodStart: "2026-06-01T00:00:00.000Z",
        currentPeriodEnd: "2026-06-30T23:59:59.000Z",
        cancelAtPeriodEnd: false
      }
    });

    const webhookUpdated = await request(app.getHttpServer())
      .post("/v1/billing/webhooks/stripe")
      .set("content-type", "application/json")
      .set("x-stripe-signature", subscriptionUpdatedPayload.signature)
      .send(subscriptionUpdatedPayload.rawPayload)
      .expect(201);
    expect(webhookUpdated.body.status).toBe("ACTIVE");

    await request(app.getHttpServer())
      .post("/v1/billing/webhooks/stripe")
      .set("content-type", "application/json")
      .set("x-stripe-signature", "t=1,v1=invalid")
      .send(subscriptionUpdatedPayload.rawPayload)
      .expect(401);

    await request(app.getHttpServer())
      .post("/v1/billing/webhooks/stripe")
      .set("content-type", "application/json")
      .send(subscriptionUpdatedPayload.rawPayload)
      .expect(401);

    const invoiceFailedPayload = signedStripePayload({
      type: "invoice.payment_failed",
      data: {
        stripeSubscriptionId: "sub_NL_release",
        invoice: {
          stripeInvoiceId: "in_NL_release_1",
          invoiceNumber: "SUB-NL-REL-0001",
          status: "open",
          total: "199.00",
          currencyCode: "USD",
          issuedAt: "2026-06-01T00:00:00.000Z",
          dueAt: "2026-06-05T00:00:00.000Z",
          hostedInvoiceUrl: "https://billing.daftar.local/sub-nl-rel-0001"
        }
      }
    });

    await request(app.getHttpServer())
      .post("/v1/billing/webhooks/stripe")
      .set("content-type", "application/json")
      .set("x-stripe-signature", invoiceFailedPayload.signature)
      .send(invoiceFailedPayload.rawPayload)
      .expect(201);

    const invoicePaidPayload = signedStripePayload({
      type: "invoice.paid",
      data: {
        stripeSubscriptionId: "sub_NL_release",
        invoice: {
          stripeInvoiceId: "in_NL_release_1",
          invoiceNumber: "SUB-NL-REL-0001",
          status: "paid",
          total: "199.00",
          currencyCode: "USD",
          issuedAt: "2026-06-01T00:00:00.000Z",
          dueAt: "2026-06-05T00:00:00.000Z",
          paidAt: "2026-06-03T00:00:00.000Z",
          hostedInvoiceUrl: "https://billing.daftar.local/sub-nl-rel-0001"
        }
      }
    });

    const webhookPaid = await request(app.getHttpServer())
      .post("/v1/billing/webhooks/stripe")
      .set("content-type", "application/json")
      .set("x-stripe-signature", invoicePaidPayload.signature)
      .send(invoicePaidPayload.rawPayload)
      .expect(201);
    expect(webhookPaid.body.status).toBe("ACTIVE");

    const subscriptionDeletedPayload = signedStripePayload({
      type: "customer.subscription.deleted",
      data: {
        stripeSubscriptionId: "sub_NL_release"
      }
    });

    await request(app.getHttpServer())
      .post("/v1/billing/webhooks/stripe")
      .set("content-type", "application/json")
      .set("x-stripe-signature", subscriptionDeletedPayload.signature)
      .send(subscriptionDeletedPayload.rawPayload)
      .expect(201);

    const labsSummary = await request(app.getHttpServer())
      .get("/v1/billing/summary")
      .set("Cookie", cookies)
      .expect(200);
    const labsInvoices = await request(app.getHttpServer())
      .get("/v1/billing/invoices")
      .set("Cookie", cookies)
      .expect(200);

    expect(labsSummary.body.planCode).toBe("SCALE");
    expect(labsSummary.body.status).toBe("CANCELED");
    expect(
      labsInvoices.body.some(
        (invoice: { invoiceNumber: string; status: string }) =>
          invoice.invoiceNumber === "SUB-NL-REL-0001" && invoice.status === "paid"
      )
    ).toBe(true);

    await switchOrg(cookies, "nomad-events");
    const eventsSummary = await request(app.getHttpServer())
      .get("/v1/billing/summary")
      .set("Cookie", cookies)
      .expect(200);
    const currentEventsCustomer = await prisma.stripeCustomer.findFirstOrThrow({
      where: { organizationId: eventsOrg.id },
      orderBy: { createdAt: "desc" }
    });
    const currentEventsSubscription = await prisma.stripeSubscription.findFirstOrThrow({
      where: { organizationId: eventsOrg.id },
      orderBy: { createdAt: "desc" }
    });
    expect(eventsSummary.body.subscriptionId).toBe(
      currentEventsSubscription.stripeSubscriptionId
    );
    expect(eventsSummary.body.planCode).toBe(currentEventsSubscription.planCode);
    expect(eventsSummary.body.stripeCustomerId).toBe(
      currentEventsCustomer.stripeCustomerId
    );
    expect(eventsSummary.body.billingEmail).toBe(currentEventsCustomer.billingEmail);
    expect(eventsSummary.body.subscriptionId).not.toBe("sub_NL_release");
  });

  it("validates repeating invoice and repeating bill run behavior", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true }
    });
    const supplier = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isSupplier: true }
    });
    const vatRate = await prisma.taxRate.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, code: "VAT15" }
    });

    const invoiceCountBefore = await prisma.salesInvoice.count({
      where: { organizationId: eventsOrg.id }
    });
    const billCountBefore = await prisma.purchaseBill.count({
      where: { organizationId: eventsOrg.id }
    });

    const repeatingInvoice = await request(app.getHttpServer())
      .post("/v1/sales/repeating-invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        templateName: "Release Validation Invoice",
        status: "ACTIVE",
        frequencyLabel: "Monthly",
        intervalCount: 1,
        nextRunAt: "2026-06-10T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Release validation repeating invoice",
        lines: [
          {
            description: "Support retainer",
            quantity: "1",
            unitPrice: "300.00",
            taxRateId: vatRate.id
          }
        ]
      })
      .expect(201);

    const invoiceRun = await request(app.getHttpServer())
      .post(`/v1/sales/repeating-invoices/${repeatingInvoice.body.id}/run`)
      .set("Cookie", cookies)
      .send({ runAt: "2026-06-10T09:00:00.000Z" })
      .expect(201);
    expect(invoiceRun.body.invoice.status).toBe("ISSUED");
    expect(invoiceRun.body.schedule.nextRunAt).toBe("2026-07-10T09:00:00.000Z");

    await request(app.getHttpServer())
      .post(`/v1/sales/repeating-invoices/${repeatingInvoice.body.id}/run`)
      .set("Cookie", cookies)
      .send({ runAt: "2026-06-10T09:00:00.000Z" })
      .expect(400);

    const repeatingBill = await request(app.getHttpServer())
      .post("/v1/purchases/repeating-bills")
      .set("Cookie", cookies)
      .send({
        contactId: supplier.id,
        templateName: "Release Validation Bill",
        status: "ACTIVE",
        frequencyLabel: "Monthly",
        intervalCount: 1,
        nextRunAt: "2026-06-11T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Release validation repeating bill",
        lines: [
          {
            description: "Facilities retainer",
            quantity: "1",
            unitPrice: "200.00",
            taxRateId: vatRate.id
          }
        ]
      })
      .expect(201);

    const billRun = await request(app.getHttpServer())
      .post(`/v1/purchases/repeating-bills/${repeatingBill.body.id}/run`)
      .set("Cookie", cookies)
      .send({ runAt: "2026-06-11T09:00:00.000Z" })
      .expect(201);
    expect(billRun.body.bill.status).toBe("APPROVED");
    expect(billRun.body.schedule.nextRunAt).toBe("2026-07-11T09:00:00.000Z");

    await request(app.getHttpServer())
      .post(`/v1/purchases/repeating-bills/${repeatingBill.body.id}/run`)
      .set("Cookie", cookies)
      .send({ runAt: "2026-06-11T09:00:00.000Z" })
      .expect(400);

    const invoiceCountAfter = await prisma.salesInvoice.count({
      where: { organizationId: eventsOrg.id }
    });
    const billCountAfter = await prisma.purchaseBill.count({
      where: { organizationId: eventsOrg.id }
    });
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: eventsOrg.id,
        action: {
          in: ["sales.repeating_invoice.run", "purchases.repeating_bill.run"]
        }
      }
    });

    expect(invoiceCountAfter).toBe(invoiceCountBefore + 1);
    expect(billCountAfter).toBe(billCountBefore + 1);
    expect(auditLogs.length).toBeGreaterThanOrEqual(2);
  });

  it("validates journal-backed consistency for extended reports and charts on live data", async () => {
    const cookies = await signIn("admin@daftar.local");

    const reports = await request(app.getHttpServer())
      .get("/v1/reports/dashboard")
      .set("Cookie", cookies)
      .expect(200);
    const charts = await request(app.getHttpServer())
      .get("/v1/charts/dashboard")
      .set("Cookie", cookies)
      .expect(200);

    expect(Number(reports.body.balanceSheet.assets)).toBeCloseTo(
      Number(reports.body.balanceSheet.liabilities) +
        Number(reports.body.balanceSheet.equity),
      2
    );
    expect(reports.body.trialBalance.totalDebit).toBe(reports.body.trialBalance.totalCredit);
    expect(Number(reports.body.expenseBreakdown.totalExpenses)).toBeCloseTo(
      Number(reports.body.expenseBreakdown.billsExpense) +
        Number(reports.body.expenseBreakdown.journalExpense) +
        Number(reports.body.expenseBreakdown.depreciationExpense),
      2
    );
    expect(reports.body.salesTax.invoiceCount).toBe(reports.body.salesTax.lines.length);
    expect(Number(reports.body.salesTax.taxableSales)).toBeCloseTo(
      reports.body.salesTax.lines.reduce(
        (sum: number, line: { taxableSales: string }) => sum + Number(line.taxableSales),
        0
      ),
      2
    );
    expect(Number(reports.body.payablesReceivables.totalReceivables)).toBeCloseTo(
      reports.body.payablesReceivables.documents
        .filter((document: { kind: string }) => document.kind === "RECEIVABLE")
        .reduce(
          (sum: number, document: { amountDue: string }) => sum + Number(document.amountDue),
          0
        ),
      2
    );
    expect(Number(reports.body.payablesReceivables.totalPayables)).toBeCloseTo(
      reports.body.payablesReceivables.documents
        .filter((document: { kind: string }) => document.kind === "PAYABLE")
        .reduce(
          (sum: number, document: { amountDue: string }) => sum + Number(document.amountDue),
          0
        ),
      2
    );
    expect(Number(reports.body.bankSummary.totalClosingBalance)).toBeCloseTo(
      reports.body.bankSummary.accounts.reduce(
        (sum: number, account: { closingBalance: string }) => sum + Number(account.closingBalance),
        0
      ),
      2
    );
    expect(charts.body.balanceChart).toEqual([
      { label: "Assets", value: reports.body.balanceSheet.assets },
      { label: "Liabilities", value: reports.body.balanceSheet.liabilities },
      { label: "Equity", value: reports.body.balanceSheet.equity }
    ]);
    expect(charts.body.bankBalances).toEqual(
      reports.body.bankSummary.accounts.map((account: { accountName: string; closingBalance: string }) => ({
        label: account.accountName,
        value: account.closingBalance
      }))
    );
    expect(charts.body.expenses.length).toBeGreaterThan(0);
  });
});
