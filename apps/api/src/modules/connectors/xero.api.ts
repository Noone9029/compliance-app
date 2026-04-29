import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ConnectorCredentialsService } from "./connector-credentials.service";
import { fetchProviderRequest } from "./provider-request";
import { XeroTransport } from "./xero.transport";

type XeroContact = {
  ContactID?: string;
  Name?: string;
  EmailAddress?: string | null;
  Phones?: Array<{
    PhoneNumber?: string | null;
  }>;
  IsCustomer?: boolean;
  IsSupplier?: boolean;
  DefaultCurrency?: string | null;
  TaxNumber?: string | null;
};

type XeroInvoice = {
  InvoiceID?: string;
  InvoiceNumber?: string;
  Type?: string;
  Status?: string;
  DateString?: string;
  Date?: string;
  DueDateString?: string;
  DueDate?: string;
  CurrencyCode?: string;
  Contact?: {
    ContactID?: string;
    Name?: string;
  };
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  AmountDue?: number;
  LineItems?: Array<{
    LineItemID?: string;
    Description?: string;
    Quantity?: number;
    UnitAmount?: number;
    LineAmount?: number;
    TaxAmount?: number;
    TaxType?: string;
    ItemCode?: string;
    AccountCode?: string;
  }>;
};

type XeroContactsResponse = {
  Contacts?: XeroContact[];
};

type XeroInvoicesResponse = {
  Invoices?: XeroInvoice[];
};

type FreshXeroAccount = {
  id: string;
  externalTenantId: string;
  accessToken: string;
};

@Injectable()
export class XeroApiClient {
  private static readonly pageSize = 100;
  private static readonly maxPageCount = 1000;

  private readonly refreshInFlight = new Map<
    string,
    Promise<FreshXeroAccount>
  >();

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(XeroTransport)
    private readonly xeroTransport: XeroTransport,
    @Inject(ConnectorCredentialsService)
    private readonly connectorCredentials: ConnectorCredentialsService
  ) {}

  async listContacts(connectorAccountId: string): Promise<XeroContact[]> {
    const account = await this.getFreshAccount(connectorAccountId);

    return this.listPaged<XeroContact, XeroContactsResponse>({
      account,
      resource: "Contacts",
      extractItems: (data) => data.Contacts ?? []
    });
  }

  async listInvoices(connectorAccountId: string): Promise<XeroInvoice[]> {
    const account = await this.getFreshAccount(connectorAccountId);

    return this.listPaged<XeroInvoice, XeroInvoicesResponse>({
      account,
      resource: "Invoices",
      params: {
        where: 'Type=="ACCREC"'
      },
      extractItems: (data) => data.Invoices ?? []
    });
  }

  private async getFreshAccount(
    connectorAccountId: string
  ): Promise<FreshXeroAccount> {
    const account = await this.prisma.connectorAccount.findUnique({
      where: {
        id: connectorAccountId
      },
      select: {
        id: true,
        provider: true,
        externalTenantId: true
      }
    });

    if (!account) {
      throw new Error("Connector account not found.");
    }

    if (account.provider !== "XERO") {
      throw new Error("Xero API client can only load Xero connectors.");
    }

    const tenantId = this.requireTenantId(account.externalTenantId);

    const tokens = await this.connectorCredentials.getDecryptedCredentials(
      connectorAccountId
    );

    if (tokens.provider !== "XERO") {
      throw new Error("Connector credentials provider does not match Xero.");
    }

    const refreshThresholdMs = 2 * 60 * 1000;
    const expiresAtMs = tokens.expiresAt.getTime();

    if (Number.isNaN(expiresAtMs)) {
      throw new Error("Xero connector expiry timestamp is invalid.");
    }

    if (expiresAtMs - Date.now() > refreshThresholdMs) {
      return {
        id: account.id,
        externalTenantId: tenantId,
        accessToken: tokens.accessToken
      };
    }

    return this.refreshWithSingleFlight({
      connectorAccountId: account.id,
      tenantId,
      refreshToken: tokens.refreshToken
    });
  }

  private async getJson<T>(
    path: string,
    accessToken: string,
    tenantId: string
  ): Promise<T> {
    const endpoint = `https://api.xero.com/api.xro/2.0/${path}`;

    const response = await fetchProviderRequest({
      provider: "Xero",
      endpoint,
      init: {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "xero-tenant-id": tenantId
        }
      }
    });

    return (await response.json()) as T;
  }

  private async listPaged<TItem, TResponse>(input: {
    account: FreshXeroAccount;
    resource: string;
    params?: Record<string, string>;
    extractItems: (response: TResponse) => TItem[];
  }): Promise<TItem[]> {
    const items: TItem[] = [];

    for (let page = 1; page <= XeroApiClient.maxPageCount; page += 1) {
      const response = await this.getJson<TResponse>(
        this.buildPagedPath(input.resource, page, input.params),
        input.account.accessToken,
        input.account.externalTenantId
      );
      const pageItems = input.extractItems(response);

      if (pageItems.length === 0) {
        return items;
      }

      items.push(...pageItems);

      if (pageItems.length < XeroApiClient.pageSize) {
        return items;
      }
    }

    throw new Error(
      `Xero ${input.resource} pagination exceeded ${XeroApiClient.maxPageCount} pages.`
    );
  }

  private buildPagedPath(
    resource: string,
    page: number,
    params: Record<string, string> = {}
  ) {
    const searchParams = new URLSearchParams(params);
    searchParams.set("page", String(page));

    return `${resource}?${searchParams.toString()}`;
  }

  private requireTenantId(value: string | null) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new Error("Xero tenantId is missing on connector account.");
    }

    return normalized;
  }

  private async refreshWithSingleFlight(input: {
    connectorAccountId: string;
    tenantId: string;
    refreshToken: string;
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
    tenantId: string;
    refreshToken: string;
  }): Promise<FreshXeroAccount> {
    const refreshed = await this.xeroTransport.refreshAccessToken!({
      refreshToken: input.refreshToken
    });

    await this.prisma.$transaction(async (tx) => {
      await this.connectorCredentials.rotateCredentials(
        {
          connectorAccountId: input.connectorAccountId,
          provider: "XERO",
          tokenSet: refreshed
        },
        tx
      );

      await tx.connectorAccount.update({
        where: {
          id: input.connectorAccountId
        },
        data: {
          scopes: refreshed.scopes as Prisma.InputJsonValue
        }
      });
    });

    return {
      id: input.connectorAccountId,
      externalTenantId: input.tenantId,
      accessToken: refreshed.accessToken
    };
  }
}
