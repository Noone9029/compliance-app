import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "@daftar/config";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApp } from "./bootstrap";
import {
  decodeConnectorState,
  encodeConnectorState,
  hashConnectorSecret
} from "./modules/connectors/connector-state";

describe.sequential("Daftar Week 13 connector guardrails", () => {
  const env = loadEnv();
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

  async function createConnectorInvoice(input: {
    organizationId: string;
    contactId: string;
    connectorAccountId: string;
    provider: "XERO" | "QUICKBOOKS_ONLINE" | "ZOHO_BOOKS";
    status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID";
    suffix: string;
  }) {
    return prisma.salesInvoice.create({
      data: {
        organizationId: input.organizationId,
        contactId: input.contactId,
        invoiceNumber: `INV-CNX-${input.suffix}`,
        status: input.status,
        complianceInvoiceKind: "STANDARD",
        issueDate: new Date("2026-04-21T10:00:00.000Z"),
        dueDate: new Date("2026-05-01T10:00:00.000Z"),
        currencyCode: "SAR",
        subtotal: "100.00",
        taxTotal: "15.00",
        total: "115.00",
        amountPaid: input.status === "PAID" ? "115.00" : "0.00",
        amountDue: input.status === "PAID" || input.status === "VOID" ? "0.00" : "115.00",
        sourceConnectorAccountId: input.connectorAccountId,
        sourceProvider: input.provider,
        sourceExternalId: `ext-${input.suffix}`,
        sourcePayload: {
          testCase: "week13-sync-guardrail",
          status: input.status
        },
        lines: {
          create: [
            {
              description: "Connector import service line",
              quantity: "1.00",
              unitPrice: "100.00",
              taxRateName: "VAT 15%",
              taxRatePercent: "15.00",
              lineSubtotal: "100.00",
              lineTax: "15.00",
              lineTotal: "115.00",
              sortOrder: 0,
            },
          ],
        },
      }
    });
  }

  async function createStoredConnectorState(input: {
    organizationId: string;
    userId: string;
    provider: "XERO" | "QUICKBOOKS_ONLINE" | "ZOHO_BOOKS";
    nonce: string;
  }) {
    const state = encodeConnectorState(input);
    const decoded = decodeConnectorState(state);

    await prisma.connectorOAuthState.create({
      data: {
        organizationId: decoded.organizationId,
        userId: decoded.userId,
        provider: decoded.provider,
        nonceHash: hashConnectorSecret(decoded.nonce),
        issuedAt: new Date(decoded.issuedAt),
        expiresAt: new Date(decoded.expiresAt)
      }
    });

    return state;
  }

  async function ensureSandboxComplianceIntegration(organizationId: string) {
    await prisma.organizationSetting.upsert({
      where: {
        organizationId_key: {
          organizationId,
          key: "week10.einvoice.integration"
        }
      },
      update: {
        value: { environment: "Sandbox" }
      },
      create: {
        organizationId,
        key: "week10.einvoice.integration",
        value: { environment: "Sandbox" }
      }
    });
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const organization = await prisma.organization.findUnique({
      where: { slug: "nomad-events" },
      select: { id: true }
    });

    if (organization) {
      await prisma.organizationSetting.deleteMany({
        where: {
          organizationId: organization.id,
          key: "week10.einvoice.integration"
        }
      });
    }
  });

  it("strips secret connector metadata from account responses", async () => {
    const cookies = await signIn("owner@daftar.local");
    await switchOrg(cookies, "nomad-events");
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const seededAccount = await prisma.connectorAccount.findFirstOrThrow({
      where: { organizationId: organization.id },
      orderBy: { createdAt: "asc" }
    });

    await prisma.connectorAccount.update({
      where: { id: seededAccount.id },
      data: {
        metadata: {
          accessToken: "should-not-leak",
          refreshToken: "should-not-leak",
          expiresAt: "2026-04-21T00:00:00.000Z",
          raw: {
            providerPayload: {
              token: "should-not-leak"
            }
          }
        }
      }
    });

    const response = await request(app.getHttpServer())
      .get("/v1/connectors/accounts")
      .set("Cookie", cookies)
      .expect(200);

    expect(response.body.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("should-not-leak");
    expect(serialized).not.toMatch(
      /accessToken|refreshToken|expiresAt|providerPayload|token/i
    );

    for (const account of response.body as Array<{
      scopes: unknown;
      metadata?: unknown;
    }>) {
      expect("metadata" in account).toBe(false);
      expect(Array.isArray(account.scopes)).toBe(true);
      expect((account.scopes as unknown[]).every((scope) => typeof scope === "string")).toBe(true);
    }
  });

  it("returns a Zoho connect URL now that Zoho connect flow is enabled", async () => {
    const cookies = await signIn("owner@daftar.local");
    await switchOrg(cookies, "nomad-events");

    const response = await request(app.getHttpServer())
      .get("/v1/connectors/providers/ZOHO_BOOKS/connect-url")
      .set("Cookie", cookies)
      .expect(200);

    const authorizationUrl = new URL(String(response.body.authorizationUrl));
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      "https://accounts.zoho.com/oauth/v2/auth"
    );
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      new URL("/connectors/callback", env.APP_BASE_URL).toString()
    );
  });

  it("rejects QuickBooks callback when realmId is missing", async () => {
    const ownerEmail = "owner@daftar.local";
    const cookies = await signIn(ownerEmail);
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: ownerEmail }
    });

    await switchOrg(cookies, "nomad-events");

    const state = await createStoredConnectorState({
      organizationId: organization.id,
      userId: owner.id,
      provider: "QUICKBOOKS_ONLINE",
      nonce: `week13-realm-required-${Date.now()}`
    });

    const response = await request(app.getHttpServer())
      .post("/v1/connectors/providers/QUICKBOOKS_ONLINE/callback")
      .set("Cookie", cookies)
      .send({
        code: "dummy-authorization-code",
        state,
        redirectUri: "https://malicious.example.com/callback"
      })
      .expect(400);

    expect(String(response.body.message)).toMatch(/missing realmId/i);
  });

  it("explicitly disables connector exports without creating export logs", async () => {
    const cookies = await signIn("owner@daftar.local");
    await switchOrg(cookies, "nomad-events");

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const connectorAccount = await prisma.connectorAccount.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        provider: "XERO"
      },
      orderBy: { createdAt: "asc" }
    });
    const exportLogCountBefore = await prisma.connectorSyncLog.count({
      where: {
        organizationId: organization.id,
        connectorAccountId: connectorAccount.id,
        direction: "EXPORT"
      }
    });

    const previewResponse = await request(app.getHttpServer())
      .get(`/v1/connectors/accounts/${connectorAccount.id}/export-preview`)
      .set("Cookie", cookies)
      .expect(501);

    expect(String(previewResponse.body.message)).toBe(
      "Connector exports are not implemented yet."
    );

    const syncResponse = await request(app.getHttpServer())
      .post(`/v1/connectors/accounts/${connectorAccount.id}/sync`)
      .set("Cookie", cookies)
      .send({ direction: "EXPORT" })
      .expect(501);

    expect(String(syncResponse.body.message)).toBe(
      "Connector exports are not implemented yet."
    );

    const exportLogCountAfter = await prisma.connectorSyncLog.count({
      where: {
        organizationId: organization.id,
        connectorAccountId: connectorAccount.id,
        direction: "EXPORT"
      }
    });
    expect(exportLogCountAfter).toBe(exportLogCountBefore);

    const missingPreviewResponse = await request(app.getHttpServer())
      .get("/v1/connectors/accounts/missing-connector-account/export-preview")
      .set("Cookie", cookies);

    expect(missingPreviewResponse.status).not.toBe(501);
  });

  it("queues only eligible connector invoices and follows the real compliance queue path", async () => {
    const cookies = await signIn("owner@daftar.local");
    await switchOrg(cookies, "nomad-events");

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    await ensureSandboxComplianceIntegration(organization.id);
    const connectorAccount = await prisma.connectorAccount.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        provider: "XERO"
      },
      orderBy: { createdAt: "asc" }
    });
    await prisma.connectorCredential.deleteMany({
      where: {
        connectorAccountId: connectorAccount.id,
      },
    });
    const contact = await prisma.contact.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        isCustomer: true
      },
      orderBy: { createdAt: "asc" }
    });

    const now = Date.now();
    const draftInvoice = await createConnectorInvoice({
      organizationId: organization.id,
      contactId: contact.id,
      connectorAccountId: connectorAccount.id,
      provider: "XERO",
      status: "DRAFT",
      suffix: `${now}-draft`
    });
    const voidInvoice = await createConnectorInvoice({
      organizationId: organization.id,
      contactId: contact.id,
      connectorAccountId: connectorAccount.id,
      provider: "XERO",
      status: "VOID",
      suffix: `${now}-void`
    });
    const eligibleInvoice = await createConnectorInvoice({
      organizationId: organization.id,
      contactId: contact.id,
      connectorAccountId: connectorAccount.id,
      provider: "XERO",
      status: "ISSUED",
      suffix: `${now}-eligible`
    });

    const syncResponse = await request(app.getHttpServer())
      .post(`/v1/connectors/accounts/${connectorAccount.id}/sync`)
      .set("Cookie", cookies)
      .send({ direction: "IMPORT" })
      .expect(201);

    expect(syncResponse.body.ok).toBe(true);
    expect(syncResponse.body.mode).toBe("bootstrap");
    expect(syncResponse.body.compliance).toBeTruthy();
    expect(syncResponse.body.compliance.queued).toBeGreaterThanOrEqual(1);

    const [draftCompliance, voidCompliance, eligibleCompliance] = await Promise.all([
      prisma.complianceDocument.findFirst({
        where: {
          organizationId: organization.id,
          salesInvoiceId: draftInvoice.id
        }
      }),
      prisma.complianceDocument.findFirst({
        where: {
          organizationId: organization.id,
          salesInvoiceId: voidInvoice.id
        }
      }),
      prisma.complianceDocument.findFirst({
        where: {
          organizationId: organization.id,
          salesInvoiceId: eligibleInvoice.id
        },
        include: {
          submission: true,
          events: {
            where: { action: "compliance.invoice.queued" }
          }
        }
      })
    ]);

    expect(draftCompliance).toBeNull();
    expect(voidCompliance).toBeNull();

    expect(eligibleCompliance).toBeTruthy();
    expect(["QUEUED", "PROCESSING"]).toContain(eligibleCompliance?.status);
    expect(["QUEUED", "PROCESSING"]).toContain(
      eligibleCompliance?.lastSubmissionStatus
    );
    expect(["QUEUED", "PROCESSING"]).toContain(
      eligibleCompliance?.submission?.status
    );
    expect(eligibleCompliance?.events.length).toBeGreaterThan(0);
  }, 15000);

  it("runs Xero live import with mocked provider responses when credentials exist", async () => {
    const ownerEmail = "owner@daftar.local";
    const cookies = await signIn(ownerEmail);
    await switchOrg(cookies, "nomad-events");

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: ownerEmail }
    });

    const state = await createStoredConnectorState({
      organizationId: organization.id,
      userId: owner.id,
      provider: "XERO",
      nonce: `week13-xero-live-${Date.now()}`
    });

    const fetchMock = vi.fn(async (url: URL | string) => {
      const target = String(url);

      if (target.includes("identity.xero.com/connect/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "xero-live-access",
            refresh_token: "xero-live-refresh",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "offline_access accounting.transactions accounting.contacts"
          })
        };
      }

      if (target.includes("api.xero.com/connections")) {
        return {
          ok: true,
          json: async () => [
            {
              tenantId: "xero-tenant-live-123",
              tenantName: "Nomad Events Xero",
              tenantType: "ORGANISATION"
            }
          ]
        };
      }

      if (target.includes("/api.xro/2.0/Contacts")) {
        return {
          ok: true,
          json: async () => ({
            Contacts: [
              {
                ContactID: "xero-contact-live-1",
                Name: "Live Sync Customer",
                EmailAddress: "live.customer@example.com",
                Phones: [{ PhoneNumber: "+966500000501" }],
                IsCustomer: true,
                IsSupplier: false,
                DefaultCurrency: "SAR",
                TaxNumber: "300123456700003"
              }
            ]
          })
        };
      }

      if (target.includes("/api.xro/2.0/Invoices")) {
        const suffix = Date.now();
        return {
          ok: true,
          json: async () => ({
            Invoices: [
              {
                InvoiceID: `xero-live-invoice-${suffix}`,
                InvoiceNumber: `XERO-LIVE-${suffix}`,
                Type: "ACCREC",
                Status: "AUTHORISED",
                DateString: "2026-04-21T00:00:00",
                DueDateString: "2026-04-30T00:00:00",
                CurrencyCode: "SAR",
                Contact: {
                  ContactID: "xero-contact-live-1",
                  Name: "Live Sync Customer"
                },
                SubTotal: 100,
                TotalTax: 15,
                Total: 115,
                AmountDue: 115,
                LineItems: [
                  {
                    LineItemID: `xero-live-line-${suffix}`,
                    Description: "Live import service line",
                    Quantity: 1,
                    UnitAmount: 100,
                    LineAmount: 100,
                    TaxAmount: 15,
                    TaxType: "OUTPUT2",
                    ItemCode: "LIVE-SVC-1"
                  }
                ]
              }
            ]
          })
        };
      }

      return {
        ok: false,
        status: 500,
        text: async () => `Unexpected mocked fetch target: ${target}`
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = await request(app.getHttpServer())
      .post("/v1/connectors/providers/XERO/callback")
      .set("Cookie", cookies)
      .send({
        code: "xero-auth-code",
        state
      })
      .expect(201);

    expect(callbackResponse.body.provider).toBe("XERO");
    expect(callbackResponse.body.externalTenantId).toBe("xero-tenant-live-123");

    const syncResponse = await request(app.getHttpServer())
      .post(`/v1/connectors/accounts/${callbackResponse.body.id}/sync`)
      .set("Cookie", cookies)
      .send({ direction: "IMPORT" })
      .expect(201);

    expect(syncResponse.body.ok).toBe(true);
    expect(syncResponse.body.mode).toBe("xero-live");
    expect(syncResponse.body.imported.contacts).toBeGreaterThanOrEqual(1);
    expect(syncResponse.body.imported.invoices).toBeGreaterThanOrEqual(1);

    const importedInvoice = await prisma.salesInvoice.findFirst({
      where: {
        organizationId: organization.id,
        sourceConnectorAccountId: callbackResponse.body.id,
        sourceProvider: "XERO"
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    expect(importedInvoice).toBeTruthy();
    expect(importedInvoice?.status).toBe("ISSUED");
    expect(Number(importedInvoice?.total ?? 0)).toBeCloseTo(115, 2);
  }, 15000);

  it("runs Zoho live import with mocked provider responses and persists api_domain per credential", async () => {
    const ownerEmail = "owner@daftar.local";
    const cookies = await signIn(ownerEmail);
    await switchOrg(cookies, "nomad-events");

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: ownerEmail }
    });

    const state = await createStoredConnectorState({
      organizationId: organization.id,
      userId: owner.id,
      provider: "ZOHO_BOOKS",
      nonce: `week13-zoho-live-${Date.now()}`
    });

    const zohoApiDomain = "https://www.zohoapis.eu";
    const zohoOrgId = "zoho-org-live-123";

    const fetchMock = vi.fn(async (url: URL | string) => {
      const target = String(url);

      if (target.includes("accounts.zoho.com/oauth/v2/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "zoho-live-access",
            refresh_token: "zoho-live-refresh",
            expires_in: 3600,
            token_type: "Bearer",
            api_domain: zohoApiDomain,
            scope: "ZohoBooks.fullaccess.all offline_access"
          })
        };
      }

      if (target.includes(`${zohoApiDomain}/books/v3/organizations`)) {
        return {
          ok: true,
          json: async () => ({
            organizations: [
              {
                organization_id: zohoOrgId,
                name: "Nomad Events Zoho",
                is_default_org: true
              }
            ]
          })
        };
      }

      if (target.includes(`${zohoApiDomain}/books/v3/contacts`)) {
        return {
          ok: true,
          json: async () => ({
            contacts: [
              {
                contact_id: "zoho-contact-live-1",
                contact_name: "Zoho Live Customer",
                email: "zoho.live.customer@example.com",
                phone: "+966500000701",
                is_customer: true,
                is_vendor: false,
                currency_code: "SAR",
                tax_number: "300987654300003"
              }
            ]
          })
        };
      }

      if (target.includes(`${zohoApiDomain}/books/v3/invoices`)) {
        const suffix = Date.now();

        return {
          ok: true,
          json: async () => ({
            invoices: [
              {
                invoice_id: `zoho-live-invoice-${suffix}`,
                invoice_number: `ZOHO-LIVE-${suffix}`,
                status: "open",
                date: "2026-04-21",
                due_date: "2026-04-30",
                currency_code: "SAR",
                customer_id: "zoho-contact-live-1",
                customer_name: "Zoho Live Customer",
                sub_total: 100,
                tax_total: 15,
                total: 115,
                balance: 115,
                line_items: [
                  {
                    line_item_id: `zoho-live-line-${suffix}`,
                    name: "Live import service line",
                    description: "Live import service line",
                    quantity: 1,
                    rate: 100,
                    item_total: 100,
                    tax_amount: 15,
                    tax_name: "VAT",
                    tax_percentage: 15
                  }
                ]
              }
            ]
          })
        };
      }

      return {
        ok: false,
        status: 500,
        text: async () => `Unexpected mocked fetch target: ${target}`
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = await request(app.getHttpServer())
      .post("/v1/connectors/providers/ZOHO_BOOKS/callback")
      .set("Cookie", cookies)
      .send({
        code: "zoho-auth-code",
        state
      })
      .expect(201);

    expect(callbackResponse.body.provider).toBe("ZOHO_BOOKS");
    expect(callbackResponse.body.externalTenantId).toBe(zohoOrgId);

    const storedCredential = await prisma.connectorCredential.findUnique({
      where: {
        connectorAccountId: callbackResponse.body.id
      },
      select: {
        credentialMetadata: true
      }
    });

    expect(storedCredential?.credentialMetadata).toEqual({
      apiDomain: zohoApiDomain
    });

    const syncResponse = await request(app.getHttpServer())
      .post(`/v1/connectors/accounts/${callbackResponse.body.id}/sync`)
      .set("Cookie", cookies)
      .send({ direction: "IMPORT" })
      .expect(201);

    expect(syncResponse.body.ok).toBe(true);
    expect(syncResponse.body.mode).toBe("zoho-live");
    expect(syncResponse.body.imported.contacts).toBeGreaterThanOrEqual(1);
    expect(syncResponse.body.imported.invoices).toBeGreaterThanOrEqual(1);

    const fetchTargets = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(
      fetchTargets.some((target) =>
        target.includes(`${zohoApiDomain}/books/v3/contacts`)
      )
    ).toBe(true);
    expect(
      fetchTargets.some((target) =>
        target.includes(`${zohoApiDomain}/books/v3/invoices`)
      )
    ).toBe(true);

    const importedInvoice = await prisma.salesInvoice.findFirst({
      where: {
        organizationId: organization.id,
        sourceConnectorAccountId: callbackResponse.body.id,
        sourceProvider: "ZOHO_BOOKS"
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    expect(importedInvoice).toBeTruthy();
    expect(importedInvoice?.status).toBe("ISSUED");
    expect(Number(importedInvoice?.total ?? 0)).toBeCloseTo(115, 2);
  }, 15000);

  it("refreshes Zoho token without api_domain and still imports from persisted regional api_domain", async () => {
    const ownerEmail = "owner@daftar.local";
    const cookies = await signIn(ownerEmail);
    await switchOrg(cookies, "nomad-events");

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "nomad-events" }
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: ownerEmail }
    });

    const state = await createStoredConnectorState({
      organizationId: organization.id,
      userId: owner.id,
      provider: "ZOHO_BOOKS",
      nonce: `week13-zoho-refresh-${Date.now()}`
    });

    const zohoApiDomain = "https://www.zohoapis.eu";
    const defaultZohoApiDomain = "https://www.zohoapis.com";
    const zohoOrgId = "zoho-org-refresh-123";

    const fetchMock = vi.fn(
      async (url: URL | string, init?: RequestInit) => {
        const target = String(url);

        if (target.includes("accounts.zoho.com/oauth/v2/token")) {
          const body =
            typeof init?.body === "string"
              ? init.body
              : init?.body instanceof URLSearchParams
                ? init.body.toString()
                : "";

          if (body.includes("grant_type=authorization_code")) {
            return {
              ok: true,
              json: async () => ({
                access_token: "zoho-refresh-test-access-initial",
                refresh_token: "zoho-refresh-test-refresh",
                expires_in: 3600,
                token_type: "Bearer",
                api_domain: zohoApiDomain,
                scope: "ZohoBooks.fullaccess.all offline_access"
              })
            };
          }

          if (body.includes("grant_type=refresh_token")) {
            return {
              ok: true,
              json: async () => ({
                access_token: "zoho-refresh-test-access-rotated",
                refresh_token: "zoho-refresh-test-refresh-rotated",
                expires_in: 3600,
                token_type: "Bearer",
                scope: "ZohoBooks.fullaccess.all offline_access"
              })
            };
          }
        }

        if (target.includes(`${zohoApiDomain}/books/v3/organizations`)) {
          return {
            ok: true,
            json: async () => ({
              organizations: [
                {
                  organization_id: zohoOrgId,
                  name: "Nomad Events Zoho Refresh",
                  is_default_org: true
                }
              ]
            })
          };
        }

        if (target.includes(`${zohoApiDomain}/books/v3/contacts`)) {
          return {
            ok: true,
            json: async () => ({
              contacts: [
                {
                  contact_id: "zoho-refresh-contact-1",
                  contact_name: "Zoho Refresh Customer",
                  email: "zoho.refresh.customer@example.com",
                  phone: "+966500000801",
                  is_customer: true,
                  is_vendor: false,
                  currency_code: "SAR",
                  tax_number: "300222333400003"
                }
              ]
            })
          };
        }

        if (target.includes(`${zohoApiDomain}/books/v3/invoices`)) {
          const suffix = Date.now();

          return {
            ok: true,
            json: async () => ({
              invoices: [
                {
                  invoice_id: `zoho-refresh-invoice-${suffix}`,
                  invoice_number: `ZOHO-REFRESH-${suffix}`,
                  status: "open",
                  date: "2026-04-21",
                  due_date: "2026-04-30",
                  currency_code: "SAR",
                  customer_id: "zoho-refresh-contact-1",
                  customer_name: "Zoho Refresh Customer",
                  sub_total: 100,
                  tax_total: 15,
                  total: 115,
                  balance: 115,
                  line_items: [
                    {
                      line_item_id: `zoho-refresh-line-${suffix}`,
                      name: "Refresh import service line",
                      description: "Refresh import service line",
                      quantity: 1,
                      rate: 100,
                      item_total: 100,
                      tax_amount: 15,
                      tax_name: "VAT",
                      tax_percentage: 15
                    }
                  ]
                }
              ]
            })
          };
        }

        return {
          ok: false,
          status: 500,
          text: async () => `Unexpected mocked fetch target: ${target}`
        };
      }
    );

    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = await request(app.getHttpServer())
      .post("/v1/connectors/providers/ZOHO_BOOKS/callback")
      .set("Cookie", cookies)
      .send({
        code: "zoho-refresh-auth-code",
        state
      })
      .expect(201);

    await prisma.connectorCredential.update({
      where: {
        connectorAccountId: callbackResponse.body.id
      },
      data: {
        expiresAt: new Date(Date.now() - 5 * 60 * 1000)
      }
    });

    const syncResponse = await request(app.getHttpServer())
      .post(`/v1/connectors/accounts/${callbackResponse.body.id}/sync`)
      .set("Cookie", cookies)
      .send({ direction: "IMPORT" })
      .expect(201);

    expect(syncResponse.body.ok).toBe(true);
    expect(syncResponse.body.mode).toBe("zoho-live");
    expect(syncResponse.body.imported.contacts).toBeGreaterThanOrEqual(1);
    expect(syncResponse.body.imported.invoices).toBeGreaterThanOrEqual(1);

    const fetchTargets = fetchMock.mock.calls.map((call) => String(call[0]));

    expect(
      fetchTargets.some((target) =>
        target.includes(`${zohoApiDomain}/books/v3/contacts`)
      )
    ).toBe(true);
    expect(
      fetchTargets.some((target) =>
        target.includes(`${zohoApiDomain}/books/v3/invoices`)
      )
    ).toBe(true);
    expect(
      fetchTargets.some((target) =>
        target.includes(`${defaultZohoApiDomain}/books/v3/`)
      )
    ).toBe(false);

    const tokenCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("accounts.zoho.com/oauth/v2/token")
    );
    expect(tokenCalls).toHaveLength(2);

    const refreshCalls = tokenCalls.filter((call) => {
      const body =
        typeof call[1]?.body === "string"
          ? call[1].body
          : call[1]?.body instanceof URLSearchParams
            ? call[1].body.toString()
            : "";
      return body.includes("grant_type=refresh_token");
    });
    expect(refreshCalls).toHaveLength(1);

    const storedCredential = await prisma.connectorCredential.findUnique({
      where: {
        connectorAccountId: callbackResponse.body.id
      },
      select: {
        credentialMetadata: true,
        rotationCount: true
      }
    });

    expect(storedCredential?.credentialMetadata).toEqual({
      apiDomain: zohoApiDomain
    });
    expect(storedCredential?.rotationCount).toBeGreaterThanOrEqual(1);
  }, 15000);
});
