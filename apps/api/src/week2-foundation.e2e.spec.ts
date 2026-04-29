import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { createApp } from "./bootstrap";

describe.sequential("Daftar Week 2 foundation", () => {
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

  it("supports setup master CRUD and singleton settings", async () => {
    const cookies = await signIn("admin@daftar.local");

    const currenciesBefore = await request(app.getHttpServer())
      .get("/v1/setup/currencies")
      .set("Cookie", cookies)
      .expect(200);
    expect(currenciesBefore.body.length).toBeGreaterThan(0);

    const createdCurrency = await request(app.getHttpServer())
      .post("/v1/setup/currencies")
      .set("Cookie", cookies)
      .send({
        code: "EUR",
        name: "Euro",
        symbol: "EUR",
        exchangeRate: "4.020000",
        isBase: false,
        isActive: true
      })
      .expect(201);
    expect(createdCurrency.body.code).toBe("EUR");

    const updatedCurrency = await request(app.getHttpServer())
      .patch(`/v1/setup/currencies/${createdCurrency.body.id}`)
      .set("Cookie", cookies)
      .send({
        name: "Euro Updated",
        exchangeRate: "4.010000"
      })
      .expect(200);
    expect(updatedCurrency.body.name).toBe("Euro Updated");

    const createdTaxRate = await request(app.getHttpServer())
      .post("/v1/setup/tax-rates")
      .set("Cookie", cookies)
      .send({
        name: "Services VAT",
        code: "SVAT",
        rate: "5.00",
        scope: "SALES",
        isDefault: false,
        isActive: true
      })
      .expect(201);
    expect(createdTaxRate.body.scope).toBe("SALES");

    const updatedTaxRate = await request(app.getHttpServer())
      .patch(`/v1/setup/tax-rates/${createdTaxRate.body.id}`)
      .set("Cookie", cookies)
      .send({
        rate: "7.50",
        isActive: false
      })
      .expect(200);
    expect(updatedTaxRate.body.rate).toBe("7.5");
    expect(updatedTaxRate.body.isActive).toBe(false);

    const taxDetails = await request(app.getHttpServer())
      .put("/v1/setup/organisation-tax-details")
      .set("Cookie", cookies)
      .send({
        legalName: "Nomad Events Arabia Limited",
        taxNumber: "300123456700003",
        countryCode: "SA",
        taxOffice: "Riyadh ZATCA Updated",
        registrationNumber: "CR-1010998877",
        addressLine1: "King Fahd Road",
        addressLine2: "Tower A",
        city: "Riyadh",
        postalCode: "12211"
      })
      .expect(200);
    expect(taxDetails.body.taxOffice).toContain("Updated");

    const createdTrackingCategory = await request(app.getHttpServer())
      .post("/v1/setup/tracking-categories")
      .set("Cookie", cookies)
      .send({
        name: "Campaign",
        description: "Marketing campaign tag",
        isActive: true,
        options: [
          { name: "Launch", color: "#2563eb", isActive: true },
          { name: "Retention", color: "#16a34a", isActive: true }
        ]
      })
      .expect(201);
    expect(createdTrackingCategory.body.options).toHaveLength(2);

    const updatedTrackingCategory = await request(app.getHttpServer())
      .patch(`/v1/setup/tracking-categories/${createdTrackingCategory.body.id}`)
      .set("Cookie", cookies)
      .send({
        description: "Updated campaign tag",
        options: [{ name: "Upsell", color: "#9333ea", isActive: true }]
      })
      .expect(200);
    expect(updatedTrackingCategory.body.options).toHaveLength(1);

    const createdBankAccount = await request(app.getHttpServer())
      .post("/v1/setup/bank-accounts")
      .set("Cookie", cookies)
      .send({
        name: "Collections Account",
        bankName: "Saudi National Bank",
        accountName: "Nomad Events Arabia Limited",
        accountNumberMasked: "****9911",
        iban: "SA5520000001234567890456",
        currencyCode: "SAR",
        openingBalance: "12500.00",
        isPrimary: false,
        isActive: true
      })
      .expect(201);
    expect(createdBankAccount.body.bankName).toBe("Saudi National Bank");

    const updatedBankAccount = await request(app.getHttpServer())
      .patch(`/v1/setup/bank-accounts/${createdBankAccount.body.id}`)
      .set("Cookie", cookies)
      .send({
        isPrimary: true
      })
      .expect(200);
    expect(updatedBankAccount.body.isPrimary).toBe(true);

    const createdAccount = await request(app.getHttpServer())
      .post("/v1/setup/chart-of-accounts")
      .set("Cookie", cookies)
      .send({
        code: "6200",
        name: "Software Subscriptions",
        type: "EXPENSE",
        description: "Subscription overhead",
        isSystem: false,
        isActive: true
      })
      .expect(201);
    expect(createdAccount.body.code).toBe("6200");

    const updatedAccount = await request(app.getHttpServer())
      .patch(`/v1/setup/chart-of-accounts/${createdAccount.body.id}`)
      .set("Cookie", cookies)
      .send({
        description: "Subscription overhead updated"
      })
      .expect(200);
    expect(updatedAccount.body.description).toContain("updated");

    const invoiceSettings = await request(app.getHttpServer())
      .put("/v1/setup/invoice-settings")
      .set("Cookie", cookies)
      .send({
        invoicePrefix: "INV-ADM",
        defaultDueDays: 21,
        footerNote: "Week 2 footer",
        whatsappEnabled: true
      })
      .expect(200);
    expect(invoiceSettings.body.invoicePrefix).toBe("INV-ADM");

    const emailTemplate = await request(app.getHttpServer())
      .post("/v1/setup/email-templates")
      .set("Cookie", cookies)
      .send({
        key: "quote-reminder",
        name: "Quote Reminder",
        subject: "Quote reminder",
        body: "Please review the attached quote.",
        isDefault: false,
        isActive: true
      })
      .expect(201);
    expect(emailTemplate.body.key).toBe("quote-reminder");

    const updatedEmailTemplate = await request(app.getHttpServer())
      .patch(`/v1/setup/email-templates/${emailTemplate.body.id}`)
      .set("Cookie", cookies)
      .send({
        subject: "Updated quote reminder"
      })
      .expect(200);
    expect(updatedEmailTemplate.body.subject).toContain("Updated");

    const customSettings = await request(app.getHttpServer())
      .put("/v1/setup/custom-organisation-settings")
      .set("Cookie", cookies)
      .send({
        defaultLanguage: "ar",
        timezone: "Asia/Riyadh",
        fiscalYearStartMonth: 4,
        notes: "Week 2 custom settings"
      })
      .expect(200);
    expect(customSettings.body.defaultLanguage).toBe("ar");

    const auditActions = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            "setup.currency.create",
            "setup.tax_rate.create",
            "setup.bank_account.create",
            "setup.account.create",
            "setup.email_template.create"
          ]
        }
      }
    });
    expect(auditActions.length).toBeGreaterThanOrEqual(5);
  });

  it("supports contacts CRUD, groups, files on detail view, and tenant isolation", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const otherOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" }
    });
    const otherOrgContact = await prisma.contact.findFirstOrThrow({
      where: { organizationId: otherOrg.id }
    });

    const createdGroup = await request(app.getHttpServer())
      .post("/v1/contact-groups")
      .set("Cookie", cookies)
      .send({
        name: "Priority Accounts",
        description: "Top priority customer group"
      })
      .expect(201);
    expect(createdGroup.body.memberCount).toBe(0);

    const updatedGroup = await request(app.getHttpServer())
      .patch(`/v1/contact-groups/${createdGroup.body.id}`)
      .set("Cookie", cookies)
      .send({
        description: "Updated priority group"
      })
      .expect(200);
    expect(updatedGroup.body.description).toContain("Updated");

    const createdContact = await request(app.getHttpServer())
      .post("/v1/contacts")
      .set("Cookie", cookies)
      .send({
        displayName: "Week 2 Contact",
        companyName: "Week 2 Contact LLC",
        email: "finance@week2.example",
        taxNumber: "310000000000003",
        customerCode: "CUS-W2",
        isCustomer: true,
        isSupplier: false,
        currencyCode: "SAR",
        paymentTermsDays: 30,
        notes: "Created in Week 2 test",
        receivableBalance: "1500.00",
        payableBalance: "0.00",
        addresses: [
          {
            type: "BILLING",
            line1: "King Road 45",
            city: "Riyadh",
            state: "Riyadh Province",
            postalCode: "12211",
            countryCode: "SA"
          }
        ],
        numbers: [{ label: "Main", phoneNumber: "+966500000001" }],
        groupIds: [createdGroup.body.id]
      })
      .expect(201);
    expect(createdContact.body.groupNames).toContain("Priority Accounts");

    const createdFile = await request(app.getHttpServer())
      .post("/v1/files")
      .set("Cookie", cookies)
      .send({
        originalFileName: "contact-note.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        checksumSha256: "contact-note-sha",
        relatedType: "contact",
        relatedId: createdContact.body.id,
        metadata: { label: "Credit application" }
      })
      .expect(201);
    expect(createdFile.body.relatedId).toBe(createdContact.body.id);

    const contactDetail = await request(app.getHttpServer())
      .get(`/v1/contacts/${createdContact.body.id}`)
      .set("Cookie", cookies)
      .expect(200);
    expect(contactDetail.body.addresses).toHaveLength(1);
    expect(contactDetail.body.files.some((file: { id: string }) => file.id === createdFile.body.id)).toBe(
      true
    );

    const updatedContact = await request(app.getHttpServer())
      .patch(`/v1/contacts/${createdContact.body.id}`)
      .set("Cookie", cookies)
      .send({
        isSupplier: true,
        supplierCode: "SUP-W2",
        notes: "Updated in Week 2 test",
        numbers: [{ label: "Finance", phoneNumber: "+966500000002" }],
        groupIds: [createdGroup.body.id]
      })
      .expect(200);
    expect(updatedContact.body.isSupplier).toBe(true);
    expect(updatedContact.body.supplierCode).toBe("SUP-W2");

    const customers = await request(app.getHttpServer())
      .get("/v1/contacts?segment=customers&search=Week 2")
      .set("Cookie", cookies)
      .expect(200);
    expect(customers.body.some((contact: { id: string }) => contact.id === createdContact.body.id)).toBe(
      true
    );

    const suppliers = await request(app.getHttpServer())
      .get("/v1/contacts?segment=suppliers&search=Week 2")
      .set("Cookie", cookies)
      .expect(200);
    expect(suppliers.body.some((contact: { id: string }) => contact.id === createdContact.body.id)).toBe(
      true
    );

    await request(app.getHttpServer())
      .get(`/v1/contacts/${otherOrgContact.id}`)
      .set("Cookie", cookies)
      .expect(404);

    const adminAudit = await prisma.auditLog.findMany({
      where: {
        organizationId: eventsOrg.id,
        action: {
          in: ["contacts.contact.create", "contacts.contact.update", "files.metadata.create"]
        }
      }
    });
    expect(adminAudit.length).toBeGreaterThanOrEqual(3);
  });

  it("supports connector readiness metadata and sync log listing", async () => {
    const cookies = await signIn("admin@daftar.local");
    const eventsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const existingZohoAccount = await prisma.connectorAccount.findFirstOrThrow({
      where: {
        organizationId: eventsOrg.id,
        provider: "ZOHO_BOOKS"
      }
    });

    const connectorAccounts = await request(app.getHttpServer())
      .get("/v1/connectors/accounts")
      .set("Cookie", cookies)
      .expect(200);
    expect(connectorAccounts.body.length).toBeGreaterThanOrEqual(2);
    expect(
      connectorAccounts.body.every(
        (account: { scopes: unknown; metadata?: unknown }) =>
          !("metadata" in account) &&
          Array.isArray(account.scopes) &&
          account.scopes.every((scope: unknown) => typeof scope === "string")
      )
    ).toBe(true);

    const preview = await request(app.getHttpServer())
      .get(`/v1/connectors/accounts/${existingZohoAccount.id}/export-preview`)
      .set("Cookie", cookies)
      .expect(501);
    expect(String(preview.body.message)).toBe(
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

    const logs = await request(app.getHttpServer())
      .get("/v1/connectors/logs")
      .set("Cookie", cookies)
      .expect(200);
    expect(logs.body.length).toBeGreaterThan(0);
  });

  it("enforces Week 2 permissions for viewer role", async () => {
    const cookies = await signIn("viewer@daftar.local");
    const labsOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-labs" }
    });
    const labsXeroAccount = await prisma.connectorAccount.findFirstOrThrow({
      where: {
        organizationId: labsOrg.id,
        provider: "XERO"
      }
    });

    await request(app.getHttpServer())
      .get("/v1/contacts")
      .set("Cookie", cookies)
      .expect(200);

    await request(app.getHttpServer())
      .get("/v1/files")
      .set("Cookie", cookies)
      .expect(200);

    await request(app.getHttpServer())
      .get("/v1/setup/currencies")
      .set("Cookie", cookies)
      .expect(403);

    await request(app.getHttpServer())
      .post("/v1/contacts")
      .set("Cookie", cookies)
      .send({
        displayName: "Forbidden Contact",
        isCustomer: true,
        isSupplier: false,
        receivableBalance: "0.00",
        payableBalance: "0.00",
        addresses: [],
        numbers: [],
        groupIds: []
      })
      .expect(403);

    await request(app.getHttpServer())
      .get("/v1/connectors/providers/XERO/connect-url")
      .query({
        redirectUri: "https://app.daftar.local/connectors/callback"
      })
      .set("Cookie", cookies)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/connectors/accounts/${labsXeroAccount.id}/sync`)
      .set("Cookie", cookies)
      .send({
        direction: "EXPORT"
      })
      .expect(403);

    await request(app.getHttpServer())
      .post("/v1/files")
      .set("Cookie", cookies)
      .send({
        originalFileName: "forbidden.txt",
        mimeType: "text/plain",
        sizeBytes: 10
      })
      .expect(403);
  });
});
