import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ConnectorProvider } from "@daftar/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SalesInvoiceStatus } from "@prisma/client";
import { ComplianceService } from "../compliance/compliance.service";

import { XeroAdapter } from "./xero.adapter";
import { QuickBooksAdapter } from "./quickbooks.adapter";
import { ZohoBooksAdapter } from "./zoho-books.adapter";

import { QuickBooksTransport } from "./quickbooks.transport";
import { QuickBooksApiClient } from "./quickbooks.api";
import { ConnectorCredentialsService } from "./connector-credentials.service";
import { XeroTransport } from "./xero.transport";
import { XeroApiClient } from "./xero.api";
import { ZohoTransport } from "./zoho.transport";
import { ZohoApiClient } from "./zoho.api";

import {
  createConnectorNonce,
  decodeConnectorState,
  encodeConnectorState,
  hashConnectorSecret
} from "./connector-state";

import type {
  ConnectorProviderTransport
} from "./provider-transport";

import type {
  ConnectorAdapter,
  CanonicalImportBundle
} from "./connector-adapter";

@Injectable()
export class ConnectorsService {
  private readonly adapters: Map<string, ConnectorAdapter>;
  private readonly transports: Map<string, ConnectorProviderTransport>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,

    @Inject(XeroAdapter) xeroAdapter: XeroAdapter,
    @Inject(QuickBooksAdapter) quickBooksAdapter: QuickBooksAdapter,
    @Inject(ZohoBooksAdapter) zohoBooksAdapter: ZohoBooksAdapter,

    @Inject(QuickBooksTransport) quickBooksTransport: QuickBooksTransport,
    @Inject(XeroTransport) xeroTransport: XeroTransport,
    @Inject(ZohoTransport) zohoTransport: ZohoTransport,
    @Inject(QuickBooksApiClient)
    private readonly quickBooksApiClient: QuickBooksApiClient,
    @Inject(XeroApiClient)
    private readonly xeroApiClient: XeroApiClient,
    @Inject(ZohoApiClient)
    private readonly zohoApiClient: ZohoApiClient,
    @Inject(ConnectorCredentialsService)
    private readonly connectorCredentials: ConnectorCredentialsService,
    @Inject(ComplianceService)
    private readonly complianceService: ComplianceService
  ) {
    const adapterEntries: Array<[string, ConnectorAdapter]> = [
      [xeroAdapter.provider, xeroAdapter],
      [quickBooksAdapter.provider, quickBooksAdapter],
      [zohoBooksAdapter.provider, zohoBooksAdapter]
    ];

    this.adapters = new Map(adapterEntries);

    const transportEntries: Array<[string, ConnectorProviderTransport]> = [
      [xeroTransport.provider, xeroTransport],
      [zohoTransport.provider, zohoTransport],
      [quickBooksTransport.provider, quickBooksTransport]
    ];

    this.transports = new Map(transportEntries);
  }

  /* =========================
     CONNECT FLOW
  ========================= */

  async getConnectUrl(input: {
    organizationId: string;
    userId: string;
    provider: ConnectorProvider;
    redirectUri: string;
  }) {
    const transport = this.getTransport(input.provider);
    const nonce = createConnectorNonce();
    const state = encodeConnectorState({
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      nonce
    });
    const decoded = decodeConnectorState(state);

    await this.prisma.connectorOAuthState.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        provider: input.provider,
        nonceHash: hashConnectorSecret(nonce),
        issuedAt: new Date(decoded.issuedAt),
        expiresAt: new Date(decoded.expiresAt)
      }
    });

    return transport.buildAuthorizationUrl({
      organizationId: input.organizationId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      state
    });
  }

  async completeConnection(input: {
    organizationId: string;
    userId: string;
    provider: ConnectorProvider;
    code: string;
    state: string;
    redirectUri: string;
    externalTenantId?: string | null;
  }) {
    let decoded: ReturnType<typeof decodeConnectorState>;

    try {
      decoded = decodeConnectorState(input.state);
    } catch (error) {
      throw new BadRequestException(
        this.errorMessage(error, "Invalid connector state")
      );
    }

    if (
      decoded.organizationId !== input.organizationId ||
      decoded.userId !== input.userId ||
      decoded.provider !== input.provider
    ) {
      throw new BadRequestException("Invalid connector state");
    }

    const transport = this.getTransport(input.provider);
    const providedExternalTenantId = input.externalTenantId?.trim() || null;

    if (input.provider === "QUICKBOOKS_ONLINE" && !providedExternalTenantId) {
      throw new BadRequestException(
        "QuickBooks callback is missing realmId. Reconnect and include realmId from the provider callback."
      );
    }

    await this.consumeConnectorState(decoded);

    const tokens = await transport.exchangeAuthorizationCode({
      organizationId: input.organizationId,
      userId: input.userId,
      code: input.code,
      redirectUri: input.redirectUri,
      externalTenantId: providedExternalTenantId
    });

    const externalTenantId =
      tokens.externalTenantId?.trim() || providedExternalTenantId;

    const account = await this.prisma.$transaction(async (tx) => {
      const connectorAccount = await tx.connectorAccount.upsert({
        where: {
          organizationId_provider: {
            organizationId: input.organizationId,
            provider: input.provider
          }
        },
        update: {
          status: "CONNECTED",
          displayName: tokens.displayName ?? input.provider,
          externalTenantId,
          connectedByUserId: input.userId,
          connectedAt: new Date(),
          scopes: tokens.scopes as Prisma.InputJsonValue
        },
        create: {
          organizationId: input.organizationId,
          provider: input.provider,
          status: "CONNECTED",
          displayName: tokens.displayName ?? input.provider,
          externalTenantId,
          connectedByUserId: input.userId,
          connectedAt: new Date(),
          scopes: tokens.scopes as Prisma.InputJsonValue
        }
      });

      await this.connectorCredentials.saveConnectedCredentials(
        {
          connectorAccountId: connectorAccount.id,
          provider: input.provider,
          tokenSet: tokens
        },
        tx
      );

      return connectorAccount;
    });

    return this.sanitizeConnectorAccount(account);
  }

  /* =========================
     LISTING
  ========================= */

  async listAccounts(organizationId: string) {
    const accounts = await this.prisma.connectorAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" }
    });

    return accounts.map((account) => this.sanitizeConnectorAccount(account));
  }

  async listLogs(organizationId: string, connectorAccountId?: string) {
    return this.prisma.connectorSyncLog.findMany({
      where: {
        organizationId,
        ...(connectorAccountId ? { connectorAccountId } : {})
      },
      orderBy: { createdAt: "desc" }
    });
  }

  /* =========================
     SYNC ENTRY POINT
  ========================= */

  async runSync(
    organizationId: string,
    userId: string,
    connectorAccountId: string,
    input: {
      direction: "IMPORT" | "EXPORT";
      scope?: string | null;
    }
  ) {
    const account = await this.prisma.connectorAccount.findFirst({
      where: {
        id: connectorAccountId,
        organizationId
      }
    });

    if (!account) {
      throw new Error("Connector account not found");
    }

    if (input.direction === "IMPORT") {
      if (account.provider === "QUICKBOOKS_ONLINE") {
        return this.runQuickBooksImport(organizationId, userId, account.id);
      }

      if (
        account.provider === "XERO" &&
        (await this.hasStoredCredentials(account.id))
      ) {
        return this.runXeroImport(organizationId, userId, account.id);
      }

      if (
        account.provider === "ZOHO_BOOKS" &&
        (await this.hasStoredCredentials(account.id))
      ) {
        return this.runZohoImport(organizationId, userId, account.id);
      }

      return this.runBootstrapImport(organizationId, userId, account.id);
    }

    return this.runExportPreview(
      organizationId,
      account.id,
      input.scope ?? null
    );
  }

  /* =========================
     QUICKBOOKS LIVE IMPORT
  ========================= */

  private async runQuickBooksImport(
    organizationId: string,
    userId: string,
    connectorAccountId: string
  ) {
    const account = await this.prisma.connectorAccount.findFirst({
      where: {
        id: connectorAccountId,
        organizationId
      }
    });

    if (!account) {
      throw new Error("Connector account not found");
    }

    const adapter = this.getAdapter(account.provider);

    if (account.provider !== "QUICKBOOKS_ONLINE") {
      throw new Error("runQuickBooksImport called for non-QuickBooks connector");
    }

    const startedAt = new Date();

    try {
      const [customers, invoices] = await Promise.all([
        this.quickBooksApiClient.listCustomers(connectorAccountId),
        this.quickBooksApiClient.listInvoices(connectorAccountId)
      ]);

      const bundle = (adapter as QuickBooksAdapter).mapLiveImportPayload({
        customers,
        invoices
      });

      const summary = await this.persistCanonicalImportBundle(
        organizationId,
        connectorAccountId,
        bundle
      );

      const compliance = await this.queueImportedInvoicesForCompliance(
        organizationId,
        userId,
        connectorAccountId
      );
      
      await this.prisma.connectorAccount.update({
        where: { id: connectorAccountId },
        data: {
          lastSyncedAt: new Date()
        }
      });

      const finishedAt = new Date();
      const log = await this.prisma.connectorSyncLog.create({
        data: {
          organizationId,
          connectorAccountId,
          direction: "IMPORT",
          scope: "FULL",
          status: "SUCCESS",
          retryable: false,
          startedAt,
          finishedAt,
          metadata: this.buildSuccessfulSyncMetadata({
            provider: "QUICKBOOKS_ONLINE",
            mode: "quickbooks-live",
            startedAt,
            finishedAt,
            counts: {
              customersFetched: customers.length,
              invoicesFetched: invoices.length,
              contactsPersisted: summary.contacts,
              invoicesPrepared: summary.invoices,
              invoicesQueuedForCompliance: compliance.queued,
              invoicesSkippedForCompliance: compliance.skipped
            }
          })
        }
      });

      return {
        ok: true,
        mode: "quickbooks-live",
        organizationId,
        connectorAccountId,
        imported: {
          contacts: summary.contacts,
          invoices: summary.invoices
        },
        compliance,
        log
      };

    } catch (error) {
      const message = this.connectorLogErrorMessage(
        error,
        "QuickBooks import failed"
      );

      const failedAt = new Date();
      const log = await this.prisma.connectorSyncLog.create({
        data: {
          organizationId,
          connectorAccountId,
          direction: "IMPORT",
          scope: "FULL",
          status: "FAILED",
          retryable: true,
          message,
          startedAt,
          finishedAt: failedAt,
          metadata: this.buildFailedSyncMetadata({
            provider: "QUICKBOOKS_ONLINE",
            mode: "quickbooks-live",
            startedAt,
            failedAt,
            message
          })
        }
      });

      return {
        ok: false,
        mode: "quickbooks-live",
        organizationId,
        connectorAccountId,
        message,
        log
      };
    }
  }

  /* =========================
     XERO LIVE IMPORT
  ========================= */

  private async runXeroImport(
    organizationId: string,
    userId: string,
    connectorAccountId: string
  ) {
    const account = await this.prisma.connectorAccount.findFirst({
      where: {
        id: connectorAccountId,
        organizationId
      }
    });

    if (!account) {
      throw new Error("Connector account not found");
    }

    const adapter = this.getAdapter(account.provider);

    if (account.provider !== "XERO") {
      throw new Error("runXeroImport called for non-Xero connector");
    }

    const startedAt = new Date();

    try {
      const [contacts, invoices] = await Promise.all([
        this.xeroApiClient.listContacts(connectorAccountId),
        this.xeroApiClient.listInvoices(connectorAccountId)
      ]);

      const bundle = (adapter as XeroAdapter).mapLiveImportPayload({
        contacts,
        invoices
      });

      const summary = await this.persistCanonicalImportBundle(
        organizationId,
        connectorAccountId,
        bundle
      );

      const compliance = await this.queueImportedInvoicesForCompliance(
        organizationId,
        userId,
        connectorAccountId
      );

      await this.prisma.connectorAccount.update({
        where: { id: connectorAccountId },
        data: {
          lastSyncedAt: new Date()
        }
      });

      const finishedAt = new Date();
      const log = await this.prisma.connectorSyncLog.create({
        data: {
          organizationId,
          connectorAccountId,
          direction: "IMPORT",
          scope: "FULL",
          status: "SUCCESS",
          retryable: false,
          startedAt,
          finishedAt,
          metadata: this.buildSuccessfulSyncMetadata({
            provider: "XERO",
            mode: "xero-live",
            startedAt,
            finishedAt,
            counts: {
              contactsFetched: contacts.length,
              invoicesFetched: invoices.length,
              contactsPersisted: summary.contacts,
              invoicesPrepared: summary.invoices,
              invoicesQueuedForCompliance: compliance.queued,
              invoicesSkippedForCompliance: compliance.skipped
            }
          })
        }
      });

      return {
        ok: true,
        mode: "xero-live",
        organizationId,
        connectorAccountId,
        imported: {
          contacts: summary.contacts,
          invoices: summary.invoices
        },
        compliance,
        log
      };
    } catch (error) {
      const message = this.connectorLogErrorMessage(error, "Xero import failed");

      const failedAt = new Date();
      const log = await this.prisma.connectorSyncLog.create({
        data: {
          organizationId,
          connectorAccountId,
          direction: "IMPORT",
          scope: "FULL",
          status: "FAILED",
          retryable: true,
          message,
          startedAt,
          finishedAt: failedAt,
          metadata: this.buildFailedSyncMetadata({
            provider: "XERO",
            mode: "xero-live",
            startedAt,
            failedAt,
            message
          })
        }
      });

      return {
        ok: false,
        mode: "xero-live",
        organizationId,
        connectorAccountId,
        message,
        log
      };
    }
  }

  /* =========================
     ZOHO LIVE IMPORT
  ========================= */

  private async runZohoImport(
    organizationId: string,
    userId: string,
    connectorAccountId: string
  ) {
    const account = await this.prisma.connectorAccount.findFirst({
      where: {
        id: connectorAccountId,
        organizationId
      }
    });

    if (!account) {
      throw new Error("Connector account not found");
    }

    const adapter = this.getAdapter(account.provider);

    if (account.provider !== "ZOHO_BOOKS") {
      throw new Error("runZohoImport called for non-Zoho connector");
    }

    const startedAt = new Date();

    try {
      const [contacts, invoices] = await Promise.all([
        this.zohoApiClient.listContacts(connectorAccountId),
        this.zohoApiClient.listInvoices(connectorAccountId)
      ]);

      const bundle = (adapter as ZohoBooksAdapter).mapLiveImportPayload({
        contacts,
        invoices
      });

      const summary = await this.persistCanonicalImportBundle(
        organizationId,
        connectorAccountId,
        bundle
      );

      const compliance = await this.queueImportedInvoicesForCompliance(
        organizationId,
        userId,
        connectorAccountId
      );

      await this.prisma.connectorAccount.update({
        where: { id: connectorAccountId },
        data: {
          lastSyncedAt: new Date()
        }
      });

      const finishedAt = new Date();
      const log = await this.prisma.connectorSyncLog.create({
        data: {
          organizationId,
          connectorAccountId,
          direction: "IMPORT",
          scope: "FULL",
          status: "SUCCESS",
          retryable: false,
          startedAt,
          finishedAt,
          metadata: this.buildSuccessfulSyncMetadata({
            provider: "ZOHO_BOOKS",
            mode: "zoho-live",
            startedAt,
            finishedAt,
            counts: {
              contactsFetched: contacts.length,
              invoicesFetched: invoices.length,
              contactsPersisted: summary.contacts,
              invoicesPrepared: summary.invoices,
              invoicesQueuedForCompliance: compliance.queued,
              invoicesSkippedForCompliance: compliance.skipped
            }
          })
        }
      });

      return {
        ok: true,
        mode: "zoho-live",
        organizationId,
        connectorAccountId,
        imported: {
          contacts: summary.contacts,
          invoices: summary.invoices
        },
        compliance,
        log
      };
    } catch (error) {
      const message = this.connectorLogErrorMessage(error, "Zoho import failed");

      const failedAt = new Date();
      const log = await this.prisma.connectorSyncLog.create({
        data: {
          organizationId,
          connectorAccountId,
          direction: "IMPORT",
          scope: "FULL",
          status: "FAILED",
          retryable: true,
          message,
          startedAt,
          finishedAt: failedAt,
          metadata: this.buildFailedSyncMetadata({
            provider: "ZOHO_BOOKS",
            mode: "zoho-live",
            startedAt,
            failedAt,
            message
          })
        }
      });

      return {
        ok: false,
        mode: "zoho-live",
        organizationId,
        connectorAccountId,
        message,
        log
      };
    }
  }

  /* =========================
     BOOTSTRAP (fallback)
  ========================= */

  private async runBootstrapImport(
    organizationId: string,
    userId: string,
    connectorAccountId: string
  ) {
    const account = await this.prisma.connectorAccount.findFirst({
      where: {
        id: connectorAccountId,
        organizationId
      }
    });

    if (!account) {
      throw new Error("Connector account not found");
    }

    const adapter = this.getAdapter(account.provider);

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        slug: true
      }
    });

    if (!organization) {
      throw new Error("Organization not found");
    }

    const payload = await adapter.buildBootstrapImportPayload({
      organizationName: organization.name.trim() || organization.slug.trim(),
      defaultCurrencyCode: "SAR"
    });

    const bundle = adapter.mapBootstrapImportPayload(payload);

    const summary = await this.persistCanonicalImportBundle(
      organizationId,
      connectorAccountId,
      bundle
    );

    const compliance = await this.queueImportedInvoicesForCompliance(
      organizationId,
      userId,
      connectorAccountId
    );
    return {
      ok: true,
      mode: "bootstrap",
      organizationId,
      connectorAccountId,
      imported: {
        contacts: summary.contacts,
        invoices: summary.invoices
      },
      compliance
    };
  }

  async getExportPreview(
    organizationId: string,
    connectorAccountId: string
  ) {
    return this.runExportPreview(organizationId, connectorAccountId, null);
  }

  /* =========================
     EXPORT PREVIEW
  ========================= */

  private async runExportPreview(
    organizationId: string,
    connectorAccountId: string,
    scope: string | null
  ) {
    return {
      organizationId,
      connectorAccountId,
      scope,
      message: "Export preview not implemented yet"
    };
  }

  /* =========================
     PERSIST
  ========================= */

  private async persistCanonicalImportBundle(
    organizationId: string,
    connectorAccountId: string,
    bundle: CanonicalImportBundle
  ) {
    const contactIdsByExternalId = new Map<string, string>();
    let persistedContacts = 0;

    for (const contact of bundle.contacts) {
      const contactId = await this.upsertImportedContact(
        organizationId,
        connectorAccountId,
        contact
      );

      if (contact.externalId) {
        contactIdsByExternalId.set(contact.externalId, contactId);
      }

      persistedContacts += 1;
    }

    const persistedInvoices = await this.persistCanonicalInvoices(
      organizationId,
      connectorAccountId,
      bundle.invoices,
      contactIdsByExternalId
    );

    return {
      contacts: persistedContacts,
      invoices: persistedInvoices
    };
  }

  private async queueImportedInvoicesForCompliance(
    organizationId: string,
    userId: string,
    connectorAccountId: string
  ) {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        organizationId,
        sourceConnectorAccountId: connectorAccountId,
        status: {
          notIn: ["DRAFT", "VOID"]
        }
      },
      select: {
        id: true
      }
    });

    let queued = 0;
    let skipped = 0;
    let firstSkipReason: string | null = null;

    for (const invoice of invoices) {
      try {
        await this.complianceService.reportInvoice(
          organizationId,
          userId,
          invoice.id
        );
        queued += 1;
      } catch (error) {
        skipped += 1;
        firstSkipReason ??= this.errorMessage(
          error,
          "Failed to queue imported invoice for compliance."
        );
      }
    }

    return {
      eligible: invoices.length,
      queued,
      skipped,
      firstSkipReason
    };
  }

  /* =========================
     HELPERS
  ========================= */
  private mapImportedInvoiceStatus(
    sourceStatus: string,
    balance: number,
    total: number
  ):  SalesInvoiceStatus {
    const normalized = sourceStatus.trim().toUpperCase();

    if (normalized === "PAID") {
      return "PAID";
    }

    if (normalized === "VOID" || normalized === "VOIDED") {
      return "VOID";
    }

    if (Number(balance) <= 0 && Number(total) > 0) {
      return "PAID";
    }

    if (Number(balance) > 0 && Number(balance) < Number(total)) {
      return "PARTIALLY_PAID";
    }

    if (normalized === "DRAFT") {
      return "DRAFT";
    }

    return "ISSUED";
  }

  private async findMatchingTaxRate(
    organizationId: string,
    code: string | null,
    rate: number | null
  ) {
    if (code) {
      const byCode = await this.prisma.taxRate.findFirst({
        where: {
          organizationId,
          code
        }
      });

      if (byCode) {
        return byCode;
      }
    }

    if (typeof rate === "number") {
      const byRate = await this.prisma.taxRate.findFirst({
        where: {
          organizationId,
          rate: this.toMoney(rate)
        }
      });

      if (byRate) {
        return byRate;
      }
    }

    return null;
  }

  private toMoney(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value).toDecimalPlaces(2);
  }

  private async resolveImportedInvoiceContact(
    organizationId: string,
    connectorAccountId: string,
    invoice: CanonicalImportBundle["invoices"][number],
    contactIdsByExternalId: Map<string, string>
  ) {
    if (invoice.contactExternalId) {
      const mapped = contactIdsByExternalId.get(invoice.contactExternalId);
      if (mapped) {
        return mapped;
      }
    }

    const byName = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        displayName: invoice.contactDisplayName
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (byName) {
      return byName.id;
    }

    const created = await this.prisma.contact.create({
      data: {
        organizationId,
        displayName: invoice.contactDisplayName,
        companyName: invoice.contactDisplayName,
        isCustomer: true,
        isSupplier: false,
        notes: `Auto-created from imported invoice via connector ${connectorAccountId}`
      }
    });

    if (invoice.contactExternalId) {
      contactIdsByExternalId.set(invoice.contactExternalId, created.id);
    }

    return created.id;
  }

  private async persistCanonicalInvoices(
    organizationId: string,
    connectorAccountId: string,
    invoices: CanonicalImportBundle["invoices"],
    contactIdsByExternalId: Map<string, string>
  ) {
    let persistedInvoices = 0;

    for (const invoice of invoices) {
      const contactId = await this.resolveImportedInvoiceContact(
        organizationId,
        connectorAccountId,
        invoice,
        contactIdsByExternalId
      );

      const issueDate = new Date(invoice.issueDate);
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : issueDate;

      const subtotal = this.toMoney(invoice.subtotal);
      const taxTotal = this.toMoney(invoice.taxTotal);
      const total = this.toMoney(invoice.total);

      const balanceValue =
        typeof invoice.balance === "number" ? invoice.balance : invoice.total;

      const amountDue = this.toMoney(balanceValue);
      const amountPaid = this.toMoney(
        Math.max(0, Number(invoice.total) - Number(balanceValue))
      );

      const status = this.mapImportedInvoiceStatus(
        invoice.status,
        balanceValue,
        invoice.total
      );

      const lineInputs = await Promise.all(
        invoice.lines.map(async (line, index) => {
          const lineSubtotal = this.toMoney(line.lineAmountExclusive);
          const lineTax = this.toMoney(
            typeof line.taxAmount === "number"
              ? line.taxAmount
              : typeof line.lineAmountInclusive === "number"
                ? line.lineAmountInclusive - line.lineAmountExclusive
                : 0
          );
          const lineTotal = this.toMoney(
            Number(lineSubtotal) + Number(lineTax)
          );

          const taxRate = await this.findMatchingTaxRate(
            organizationId,
            line.taxCode ?? null,
            typeof line.taxRate === "number" ? line.taxRate : null
          );

          return {
            description: line.description.trim() || "Imported line item",
            quantity: this.toMoney(line.quantity),
            unitPrice: this.toMoney(line.unitPrice),
            taxRateId: taxRate?.id ?? null,
            taxRateName: taxRate?.name ?? line.taxCode ?? null,
            taxRatePercent: this.toMoney(
              taxRate ? Number(taxRate.rate) : (line.taxRate ?? 0)
            ),
            lineSubtotal,
            lineTax,
            lineTotal,
            sortOrder: index
          };
        })
      );

      let existing = null as Awaited<
        ReturnType<typeof this.prisma.salesInvoice.findFirst>
      >;

      if (invoice.externalId) {
        existing = await this.prisma.salesInvoice.findUnique({
          where: {
            organizationId_sourceProvider_sourceExternalId: {
              organizationId,
              sourceProvider: invoice.provider,
              sourceExternalId: invoice.externalId
            }
          }
        });
      }

      if (!existing) {
        existing = await this.prisma.salesInvoice.findUnique({
          where: {
            organizationId_invoiceNumber: {
              organizationId,
              invoiceNumber: invoice.documentNumber
            }
          }
        });
      }

      if (existing) {
        await this.prisma.$transaction([
          this.prisma.salesInvoiceLine.deleteMany({
            where: {
              salesInvoiceId: existing.id
            }
          }),
          this.prisma.salesInvoice.update({
            where: {
              id: existing.id
            },
            data: {
              contactId,
              invoiceNumber: invoice.documentNumber,
              status,
              complianceInvoiceKind: "STANDARD",
              issueDate,
              dueDate,
              currencyCode: invoice.currency,
              notes: `Imported from ${invoice.provider} connector ${connectorAccountId}`,
              subtotal,
              taxTotal,
              total,
              amountPaid,
              amountDue,
              sourceConnectorAccountId: connectorAccountId,
              sourceExternalId: invoice.externalId,
              sourcePayload: invoice.raw as Prisma.InputJsonValue,
              sourceProvider: invoice.provider,
              lines: {
                create: lineInputs
              }
            }
          })
        ]);
      } else {
        await this.prisma.salesInvoice.create({
          data: {
            organizationId,
            contactId,
            invoiceNumber: invoice.documentNumber,
            status,
            complianceInvoiceKind: "STANDARD",
            issueDate,
            dueDate,
            currencyCode: invoice.currency,
            notes: `Imported from ${invoice.provider} connector ${connectorAccountId}`,
            subtotal,
            taxTotal,
            total,
            amountPaid,
            amountDue,
            sourceConnectorAccountId: connectorAccountId,
            sourceExternalId: invoice.externalId,
            sourcePayload: invoice.raw as Prisma.InputJsonValue,
            sourceProvider: invoice.provider,
            lines: {
              create: lineInputs
            }
          }
        });
      }

      persistedInvoices += 1;
    }

    return persistedInvoices;
  }

  private async upsertImportedContact(
    organizationId: string,
    connectorAccountId: string,
    contact: CanonicalImportBundle["contacts"][number]
  ) {
    const displayName = contact.displayName.trim();

    if (!displayName) {
      throw new Error("Imported contact display name is required.");
    }

    const existing = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        displayName
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    let contactId: string;

    if (existing) {
      const updated = await this.prisma.contact.update({
        where: { id: existing.id },
        data: {
          companyName: existing.companyName ?? displayName,
          email: contact.email ?? existing.email ?? undefined,
          taxNumber: contact.taxNumber ?? existing.taxNumber ?? undefined,
          isCustomer: true,
          isSupplier: false,
          currencyCode: existing.currencyCode ?? contact.currencyCode ?? undefined,
          notes: `Imported from connector ${connectorAccountId}`
        }
      });

      contactId = updated.id;
    } else {
      const created = await this.prisma.contact.create({
        data: {
          organizationId,
          displayName,
          companyName: displayName,
          email: contact.email ?? undefined,
          taxNumber: contact.taxNumber ?? undefined,
          isCustomer: true,
          isSupplier: false,
          currencyCode: contact.currencyCode ?? undefined,
          notes: `Imported from connector ${connectorAccountId}`
        }
      });

      contactId = created.id;
    }

    const phoneNumber = contact.phone?.trim();

    if (phoneNumber) {
      const existingNumber = await this.prisma.contactNumber.findFirst({
        where: {
          contactId,
          phoneNumber
        }
      });

      if (!existingNumber) {
        await this.prisma.contactNumber.create({
          data: {
            contactId,
            label: "Primary",
            phoneNumber
          }
        });
      }
    }

    return contactId;
  }

  private sanitizeConnectorAccount(account: {
    id: string;
    organizationId: string;
    provider: ConnectorProvider;
    displayName: string;
    status: string;
    externalTenantId: string | null;
    scopes: Prisma.JsonValue | null;
    connectedAt: Date | null;
    lastSyncedAt: Date | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: account.id,
      organizationId: account.organizationId,
      provider: account.provider,
      displayName: account.displayName,
      status: account.status,
      externalTenantId: account.externalTenantId,
      scopes: this.normalizeScopes(account.scopes),
      connectedAt: account.connectedAt,
      lastSyncedAt: account.lastSyncedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  }

  private normalizeScopes(scopes: Prisma.JsonValue | null) {
    if (!Array.isArray(scopes)) {
      return [] as string[];
    }

    return scopes.filter((scope): scope is string => typeof scope === "string");
  }

  private errorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return fallback;
  }

  private buildSuccessfulSyncMetadata(input: {
    provider: ConnectorProvider;
    mode: string;
    startedAt: Date;
    finishedAt: Date;
    counts: Record<string, number>;
  }) {
    return {
      provider: input.provider,
      mode: input.mode,
      syncMode: "FULL",
      incrementalApplied: false,
      checkpointBefore: null,
      checkpointAfter: null,
      syncStartedAt: input.startedAt.toISOString(),
      syncFinishedAt: input.finishedAt.toISOString(),
      ...input.counts
    } as Prisma.InputJsonValue;
  }

  private buildFailedSyncMetadata(input: {
    provider: ConnectorProvider;
    mode: string;
    startedAt: Date;
    failedAt: Date;
    message: string;
  }) {
    return {
      provider: input.provider,
      mode: input.mode,
      syncMode: "FULL",
      incrementalApplied: false,
      checkpointBefore: null,
      checkpointAfter: null,
      syncStartedAt: input.startedAt.toISOString(),
      syncFailedAt: input.failedAt.toISOString(),
      message: input.message
    } as Prisma.InputJsonValue;
  }

  private connectorLogErrorMessage(error: unknown, fallback: string) {
    return this.redactConnectorLogMessage(this.errorMessage(error, fallback));
  }

  private redactConnectorLogMessage(message: string) {
    return message.replace(
      /(access[_-]?token|refresh[_-]?token|authorization|client[_-]?secret|secret|password)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      "$1$2[REDACTED]"
    );
  }

  private getAdapter(provider: ConnectorProvider) {
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      throw new Error(`Adapter missing for ${provider}`);
    }

    return adapter;
  }

  private getTransport(provider: ConnectorProvider) {
    const transport = this.transports.get(provider);

    if (!transport) {
      throw new BadRequestException(
        `Connect flow is not enabled for provider ${provider}.`
      );
    }

    return transport;
  }

  private async hasStoredCredentials(connectorAccountId: string) {
    const credential = await this.prisma.connectorCredential.findUnique({
      where: {
        connectorAccountId
      },
      select: {
        id: true
      }
    });

    return Boolean(credential);
  }

  private async consumeConnectorState(state: ReturnType<typeof decodeConnectorState>) {
    const consumedAt = new Date();
    const result = await this.prisma.connectorOAuthState.updateMany({
      where: {
        organizationId: state.organizationId,
        userId: state.userId,
        provider: state.provider,
        nonceHash: hashConnectorSecret(state.nonce),
        consumedAt: null,
        expiresAt: {
          gt: consumedAt
        }
      },
      data: {
        consumedAt
      }
    });

    if (result.count !== 1) {
      throw new BadRequestException("Invalid or already used connector state");
    }
  }
}
