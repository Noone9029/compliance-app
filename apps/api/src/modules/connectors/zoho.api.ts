import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  ConnectorCredentialsService,
  type ConnectorCredentialMetadata
} from "./connector-credentials.service";
import { fetchProviderRequest } from "./provider-request";
import { ZohoTransport } from "./zoho.transport";

type ZohoContact = {
  contact_id?: string;
  contact_name?: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  contact_type?: string | null;
  is_customer?: boolean;
  is_vendor?: boolean;
  currency_code?: string | null;
  tax_number?: string | null;
};

type ZohoInvoiceLine = {
  line_item_id?: string;
  name?: string;
  description?: string;
  quantity?: number;
  rate?: number;
  item_total?: number;
  tax_amount?: number;
  tax_name?: string;
  tax_percentage?: number;
  item_id?: string;
};

type ZohoInvoice = {
  invoice_id?: string;
  invoice_number?: string;
  status?: string;
  date?: string;
  due_date?: string;
  currency_code?: string;
  customer_id?: string;
  customer_name?: string;
  sub_total?: number;
  tax_total?: number;
  total?: number;
  balance?: number;
  line_items?: ZohoInvoiceLine[];
};

type ZohoContactsResponse = {
  contacts?: ZohoContact[];
};

type ZohoInvoicesResponse = {
  invoices?: ZohoInvoice[];
};

type FreshZohoAccount = {
  id: string;
  externalTenantId: string;
  accessToken: string;
  apiDomain: string;
};

@Injectable()
export class ZohoApiClient {
  private readonly refreshInFlight = new Map<
    string,
    Promise<FreshZohoAccount>
  >();

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ZohoTransport)
    private readonly zohoTransport: ZohoTransport,
    @Inject(ConnectorCredentialsService)
    private readonly connectorCredentials: ConnectorCredentialsService
  ) {}

  async listContacts(connectorAccountId: string): Promise<ZohoContact[]> {
    const account = await this.getFreshAccount(connectorAccountId);
    const data = await this.getJson<ZohoContactsResponse>(
      account,
      "contacts"
    );

    return data.contacts ?? [];
  }

  async listInvoices(connectorAccountId: string): Promise<ZohoInvoice[]> {
    const account = await this.getFreshAccount(connectorAccountId);
    const data = await this.getJson<ZohoInvoicesResponse>(
      account,
      "invoices"
    );

    return data.invoices ?? [];
  }

  private async getFreshAccount(
    connectorAccountId: string
  ): Promise<FreshZohoAccount> {
    const account = await this.prisma.connectorAccount.findUnique({
      where: { id: connectorAccountId },
      select: {
        id: true,
        provider: true,
        externalTenantId: true
      }
    });

    if (!account) {
      throw new Error("Connector account not found.");
    }

    if (account.provider !== "ZOHO_BOOKS") {
      throw new Error("Zoho API client can only load Zoho connectors.");
    }

    const organizationId = this.requireOrganizationId(account.externalTenantId);
    const tokens = await this.connectorCredentials.getDecryptedCredentials(
      connectorAccountId
    );

    if (tokens.provider !== "ZOHO_BOOKS") {
      throw new Error("Connector credentials provider does not match Zoho.");
    }

    const persistedApiDomain = this.resolveApiDomain(
      tokens.credentialMetadata,
      null
    );
    const refreshThresholdMs = 2 * 60 * 1000;
    const expiresAtMs = tokens.expiresAt.getTime();

    if (Number.isNaN(expiresAtMs)) {
      throw new Error("Zoho connector expiry timestamp is invalid.");
    }

    if (expiresAtMs - Date.now() > refreshThresholdMs) {
      return {
        id: account.id,
        externalTenantId: organizationId,
        accessToken: tokens.accessToken,
        apiDomain: persistedApiDomain
      };
    }

    return this.refreshWithSingleFlight({
      connectorAccountId: account.id,
      organizationId,
      refreshToken: tokens.refreshToken,
      credentialMetadata: tokens.credentialMetadata
    });
  }

  private async getJson<T>(
    account: FreshZohoAccount,
    resource: "contacts" | "invoices"
  ): Promise<T> {
    const endpoint = new URL(
      `${account.apiDomain.replace(/\/+$/, "")}/books/v3/${resource}`
    );

    endpoint.searchParams.set("organization_id", account.externalTenantId);
    endpoint.searchParams.set("per_page", "200");

    const response = await fetchProviderRequest({
      provider: "Zoho",
      endpoint,
      init: {
      method: "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${account.accessToken}`,
        Accept: "application/json"
      }
      }
    });

    return (await response.json()) as T;
  }

  private requireOrganizationId(value: string | null) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new Error("Zoho organization_id is missing on connector account.");
    }

    return normalized;
  }

  private async refreshWithSingleFlight(input: {
    connectorAccountId: string;
    organizationId: string;
    refreshToken: string;
    credentialMetadata: ConnectorCredentialMetadata | null | undefined;
  }) {
    const existing = this.refreshInFlight.get(input.connectorAccountId);
    if (existing) {
      return existing;
    }

    const refreshPromise = this.refreshAccount(input).finally(() => {
      this.refreshInFlight.delete(input.connectorAccountId);
    });

    this.refreshInFlight.set(input.connectorAccountId, refreshPromise);
    return refreshPromise;
  }

  private async refreshAccount(input: {
    connectorAccountId: string;
    organizationId: string;
    refreshToken: string;
    credentialMetadata: ConnectorCredentialMetadata | null | undefined;
  }): Promise<FreshZohoAccount> {
    const refreshed = await this.zohoTransport.refreshAccessToken!({
      refreshToken: input.refreshToken
    });

    await this.prisma.$transaction(async (tx) => {
      await this.connectorCredentials.rotateCredentials(
        {
          connectorAccountId: input.connectorAccountId,
          provider: "ZOHO_BOOKS",
          tokenSet: refreshed
        },
        tx
      );

      await tx.connectorAccount.update({
        where: { id: input.connectorAccountId },
        data: {
          scopes: refreshed.scopes as Prisma.InputJsonValue
        }
      });
    });

    return {
      id: input.connectorAccountId,
      externalTenantId: input.organizationId,
      accessToken: refreshed.accessToken,
      apiDomain: this.resolveApiDomain(input.credentialMetadata, refreshed.raw)
    };
  }

  private resolveApiDomain(
    metadata: ConnectorCredentialMetadata | null | undefined,
    raw: Record<string, unknown> | null
  ) {
    const fromRaw = this.extractApiDomainFromRaw(raw);
    if (fromRaw) {
      return fromRaw;
    }

    const fromMetadata = metadata?.apiDomain?.trim();
    if (fromMetadata) {
      return fromMetadata;
    }

    return "https://www.zohoapis.com";
  }

  private extractApiDomainFromRaw(raw: Record<string, unknown> | null) {
    if (!raw) {
      return null;
    }

    const apiDomain = raw.api_domain;
    if (typeof apiDomain === "string" && apiDomain.trim()) {
      return apiDomain.trim();
    }

    return null;
  }
}
