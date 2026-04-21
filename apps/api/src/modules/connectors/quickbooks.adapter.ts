import { Injectable } from "@nestjs/common";
import type { ConnectorProvider } from "@daftar/types";

import type {
  CanonicalContact,
  CanonicalExportRecord,
  CanonicalImportBundle,
  CanonicalInvoice,
  CanonicalInvoiceLine,
  ConnectorAdapter,
  ConnectorExportPreview
} from "./connector-adapter";

type QuickBooksBootstrapPayload = {
  customers?: Array<{
    id: string;
    displayName: string;
    email?: string | null;
    phone?: string | null;
  }>;
  taxRates?: Array<{
    id: string;
    name: string;
    rate: number;
    code?: string | null;
  }>;
  accounts?: Array<{
    id: string;
    name: string;
    type?: string | null;
    code?: string | null;
  }>;
};

type QuickBooksCustomer = {
  Id: string;
  DisplayName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  Mobile?: { FreeFormNumber?: string };
};

type QuickBooksLine = {
  Id?: string;
  Description?: string;
  Amount?: number;
  DetailType?: string;
  SalesItemLineDetail?: {
    Qty?: number;
    UnitPrice?: number;
    ItemRef?: { value?: string; name?: string };
    TaxCodeRef?: { value?: string };
  };
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
  Line?: QuickBooksLine[];
};

@Injectable()
export class QuickBooksAdapter implements ConnectorAdapter {
  readonly provider: ConnectorProvider = "QUICKBOOKS_ONLINE";

  async buildExportPreview(
    input: ConnectorExportPreview
  ): Promise<Record<string, unknown>> {
    return {
      provider: this.provider,
      summary: {
        contacts: input.contacts,
        invoices: input.invoices,
        bills: input.bills,
        quotes: input.quotes
      }
    };
  }

  async buildBootstrapImportPayload(input: {
    organizationName: string;
    defaultCurrencyCode: string;
  }): Promise<Record<string, unknown>> {
    return {
      customers: [
        {
          id: "qbo-demo-customer-1",
          displayName: `${input.organizationName} Demo Customer`,
          email: "billing@example.com",
          phone: "+966500000000"
        }
      ],
      taxRates: [
        {
          id: "qbo-tax-standard",
          name: "VAT 15%",
          rate: 15,
          code: "S"
        }
      ],
      accounts: [
        {
          id: "qbo-ar",
          name: "Accounts Receivable",
          type: "ASSET",
          code: "1100"
        }
      ]
    } satisfies QuickBooksBootstrapPayload;
  }

  mapBootstrapImportPayload(payload: Record<string, unknown>): CanonicalImportBundle {
    const typed = payload as QuickBooksBootstrapPayload;

    return {
      contacts: (typed.customers ?? []).map((customer): CanonicalContact => ({
        externalId: customer.id,
        displayName: customer.displayName,
        email: customer.email ?? null,
        phone: customer.phone ?? null,
        taxNumber: null,
        isCustomer: true,
        isSupplier: false,
        currencyCode: null
      })),
      taxRates: (typed.taxRates ?? []).map((taxRate) => ({
        externalId: taxRate.id,
        name: taxRate.name,
        rate: taxRate.rate,
        code: taxRate.code ?? null
      })),
      accounts: (typed.accounts ?? []).map((account) => ({
        externalId: account.id,
        code: account.code ?? null,
        name: account.name,
        type: account.type ?? null
      })),
      invoices: []
    };
  }

  mapExportRecord(record: CanonicalExportRecord): Record<string, unknown> {
    return {
      CustomerMemo: {
        value: record.contactName
      },
      DocNumber: record.invoiceNumber,
      TotalAmt: record.total,
      CurrencyRef: {
        value: record.currency
      },
      PrivateNote: `Exported from compliance layer, status=${record.status}`
    };
  }

  mapLiveImportPayload(input: {
    customers: QuickBooksCustomer[];
    invoices: QuickBooksInvoice[];
  }): CanonicalImportBundle {
    const contacts = input.customers.map((customer) =>
      this.mapCustomer(customer)
    );

    const contactNameById = new Map(
      input.customers.map((customer) => [
        customer.Id,
        customer.DisplayName?.trim() || "QuickBooks Customer"
      ])
    );

    const invoices = input.invoices.map((invoice) =>
      this.mapInvoice(invoice, contactNameById)
    );

    return {
      contacts,
      taxRates: [],
      accounts: [],
      invoices
    };
  }

  private mapCustomer(customer: QuickBooksCustomer): CanonicalContact {
    return {
      externalId: customer.Id,
      displayName: customer.DisplayName?.trim() || "QuickBooks Customer",
      email: customer.PrimaryEmailAddr?.Address?.trim() || null,
      phone:
        customer.PrimaryPhone?.FreeFormNumber?.trim() ||
        customer.Mobile?.FreeFormNumber?.trim() ||
        null,
      taxNumber: null,
      isCustomer: true,
      isSupplier: false,
      currencyCode: null
    };
  }

  private mapInvoice(
    invoice: QuickBooksInvoice,
    contactNameById: Map<string, string>
  ): CanonicalInvoice {
    const contactExternalId = invoice.CustomerRef?.value?.trim() || null;
    const fallbackContactName =
      invoice.CustomerRef?.name?.trim() ||
      (contactExternalId ? contactNameById.get(contactExternalId) : null) ||
      "QuickBooks Customer";

    const lines = (invoice.Line ?? [])
      .filter((line) => line.DetailType === "SalesItemLineDetail")
      .map((line) => this.mapInvoiceLine(line));

    const subtotal = this.round2(
      lines.reduce((sum, line) => sum + line.lineAmountExclusive, 0)
    );
    const taxTotal = this.round2(invoice.TotalTax ?? 0);
    const total = this.round2(invoice.TotalAmt ?? subtotal + taxTotal);
    const balance =
      typeof invoice.Balance === "number" ? this.round2(invoice.Balance) : null;
    const status = this.deriveInvoiceStatus(balance, total);

    return {
      externalId: invoice.Id,
      provider: this.provider,
      documentNumber: invoice.DocNumber?.trim() || `QBO-${invoice.Id}`,
      status,
      currency: invoice.CurrencyRef?.value?.trim() || "SAR",
      issueDate: invoice.TxnDate?.trim() || new Date().toISOString().slice(0, 10),
      dueDate: invoice.DueDate?.trim() || null,
      contactExternalId,
      contactDisplayName: fallbackContactName,
      subtotal,
      taxTotal,
      total,
      balance,
      lines,
      raw: invoice as Record<string, unknown>
    };
  }

  private deriveInvoiceStatus(balance: number | null, total: number) {
    if (balance !== null && balance <= 0 && total > 0) {
      return "PAID";
    }

    if (balance !== null && balance > 0 && balance < total) {
      return "PARTIALLY_PAID";
    }

    return "ISSUED";
  }

  private mapInvoiceLine(line: QuickBooksLine): CanonicalInvoiceLine {
    const quantity = Number(line.SalesItemLineDetail?.Qty ?? 1);
    const unitPrice =
      typeof line.SalesItemLineDetail?.UnitPrice === "number"
        ? line.SalesItemLineDetail.UnitPrice
        : Number(line.Amount ?? 0);

    const lineAmountExclusive = Number(line.Amount ?? quantity * unitPrice);

    return {
      externalId: line.Id?.trim() || null,
      description:
        line.Description?.trim() ||
        line.SalesItemLineDetail?.ItemRef?.name?.trim() ||
        "QuickBooks line",
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitPrice: this.round4(unitPrice),
      lineAmountExclusive: this.round2(lineAmountExclusive),
      lineAmountInclusive: null,
      taxAmount: null,
      taxCode: line.SalesItemLineDetail?.TaxCodeRef?.value?.trim() || null,
      taxRate: null,
      itemCode: line.SalesItemLineDetail?.ItemRef?.value?.trim() || null
    };
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private round4(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }
}
