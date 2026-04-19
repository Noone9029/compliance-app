import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksTransport } from "./quickbooks.transport";

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

type StoredConnectorMetadata = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  raw?: Record<string, unknown>;
};

@Injectable()
export class QuickBooksApiClient {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quickBooksTransport: QuickBooksTransport
  ) {}

  async listCustomers(connectorAccountId: string): Promise<QuickBooksCustomer[]> {
    const account = await this.getFreshAccount(connectorAccountId);
    const realmId = this.requireRealmId(account.externalTenantId);

    const data = await this.query<QuickBooksCustomer>(
      realmId,
      account.metadata as StoredConnectorMetadata,
      "SELECT * FROM Customer STARTPOSITION 1 MAXRESULTS 1000"
    );

    return (data.QueryResponse?.Customer as QuickBooksCustomer[] | undefined) ?? [];
  }

  async listInvoices(connectorAccountId: string): Promise<QuickBooksInvoice[]> {
    const account = await this.getFreshAccount(connectorAccountId);
    const realmId = this.requireRealmId(account.externalTenantId);

    const data = await this.query<QuickBooksInvoice>(
      realmId,
      account.metadata as StoredConnectorMetadata,
      "SELECT * FROM Invoice STARTPOSITION 1 MAXRESULTS 1000"
    );

    return (data.QueryResponse?.Invoice as QuickBooksInvoice[] | undefined) ?? [];
  }

  private async getFreshAccount(connectorAccountId: string) {
    const account = await this.prisma.connectorAccount.findUnique({
      where: { id: connectorAccountId }
    });

    if (!account) {
      throw new Error("Connector account not found.");
    }

    const metadata = (account.metadata ?? {}) as StoredConnectorMetadata;
    const accessToken = metadata.accessToken;
    const refreshToken = metadata.refreshToken;
    const expiresAt = metadata.expiresAt;

    if (!accessToken || !refreshToken || !expiresAt) {
      throw new Error("QuickBooks connector tokens are incomplete.");
    }

    const refreshThresholdMs = 2 * 60 * 1000;
    const expiresAtMs = new Date(expiresAt).getTime();

    if (Number.isNaN(expiresAtMs)) {
      throw new Error("QuickBooks connector expiry timestamp is invalid.");
    }

    if (expiresAtMs - Date.now() > refreshThresholdMs) {
      return account;
    }

    const refreshed = await this.quickBooksTransport.refreshAccessToken!({
      refreshToken
    });

    const updated = await this.prisma.connectorAccount.update({
      where: { id: account.id },
      data: {
        metadata: {
          ...(metadata.raw ? { raw: metadata.raw } : {}),
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
          raw: refreshed.raw
        } as Prisma.InputJsonValue,
        scopes: refreshed.scopes as Prisma.InputJsonValue
      }
    });

    return updated;
  }

  private async query<T>(
    realmId: string,
    metadata: StoredConnectorMetadata,
    statement: string
  ): Promise<QuickBooksQueryResponse<T>> {
    const response = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${encodeURIComponent(
        realmId
      )}/query?query=${encodeURIComponent(statement)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${metadata.accessToken!}`,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`QuickBooks query failed: ${response.status} ${text}`);
    }

    return (await response.json()) as QuickBooksQueryResponse<T>;
  }

  private requireRealmId(value: string | null): string {
    if (!value?.trim()) {
      throw new Error("QuickBooks realmId is missing on connector account.");
    }

    return value.trim();
  }
}