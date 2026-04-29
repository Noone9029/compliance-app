import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { QuickBooksTransport } from "./quickbooks.transport";
import { ConnectorCredentialsService } from "./connector-credentials.service";
import { fetchProviderRequest } from "./provider-request";

type QuickBooksCustomer = {
  Id: string;
  DisplayName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  Mobile?: { FreeFormNumber?: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
    Country?: string;
  };
};

type QuickBooksSalesItemLineDetail = {
  Qty?: number;
  UnitPrice?: number;
  ItemRef?: { value?: string; name?: string };
  TaxCodeRef?: { value?: string };
};

type QuickBooksLine = {
  Id?: string;
  Description?: string;
  Amount?: number;
  DetailType?: string;
  SalesItemLineDetail?: QuickBooksSalesItemLineDetail;
};

type QuickBooksInvoice = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  CurrencyRef?: { value?: string; name?: string };
  CustomerRef?: { value?: string; name?: string };
  TotalAmt?: number;
  Balance?: number;
  TotalTax?: number;
  PrivateNote?: string;
  Line?: QuickBooksLine[];
  MetaData?: {
    CreateTime?: string;
    LastUpdatedTime?: string;
  };
};

type QuickBooksQueryResponse<T> = {
  QueryResponse?: Record<string, T[] | number | undefined>;
};

type FreshQuickBooksAccount = {
  id: string;
  externalTenantId: string | null;
  accessToken: string;
};

type QuickBooksListOptions = {
  modifiedSince?: Date | null;
};

@Injectable()
export class QuickBooksApiClient {
  private static readonly pageSize = 1000;
  private static readonly maxPageCount = 100;

  private readonly refreshInFlight = new Map<
    string,
    Promise<FreshQuickBooksAccount>
  >();

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(QuickBooksTransport)
    private readonly quickBooksTransport: QuickBooksTransport,
    @Inject(ConnectorCredentialsService)
    private readonly connectorCredentials: ConnectorCredentialsService
  ) {}

  async listCustomers(
    connectorAccountId: string,
    options: QuickBooksListOptions = {}
  ): Promise<QuickBooksCustomer[]> {
    const account = await this.getFreshAccount(connectorAccountId);
    const realmId = this.requireRealmId(account.externalTenantId);

    return this.listPaged<QuickBooksCustomer>({
      realmId,
      accessToken: account.accessToken,
      resource: "Customer",
      modifiedSince: options.modifiedSince ?? null,
      extractItems: (data) =>
        (data.QueryResponse?.Customer as QuickBooksCustomer[] | undefined) ?? []
    });
  }

  async listInvoices(
    connectorAccountId: string,
    options: QuickBooksListOptions = {}
  ): Promise<QuickBooksInvoice[]> {
    const account = await this.getFreshAccount(connectorAccountId);
    const realmId = this.requireRealmId(account.externalTenantId);

    return this.listPaged<QuickBooksInvoice>({
      realmId,
      accessToken: account.accessToken,
      resource: "Invoice",
      modifiedSince: options.modifiedSince ?? null,
      extractItems: (data) =>
        (data.QueryResponse?.Invoice as QuickBooksInvoice[] | undefined) ?? []
    });
  }

  private async getFreshAccount(
    connectorAccountId: string
  ): Promise<FreshQuickBooksAccount> {
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

    if (account.provider !== "QUICKBOOKS_ONLINE") {
      throw new Error("QuickBooks API client can only load QuickBooks connectors.");
    }

    const tokens = await this.connectorCredentials.getDecryptedCredentials(
      connectorAccountId
    );

    if (tokens.provider !== "QUICKBOOKS_ONLINE") {
      throw new Error("Connector credentials provider does not match QuickBooks.");
    }

    const refreshThresholdMs = 2 * 60 * 1000;
    const expiresAtMs = tokens.expiresAt.getTime();

    if (Number.isNaN(expiresAtMs)) {
      throw new Error("QuickBooks connector expiry timestamp is invalid.");
    }

    if (expiresAtMs - Date.now() > refreshThresholdMs) {
      return {
        id: account.id,
        externalTenantId: account.externalTenantId,
        accessToken: tokens.accessToken
      };
    }

    return this.refreshWithSingleFlight({
      connectorAccountId: account.id,
      externalTenantId: account.externalTenantId,
      refreshToken: tokens.refreshToken
    });
  }

  private async query<T>(
    realmId: string,
    accessToken: string,
    statement: string
  ): Promise<QuickBooksQueryResponse<T>> {
    const endpoint = `https://quickbooks.api.intuit.com/v3/company/${encodeURIComponent(
      realmId
    )}/query?query=${encodeURIComponent(statement)}`;

    const response = await fetchProviderRequest({
      provider: "QuickBooks",
      endpoint,
      init: {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    });

    return (await response.json()) as QuickBooksQueryResponse<T>;
  }

  private async listPaged<T>(input: {
    realmId: string;
    accessToken: string;
    resource: "Customer" | "Invoice";
    modifiedSince?: Date | null;
    extractItems: (response: QuickBooksQueryResponse<T>) => T[];
  }): Promise<T[]> {
    const items: T[] = [];

    for (let page = 0; page < QuickBooksApiClient.maxPageCount; page += 1) {
      const startPosition = page * QuickBooksApiClient.pageSize + 1;
      const data = await this.query<T>(
        input.realmId,
        input.accessToken,
        this.buildPagedQuery(
          input.resource,
          startPosition,
          input.modifiedSince ?? null
        )
      );
      const pageItems = input.extractItems(data);

      if (pageItems.length === 0) {
        return items;
      }

      items.push(...pageItems);

      if (pageItems.length < QuickBooksApiClient.pageSize) {
        return items;
      }
    }

    throw new Error(
      `QuickBooks ${input.resource} pagination exceeded ${QuickBooksApiClient.maxPageCount} pages.`
    );
  }

  private buildPagedQuery(
    resource: "Customer" | "Invoice",
    startPosition: number,
    modifiedSince: Date | null
  ) {
    const where = this.buildModifiedSinceWhere(modifiedSince);

    return `SELECT * FROM ${resource}${where} STARTPOSITION ${startPosition} MAXRESULTS ${QuickBooksApiClient.pageSize}`;
  }

  private buildModifiedSinceWhere(modifiedSince: Date | null) {
    if (!modifiedSince) {
      return "";
    }

    const timestamp = modifiedSince.getTime();
    if (Number.isNaN(timestamp)) {
      throw new Error("QuickBooks modifiedSince timestamp is invalid.");
    }

    return ` WHERE MetaData.LastUpdatedTime >= '${modifiedSince.toISOString()}'`;
  }

  private requireRealmId(value: string | null): string {
    if (!value?.trim()) {
      throw new Error("QuickBooks realmId is missing on connector account.");
    }

    return value.trim();
  }

  private async refreshWithSingleFlight(input: {
    connectorAccountId: string;
    externalTenantId: string | null;
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
    externalTenantId: string | null;
    refreshToken: string;
  }): Promise<FreshQuickBooksAccount> {
    const refreshed = await this.quickBooksTransport.refreshAccessToken!({
      refreshToken: input.refreshToken
    });

    await this.prisma.$transaction(async (tx) => {
      await this.connectorCredentials.rotateCredentials(
        {
          connectorAccountId: input.connectorAccountId,
          provider: "QUICKBOOKS_ONLINE",
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
      externalTenantId: input.externalTenantId,
      accessToken: refreshed.accessToken
    };
  }
}
