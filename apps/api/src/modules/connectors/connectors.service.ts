import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ConnectorProvider } from "@daftar/types";
import { PrismaService } from "../../common/prisma/prisma.service";

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
    this.adapters = new Map<string, ConnectorAdapter>([
      [xeroAdapter.provider as string, xeroAdapter as ConnectorAdapter],
      [quickBooksAdapter.provider as string, quickBooksAdapter as ConnectorAdapter],
      [zohoBooksAdapter.provider as string, zohoBooksAdapter as ConnectorAdapter]
    ]);

    this.transports = new Map<string, ConnectorProviderTransport>([
      [
        quickBooksTransport.provider as string,
        quickBooksTransport as ConnectorProviderTransport
      ]
    ]);
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

      return log;
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

      return log;
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

    const payload = await adapter.buildBootstrapImportPayload({
      organizationName: "Demo Org",
      defaultCurrencyCode: "SAR"
    });

    const bundle = adapter.mapBootstrapImportPayload(payload);

    const summary = await this.persistCanonicalImportBundle(
      organizationId,
      connectorAccountId,
      bundle
    );

    return summary;
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
    let persistedContacts = 0;

    for (const contact of bundle.contacts) {
      const displayName = contact.displayName.trim();

      if (!displayName) continue;

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
            isCustomer: contact.isCustomer,
            isSupplier: contact.isSupplier,
            currencyCode: contact.currencyCode ?? existing.currencyCode ?? undefined,
            notes: `Imported from QUICKBOOKS_ONLINE connector ${connectorAccountId}`
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
            isCustomer: contact.isCustomer,
            isSupplier: contact.isSupplier,
            currencyCode: contact.currencyCode ?? undefined,
            notes: `Imported from QUICKBOOKS_ONLINE connector ${connectorAccountId}`
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

      persistedContacts += 1;
    }

    return {
      contacts: persistedContacts,
      invoices: bundle.invoices.length
    };
  }

  /* =========================
     HELPERS
  ========================= */

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