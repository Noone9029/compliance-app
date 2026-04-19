import { promises as fs } from "node:fs";
import path from "node:path";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";
import { processComplianceSubmission } from "./modules/compliance/compliance-processor";

describe.sequential("Daftar Week 3 accounting core", () => {
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

  async function createInventoryItem(organizationId: string, suffix: string, quantityOnHand: string) {
    return prisma.inventoryItem.create({
      data: {
        organizationId,
        itemCode: `ITM-${suffix}-${Date.now()}`,
        itemName: `Week 3 ${suffix}`,
        description: "Week 3 inventory-linked test item.",
        costPrice: "25.00",
        salePrice: "40.00",
        quantityOnHand
      }
    });
  }

  it("supports sales invoices end to end including compliance reporting", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const otherOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" }
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true }
    });
    const vatRate = await prisma.taxRate.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, code: "VAT15" }
    });
    const primaryBankAccount = await prisma.bankAccount.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isPrimary: true }
    });
    const otherOrgBankAccount = await prisma.bankAccount.findFirstOrThrow({
      where: { organizationId: otherOrg.id, isPrimary: true }
    });
    const otherOrgInvoice = await prisma.salesInvoice.findFirstOrThrow({
      where: { organizationId: otherOrg.id }
    });
    const salesItem = await createInventoryItem(eventsOrg.id, "SALES", "10.00");

    const invoicesBefore = await request(app.getHttpServer())
      .get("/v1/sales/invoices")
      .set("Cookie", cookies)
      .expect(200);
    expect(invoicesBefore.body.length).toBeGreaterThanOrEqual(2);

    const createdInvoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: "INV-NE-0901",
        status: "DRAFT",
        complianceInvoiceKind: "STANDARD",
        issueDate: "2026-04-12T09:00:00.000Z",
        dueDate: "2026-04-22T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Week 3 test invoice",
        lines: [
          {
            description: "Implementation sprint",
            inventoryItemId: salesItem.id,
            quantity: "2",
            unitPrice: "500.00",
            taxRateId: vatRate.id
          }
        ]
      })
      .expect(201);
    expect(createdInvoice.body.total).toBe("1150.00");
    expect(createdInvoice.body.status).toBe("DRAFT");
    expect(createdInvoice.body.lines[0].inventoryItemId).toBe(salesItem.id);

    const updatedInvoice = await request(app.getHttpServer())
      .patch(`/v1/sales/invoices/${createdInvoice.body.id}`)
      .set("Cookie", cookies)
      .send({
        notes: "Week 3 test invoice updated",
        status: "ISSUED"
      })
      .expect(200);
    expect(updatedInvoice.body.notes).toContain("updated");
    expect(updatedInvoice.body.status).toBe("ISSUED");

    const salesItemAfterInvoice = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: salesItem.id }
    });
    expect(Number(salesItemAfterInvoice.quantityOnHand).toFixed(2)).toBe("8.00");

    await request(app.getHttpServer())
      .post(`/v1/sales/invoices/${createdInvoice.body.id}/payments`)
      .set("Cookie", cookies)
      .send({
        bankAccountId: otherOrgBankAccount.id,
        paymentDate: "2026-04-13T09:00:00.000Z",
        amount: "300.00",
        method: "Bank Transfer",
        reference: "WK3-PMT-WRONG-BANK"
      })
      .expect(404);

    const paidInvoice = await request(app.getHttpServer())
      .post(`/v1/sales/invoices/${createdInvoice.body.id}/payments`)
      .set("Cookie", cookies)
      .send({
        bankAccountId: primaryBankAccount.id,
        paymentDate: "2026-04-13T09:00:00.000Z",
        amount: "300.00",
        method: "Bank Transfer",
        reference: "WK3-PMT-001",
        notes: "Partial payment"
      })
      .expect(201);
    expect(paidInvoice.body.status).toBe("PARTIALLY_PAID");
    expect(paidInvoice.body.amountDue).toBe("850.00");

    const complianceDocument = await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${createdInvoice.body.id}/report`)
      .set("Cookie", cookies)
      .expect(201);
    expect(complianceDocument.body.status).toBe("QUEUED");
    expect(complianceDocument.body.submission.status).toBe("QUEUED");

    await request(app.getHttpServer())
      .patch(`/v1/sales/invoices/${createdInvoice.body.id}`)
      .set("Cookie", cookies)
      .send({
        notes: "Queued compliance edits should be blocked"
      })
      .expect(400);

    await processComplianceSubmission({
      prisma,
      submissionId: complianceDocument.body.submission.id
    });

    const invoiceDetail = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${createdInvoice.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(invoiceDetail.body.compliance.status).toBe("CLEARED");
    expect(invoiceDetail.body.compliance.attempts.length).toBeGreaterThanOrEqual(1);
    expect(invoiceDetail.body.statusEvents.length).toBeGreaterThanOrEqual(3);
    expect(invoiceDetail.body.lines[0].inventoryItemCode).toContain("ITM-SALES-");

    await request(app.getHttpServer())
      .patch(`/v1/sales/invoices/${createdInvoice.body.id}`)
      .set("Cookie", cookies)
      .send({
        notes: "Post-issue edits should be blocked"
      })
      .expect(400);

    const reportedDocuments = await request(app.getHttpServer())
      .get("/v1/compliance/reported-documents")
      .set("Cookie", cookies)
      .expect(200);
    expect(
      reportedDocuments.body.some(
        (document: { documentNumber: string }) =>
          document.documentNumber === "INV-NE-0901"
      )
    ).toBe(true);

    await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${otherOrgInvoice.id}`)
      .set("Cookie", cookies)
      .expect(404);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: eventsOrg.id,
        action: {
          in: [
            "sales.invoice.create",
            "sales.invoice.update",
            "sales.invoice.payment",
            "compliance.invoice.report"
          ]
        }
      }
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(4);
  });

  it("supports purchases end to end", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const supplier = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isSupplier: true }
    });
    const vatRate = await prisma.taxRate.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, code: "VAT15" }
    });
    const primaryBankAccount = await prisma.bankAccount.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isPrimary: true }
    });
    const purchaseItem = await createInventoryItem(eventsOrg.id, "PURCHASE", "4.00");

    const createdBill = await request(app.getHttpServer())
      .post("/v1/purchases/bills")
      .set("Cookie", cookies)
      .send({
        contactId: supplier.id,
        billNumber: "BILL-NE-0901",
        status: "DRAFT",
        issueDate: "2026-04-12T09:00:00.000Z",
        dueDate: "2026-04-24T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Week 3 vendor bill",
        lines: [
          {
            description: "Production support",
            inventoryItemId: purchaseItem.id,
            quantity: "1",
            unitPrice: "750.00",
            taxRateId: vatRate.id
          }
        ]
      })
      .expect(201);
    expect(createdBill.body.total).toBe("862.50");
    expect(createdBill.body.status).toBe("DRAFT");
    expect(createdBill.body.lines[0].inventoryItemId).toBe(purchaseItem.id);

    const updatedBill = await request(app.getHttpServer())
      .patch(`/v1/purchases/bills/${createdBill.body.id}`)
      .set("Cookie", cookies)
      .send({
        notes: "Week 3 vendor bill updated",
        status: "APPROVED"
      })
      .expect(200);
    expect(updatedBill.body.notes).toContain("updated");
    expect(updatedBill.body.status).toBe("APPROVED");

    const purchaseItemAfterBill = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: purchaseItem.id }
    });
    expect(Number(purchaseItemAfterBill.quantityOnHand).toFixed(2)).toBe("5.00");

    const paidBill = await request(app.getHttpServer())
      .post(`/v1/purchases/bills/${createdBill.body.id}/payments`)
      .set("Cookie", cookies)
      .send({
        bankAccountId: primaryBankAccount.id,
        paymentDate: "2026-04-14T09:00:00.000Z",
        amount: "862.50",
        method: "Bank Transfer",
        reference: "WK3-BILL-001",
        notes: "Settled in full"
      })
      .expect(201);
    expect(paidBill.body.status).toBe("PAID");
    expect(paidBill.body.amountDue).toBe("0.00");

    await request(app.getHttpServer())
      .patch(`/v1/purchases/bills/${createdBill.body.id}`)
      .set("Cookie", cookies)
      .send({
        notes: "Approved bills should not be editable"
      })
      .expect(400);
  });

  it("supports quotes end to end including conversion to invoice", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true }
    });
    const zeroRate = await prisma.taxRate.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, code: "ZERO" }
    });
    const quoteItem = await createInventoryItem(eventsOrg.id, "QUOTE", "6.00");

    const createdQuote = await request(app.getHttpServer())
      .post("/v1/quotes")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        quoteNumber: "QUO-NE-0901",
        status: "SENT",
        issueDate: "2026-04-12T09:00:00.000Z",
        expiryDate: "2026-04-29T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Week 3 client quote",
        lines: [
          {
            description: "Discovery workshop",
            inventoryItemId: quoteItem.id,
            quantity: "1",
            unitPrice: "900.00",
            taxRateId: zeroRate.id
          }
        ]
      })
      .expect(201);
    expect(createdQuote.body.total).toBe("900.00");

    const updatedQuote = await request(app.getHttpServer())
      .patch(`/v1/quotes/${createdQuote.body.id}`)
      .set("Cookie", cookies)
      .send({
        notes: "Week 3 client quote updated"
      })
      .expect(200);
    expect(updatedQuote.body.notes).toContain("updated");
    expect(updatedQuote.body.lines[0].inventoryItemId).toBe(quoteItem.id);

    const conversion = await request(app.getHttpServer())
      .post(`/v1/quotes/${createdQuote.body.id}/convert`)
      .set("Cookie", cookies)
      .expect(201);
    expect(conversion.body.invoiceId).toBeTruthy();
    expect(conversion.body.quote.status).toBe("CONVERTED");

    const secondConversion = await request(app.getHttpServer())
      .post(`/v1/quotes/${createdQuote.body.id}/convert`)
      .set("Cookie", cookies)
      .expect(201);
    expect(secondConversion.body.invoiceId).toBe(conversion.body.invoiceId);

    const convertedInvoice = await request(app.getHttpServer())
      .get(`/v1/sales/invoices/${conversion.body.invoiceId}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(convertedInvoice.body.status).toBe("DRAFT");
    expect(convertedInvoice.body.lines[0].inventoryItemId).toBe(quoteItem.id);

    await request(app.getHttpServer())
      .patch(`/v1/quotes/${createdQuote.body.id}`)
      .set("Cookie", cookies)
      .send({
        notes: "Converted quotes should not be editable"
      })
      .expect(400);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        organizationId: eventsOrg.id,
        action: {
          in: ["quotes.quote.create", "quotes.quote.update", "quotes.quote.convert"]
        }
      }
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(3);
  });

  it("supports real attachment upload, download, deletion, and immutable attachment rules", async () => {
    const cookies = await signIn("admin@daftar.local");
    const viewerCookies = await signIn("viewer@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const customer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: eventsOrg.id, isCustomer: true }
    });

    const invoice = await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: customer.id,
        invoiceNumber: "INV-NE-ATT-0001",
        status: "DRAFT",
        complianceInvoiceKind: "STANDARD",
        issueDate: "2026-04-12T09:00:00.000Z",
        dueDate: "2026-04-22T09:00:00.000Z",
        currencyCode: "SAR",
        notes: "Attachment test invoice",
        lines: [{ description: "Attachment scope", quantity: "1", unitPrice: "125.00" }]
      })
      .expect(201);

    const uploaded = await request(app.getHttpServer())
      .post("/v1/files/upload")
      .set("Cookie", cookies)
      .field("relatedType", "sales-invoice")
      .field("relatedId", invoice.body.id)
      .attach("file", Buffer.from("week12-attachment"), {
        filename: "scope.txt",
        contentType: "text/plain"
      })
      .expect(201);

    const storagePath = path.resolve(
      process.cwd(),
      ".local-storage",
      "files",
      uploaded.body.objectKey
    );
    expect(await fs.readFile(storagePath, "utf8")).toContain("week12-attachment");

    const download = await request(app.getHttpServer())
      .get(`/v1/files/${uploaded.body.id}/download`)
      .set("Cookie", cookies)
      .expect(200);
    expect(download.text).toContain("week12-attachment");

    await request(app.getHttpServer())
      .get(`/v1/files/${uploaded.body.id}/download`)
      .set("Cookie", viewerCookies)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/v1/files/${uploaded.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    await expect(fs.access(storagePath)).rejects.toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/v1/sales/invoices/${invoice.body.id}`)
      .set("Cookie", cookies)
      .send({
        status: "ISSUED"
      })
      .expect(200);

    await request(app.getHttpServer())
      .post("/v1/files/upload")
      .set("Cookie", cookies)
      .field("relatedType", "sales-invoice")
      .field("relatedId", invoice.body.id)
      .attach("file", Buffer.from("late-file"), {
        filename: "late.txt",
        contentType: "text/plain"
      })
      .expect(400);
  });

  it("returns live core-v1 reports and charts data and enforces read-only permissions", async () => {
    const cookies = await signIn("viewer@daftar.local");
    const labsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" }
    });
    const labsInvoice = await prisma.salesInvoice.findFirstOrThrow({
      where: { organizationId: labsOrg.id }
    });
    const labsCustomer = await prisma.contact.findFirstOrThrow({
      where: { organizationId: labsOrg.id, isCustomer: true }
    });

    const reports = await request(app.getHttpServer())
      .get("/v1/reports/dashboard")
      .set("Cookie", cookies)
      .expect(200);
    expect(Number(reports.body.executiveSummary.totalSales)).toBeGreaterThan(0);
    expect(reports.body.contactTransactions.length).toBeGreaterThan(0);

    const charts = await request(app.getHttpServer())
      .get("/v1/charts/dashboard")
      .set("Cookie", cookies)
      .expect(200);
    expect(charts.body.bankBalances.length).toBeGreaterThan(0);
    expect(charts.body.salesPurchases.length).toBeGreaterThan(0);

    const compliance = await request(app.getHttpServer())
      .get("/v1/compliance/overview")
      .set("Cookie", cookies)
      .expect(200);
    expect(compliance.body.totalReportedDocuments).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .post("/v1/sales/invoices")
      .set("Cookie", cookies)
      .send({
        contactId: labsCustomer.id,
        status: "DRAFT",
        complianceInvoiceKind: "STANDARD",
        issueDate: "2026-04-12T09:00:00.000Z",
        dueDate: "2026-04-20T09:00:00.000Z",
        currencyCode: "USD",
        lines: [{ description: "Forbidden", quantity: "1", unitPrice: "10.00" }]
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/compliance/invoices/${labsInvoice.id}/report`)
      .set("Cookie", cookies)
      .expect(403);
  });
});
