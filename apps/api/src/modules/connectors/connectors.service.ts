import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ConnectorProvider } from "@daftar/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SalesInvoiceStatus } from "@prisma/client";
import { createHash, randomUUID } from "crypto";

import { XeroAdapter } from "./xero.adapter";
import { QuickBooksAdapter } from "./quickbooks.adapter";
import { ZohoBooksAdapter } from "./zoho-books.adapter";

import { QuickBooksTransport } from "./quickbooks.transport";
import { QuickBooksApiClient } from "./quickbooks.api";

import {
  createConnectorNonce,
  decodeConnectorState,
  encodeConnectorState
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
    @Inject(QuickBooksApiClient)
    private readonly quickBooksApiClient: QuickBooksApiClient
  ) {
    const adapterEntries: Array<[string, ConnectorAdapter]> = [
      [xeroAdapter.provider, xeroAdapter],
      [quickBooksAdapter.provider, quickBooksAdapter],
      [zohoBooksAdapter.provider, zohoBooksAdapter]
    ];

    this.adapters = new Map(adapterEntries);

    const transportEntries: Array<[string, ConnectorProviderTransport]> = [
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

    const state = encodeConnectorState({
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      nonce: createConnectorNonce()
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
    const decoded = decodeConnectorState(input.state);

    if (
      decoded.organizationId !== input.organizationId ||
      decoded.userId !== input.userId ||
      decoded.provider !== input.provider
    ) {
      throw new BadRequestException("Invalid connector state");
    }

    const transport = this.getTransport(input.provider);

    const tokens = await transport.exchangeAuthorizationCode({
      organizationId: input.organizationId,
      userId: input.userId,
      code: input.code,
      redirectUri: input.redirectUri
    });

    const account = await this.prisma.connectorAccount.upsert({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: input.provider
        }
      },
      update: {
        status: "CONNECTED",
        displayName: tokens.displayName ?? input.provider,
        externalTenantId: tokens.externalTenantId,
        connectedByUserId: input.userId,
        connectedAt: new Date(),
        metadata: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          raw: tokens.raw
        } as Prisma.InputJsonValue,
        scopes: tokens.scopes as Prisma.InputJsonValue
      },
      create: {
        organizationId: input.organizationId,
        provider: input.provider,
        status: "CONNECTED",
        displayName: tokens.displayName ?? input.provider,
        externalTenantId: tokens.externalTenantId,
        connectedByUserId: input.userId,
        connectedAt: new Date(),
        metadata: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          raw: tokens.raw
        } as Prisma.InputJsonValue,
        scopes: tokens.scopes as Prisma.InputJsonValue
      }
    });

    return account;
  }

  /* =========================
     LISTING
  ========================= */

  async listAccounts(organizationId: string) {
    return this.prisma.connectorAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" }
    });
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
        return this.runQuickBooksImport(organizationId, account.id);
      }

      return this.runBootstrapImport(organizationId, account.id);
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
      const complianceDocsCreated =
      await this.createComplianceDocumentsForInvoices(
        organizationId,
        connectorAccountId
      );

      const xmlGenerated =
      await this.generateXmlForComplianceDocuments(
        organizationId,
        connectorAccountId
      );

      await this.prisma.connectorAccount.update({
        where: { id: connectorAccountId },
        data: {
          lastSyncedAt: new Date()
        }
      });

      const log = await this.prisma.connectorSyncLog.create({
        data: {
          organizationId,
          connectorAccountId,
          direction: "IMPORT",
          scope: "FULL",
          status: "SUCCESS",
          retryable: false,
          startedAt: new Date(),
          finishedAt: new Date(),
          metadata: {
            mode: "quickbooks-live",
            customersFetched: customers.length,
            invoicesFetched: invoices.length,
            contactsPersisted: summary.contacts,
            invoicesPrepared: summary.invoices
          } as Prisma.InputJsonValue
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
        complianceDocumentsCreated: complianceDocsCreated,
        xmlGenerated,
        log
      };

    } catch (error) {
      const message =
        error instanceof Error ? error.message : "QuickBooks import failed";

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
          finishedAt: new Date(),
          metadata: {
            mode: "quickbooks-live"
          } as Prisma.InputJsonValue
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
     BOOTSTRAP (fallback)
  ========================= */

  private async runBootstrapImport(
    organizationId: string,
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

    const complianceDocsCreated =
      await this.createComplianceDocumentsForInvoices(
        organizationId,
        connectorAccountId
      );
    
    const xmlGenerated =
      await this.generateXmlForComplianceDocuments(
        organizationId,
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
      complianceDocumentsCreated: complianceDocsCreated,
      xmlGenerated
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

  private generateInvoiceXml(invoice: any, doc: any) {
    return `
  <Invoice>
    <UUID>${doc.uuid}</UUID>
    <InvoiceNumber>${invoice.invoiceNumber}</InvoiceNumber>
    <IssueDate>${invoice.issueDate.toISOString()}</IssueDate>

    <AccountingCustomerParty>
      <Name>${invoice.contact?.displayName ?? "Customer"}</Name>
    </AccountingCustomerParty>

    <LegalMonetaryTotal>
      <PayableAmount currencyID="${invoice.currencyCode}">
        ${invoice.total.toString()}
      </PayableAmount>
    </LegalMonetaryTotal>

    <InvoiceLines>
      ${invoice.lines
        .map(
          (line: any) => `
        <Line>
          <Description>${line.description}</Description>
          <Quantity>${line.quantity}</Quantity>
          <UnitPrice>${line.unitPrice}</UnitPrice>
          <LineTotal>${line.lineTotal}</LineTotal>
        </Line>
      `
        )
        .join("")}
    </InvoiceLines>
  </Invoice>
  `;
  }

  private async generateXmlForComplianceDocuments(
    organizationId: string,
    connectorAccountId: string
  ) {
    const docs = await this.prisma.complianceDocument.findMany({
      where: {
        organizationId,
        xmlContent: ""
      },
      include: {
        salesInvoice: {
          include: {
            lines: true,
            contact: true
          }
        }
      }
    });

    let generated = 0;

    for (const doc of docs) {
      const xml = this.generateInvoiceXml(doc.salesInvoice, doc);

      await this.prisma.complianceDocument.update({
        where: { id: doc.id },
        data: {
          xmlContent: xml,
          status: "READY"
        }
      });

      generated++;
    }

    return generated;
  }

  private async createComplianceDocumentsForInvoices(
    organizationId: string,
    connectorAccountId: string
  ) {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        organizationId,
        sourceConnectorAccountId: connectorAccountId
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    let created = 0;

    for (const invoice of invoices) {
      const existing = await this.prisma.complianceDocument.findFirst({
        where: {
          organizationId,
          salesInvoiceId: invoice.id
        }
      });

      if (existing) continue;

      const previousDocument = await this.prisma.complianceDocument.findFirst({
        where: {
          organizationId
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      const previousHash = previousDocument?.currentHash ?? null;

      const currentHash = createHash("sha256")
        .update(
          JSON.stringify({
            organizationId,
            salesInvoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            issueDate: invoice.issueDate.toISOString(),
            total: invoice.total.toString(),
            previousHash
          })
        )
        .digest("hex");

      await this.prisma.complianceDocument.create({
        data: {
          organizationId,
          salesInvoiceId: invoice.id,
          invoiceKind: invoice.complianceInvoiceKind,
          uuid: randomUUID(),
          qrPayload: "",
          previousHash,
          currentHash,
          status: "DRAFT",
          xmlContent: ""
        }
      });

      created++;
    }

    return created;
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
      throw new Error(`Transport missing for ${provider}`);
    }

    return transport;
  }
}