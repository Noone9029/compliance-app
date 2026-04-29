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

@Injectable()
export class QuickBooksApiClient {
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

  async listCustomers(connectorAccountId: string): Promise<QuickBooksCustomer[]> {
    const account = await this.getFreshAccount(connectorAccountId);
    const realmId = this.requireRealmId(account.externalTenantId);

    const data = await this.query<QuickBooksCustomer>(
      realmId,
      account.accessToken,
      "SELECT * FROM Customer STARTPOSITION 1 MAXRESULTS 1000"
    );

    return (data.QueryResponse?.Customer as QuickBooksCustomer[] | undefined) ?? [];
  }

  async listInvoices(connectorAccountId: string): Promise<QuickBooksInvoice[]> {
    const account = await this.getFreshAccount(connectorAccountId);
    const realmId = this.requireRealmId(account.externalTenantId);

    const data = await this.query<QuickBooksInvoice>(
      realmId,
      account.accessToken,
      "SELECT * FROM Invoice STARTPOSITION 1 MAXRESULTS 1000"
    );

    return (data.QueryResponse?.Invoice as QuickBooksInvoice[] | undefined) ?? [];
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
