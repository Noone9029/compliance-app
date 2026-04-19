import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma, ConnectorProvider } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";

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
  private readonly adapters: Map<ConnectorProvider, ConnectorAdapter>;
  private readonly transports: Map<ConnectorProvider, ConnectorProviderTransport>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,

    @Inject(XeroAdapter) xeroAdapter: XeroAdapter,
    @Inject(QuickBooksAdapter) quickBooksAdapter: QuickBooksAdapter,
    @Inject(ZohoBooksAdapter) zohoBooksAdapter: ZohoBooksAdapter,

    @Inject(QuickBooksTransport) quickBooksTransport: QuickBooksTransport,
    @Inject(QuickBooksApiClient)
    private readonly quickBooksApiClient: QuickBooksApiClient
  ) {
    this.adapters = new Map([
      [xeroAdapter.provider, xeroAdapter],
      [quickBooksAdapter.provider, quickBooksAdapter],
      [zohoBooksAdapter.provider, zohoBooksAdapter]
    ]);

    this.transports = new Map([
      [quickBooksTransport.provider, quickBooksTransport]
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
      redirectUri: input.redirectUri,
      externalTenantId: input.externalTenantId ?? null
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

    const log = await this.prisma.connectorSyncLog.create({
      data: {
        organizationId,
        connectorAccountId,
        provider: account.provider,
        direction: "IMPORT",
        status: "SUCCEEDED",
        startedAt: new Date(),
        completedAt: new Date(),
        importedContactsCount: summary.contacts,
        importedInvoicesCount: summary.invoices,
        metadata: {
          mode: "quickbooks-live",
          customersFetched: customers.length,
          invoicesFetched: invoices.length
        } as Prisma.InputJsonValue
      }
    });

    return log;
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
    for (const contact of bundle.contacts) {
      await this.prisma.contact.upsert({
        where: {
          organizationId_displayName: {
            organizationId,
            displayName: contact.displayName
          }
        },
        update: {
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
          metadata: {
            source: "connector",
            provider: "QUICKBOOKS_ONLINE",
            externalId: contact.externalId
          } as Prisma.InputJsonValue
        },
        create: {
          organizationId,
          displayName: contact.displayName,
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
          metadata: {
            source: "connector",
            provider: "QUICKBOOKS_ONLINE",
            externalId: contact.externalId
          } as Prisma.InputJsonValue
        }
      });
    }

    return {
      contacts: bundle.contacts.length,
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