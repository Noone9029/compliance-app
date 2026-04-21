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

type XeroBootstrapPayload = {
  Contacts?: Array<{
    ContactID?: string;
    Name?: string;
    EmailAddress?: string | null;
    Phones?: Array<{
      PhoneNumber?: string | null;
    }>;
    IsCustomer?: boolean;
    IsSupplier?: boolean;
    DefaultCurrency?: string | null;
  }>;
  TaxRates?: Array<{
    Name?: string;
    TaxType?: string;
    EffectiveRate?: number | string;
  }>;
  Accounts?: Array<{
    Code?: string;
    Name?: string;
    Type?: string;
    AccountID?: string;
  }>;
};

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

type XeroInvoiceLine = {
  LineItemID?: string;
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  LineAmount?: number;
  TaxAmount?: number;
  TaxType?: string;
  ItemCode?: string;
  AccountCode?: string;
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
  LineItems?: XeroInvoiceLine[];
};

@Injectable()
export class XeroAdapter implements ConnectorAdapter {
  readonly provider: ConnectorProvider = "XERO";

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
      Contacts: [
        {
          ContactID: "xero-demo-contact-1",
          Name: `${input.organizationName} Xero Contact`,
          EmailAddress: "xero@example.com",
          Phones: [{ PhoneNumber: "+966500000001" }],
          IsCustomer: true,
          IsSupplier: false,
          DefaultCurrency: input.defaultCurrencyCode
        }
      ],
      TaxRates: [
        {
          Name: "VAT 15%",
          TaxType: "OUTPUT",
          EffectiveRate: 15
        }
      ],
      Accounts: [
        {
          AccountID: "xero-account-1",
          Code: "200",
          Name: "Sales",
          Type: "REVENUE"
        }
      ]
    };
  }

  mapBootstrapImportPayload(payload: Record<string, unknown>): CanonicalImportBundle {
    const typed = payload as XeroBootstrapPayload;

    return {
      contacts: (typed.Contacts ?? []).map((contact): CanonicalContact => ({
        externalId: contact.ContactID ?? null,
        displayName: contact.Name?.trim() || "Xero Contact",
        email: contact.EmailAddress?.trim() || null,
        phone: contact.Phones?.[0]?.PhoneNumber?.trim() || null,
        taxNumber: null,
        isCustomer: Boolean(contact.IsCustomer ?? true),
        isSupplier: Boolean(contact.IsSupplier ?? false),
        currencyCode: contact.DefaultCurrency?.trim() || null
      })),
      taxRates: (typed.TaxRates ?? []).map((taxRate) => ({
        externalId: null,
        name: taxRate.Name?.trim() || "Xero Tax",
        rate: Number(taxRate.EffectiveRate ?? 0),
        code: taxRate.TaxType?.trim() || null
      })),
      accounts: (typed.Accounts ?? []).map((account) => ({
        externalId: account.AccountID ?? null,
        code: account.Code?.trim() || null,
        name: account.Name?.trim() || "Xero Account",
        type: account.Type?.trim() || null
      })),
      invoices: []
    };
  }

  mapExportRecord(record: CanonicalExportRecord): Record<string, unknown> {
    return {
      Contact: {
        Name: record.contactName
      },
      InvoiceNumber: record.invoiceNumber,
      Total: record.total,
      CurrencyCode: record.currency,
      Status: record.status
    };
  }

  mapLiveImportPayload(input: {
    contacts: XeroContact[];
    invoices: XeroInvoice[];
  }): CanonicalImportBundle {
    const contacts = input.contacts.map((contact) => this.mapContact(contact));

    const contactNameById = new Map(
      contacts
        .filter((contact) => contact.externalId?.trim())
        .map((contact) => [
          contact.externalId!.trim(),
          contact.displayName
        ])
    );

    const invoices = input.invoices
      .filter((invoice) => {
        const type = invoice.Type?.trim().toUpperCase();
        return !type || type === "ACCREC";
      })
      .map((invoice) => this.mapInvoice(invoice, contactNameById));

    return {
      contacts,
      taxRates: [],
      accounts: [],
      invoices
    };
  }

  private mapContact(contact: XeroContact): CanonicalContact {
    return {
      externalId: contact.ContactID?.trim() || null,
      displayName: contact.Name?.trim() || "Xero Contact",
      email: contact.EmailAddress?.trim() || null,
      phone: this.pickPhone(contact.Phones),
      taxNumber: contact.TaxNumber?.trim() || null,
      isCustomer: Boolean(contact.IsCustomer ?? true),
      isSupplier: Boolean(contact.IsSupplier ?? false),
      currencyCode: contact.DefaultCurrency?.trim() || null
    };
  }

  private mapInvoice(
    invoice: XeroInvoice,
    contactNameById: Map<string, string>
  ): CanonicalInvoice {
    const contactExternalId = invoice.Contact?.ContactID?.trim() || null;
    const contactDisplayName =
      invoice.Contact?.Name?.trim() ||
      (contactExternalId ? contactNameById.get(contactExternalId) : null) ||
      "Xero Contact";

    const lines = (invoice.LineItems ?? []).map((line) => this.mapInvoiceLine(line));

    const subtotal = this.round2(
      typeof invoice.SubTotal === "number"
        ? invoice.SubTotal
        : lines.reduce((sum, line) => sum + line.lineAmountExclusive, 0)
    );

    const taxTotal = this.round2(
      typeof invoice.TotalTax === "number"
        ? invoice.TotalTax
        : lines.reduce((sum, line) => sum + (line.taxAmount ?? 0), 0)
    );

    const total = this.round2(
      typeof invoice.Total === "number" ? invoice.Total : subtotal + taxTotal
    );

    const balance =
      typeof invoice.AmountDue === "number"
        ? this.round2(invoice.AmountDue)
        : null;

    const externalId =
      invoice.InvoiceID?.trim() ||
      invoice.InvoiceNumber?.trim() ||
      `xero-${contactExternalId ?? "invoice"}`;

    return {
      externalId,
      provider: this.provider,
      documentNumber: invoice.InvoiceNumber?.trim() || `XERO-${externalId}`,
      status: this.deriveInvoiceStatus(invoice.Status, balance, total),
      currency: invoice.CurrencyCode?.trim() || "SAR",
      issueDate:
        this.normalizeDate(invoice.DateString ?? invoice.Date) ??
        new Date().toISOString().slice(0, 10),
      dueDate: this.normalizeDate(invoice.DueDateString ?? invoice.DueDate, true),
      contactExternalId,
      contactDisplayName,
      subtotal,
      taxTotal,
      total,
      balance,
      lines,
      raw: invoice as Record<string, unknown>
    };
  }

  private mapInvoiceLine(line: XeroInvoiceLine): CanonicalInvoiceLine {
    const quantity = this.normalizeQuantity(line.Quantity);
    const unitPrice = this.round4(this.resolveUnitPrice(line, quantity));
    const lineAmountExclusive = this.round2(
      typeof line.LineAmount === "number"
        ? line.LineAmount
        : unitPrice * quantity
    );

    const taxAmount =
      typeof line.TaxAmount === "number" ? this.round2(line.TaxAmount) : null;

    const lineAmountInclusive =
      taxAmount === null ? null : this.round2(lineAmountExclusive + taxAmount);

    const taxRate =
      taxAmount !== null && lineAmountExclusive > 0
        ? this.round4((taxAmount / lineAmountExclusive) * 100)
        : null;

    return {
      externalId: line.LineItemID?.trim() || null,
      description: line.Description?.trim() || "Xero line",
      quantity,
      unitPrice,
      lineAmountExclusive,
      lineAmountInclusive,
      taxAmount,
      taxCode: line.TaxType?.trim() || null,
      taxRate,
      itemCode: line.ItemCode?.trim() || line.AccountCode?.trim() || null
    };
  }

  private deriveInvoiceStatus(
    status: string | undefined,
    balance: number | null,
    total: number
  ) {
    const normalized = status?.trim().toUpperCase() ?? "";

    if (normalized === "PAID") {
      return "PAID";
    }

    if (normalized === "VOIDED" || normalized === "DELETED") {
      return "VOIDED";
    }

    if (normalized === "DRAFT" || normalized === "SUBMITTED") {
      return "DRAFT";
    }

    if (balance !== null && balance <= 0 && total > 0) {
      return "PAID";
    }

    if (balance !== null && balance > 0 && balance < total) {
      return "PARTIALLY_PAID";
    }

    return normalized || "ISSUED";
  }

  private pickPhone(
    phones: Array<{ PhoneNumber?: string | null }> | undefined
  ) {
    for (const phone of phones ?? []) {
      const candidate = phone.PhoneNumber?.trim();
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  private normalizeQuantity(quantity: number | undefined) {
    const parsed = Number(quantity ?? 1);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1;
    }

    return parsed;
  }

  private resolveUnitPrice(line: XeroInvoiceLine, quantity: number) {
    if (typeof line.UnitAmount === "number") {
      return line.UnitAmount;
    }

    if (typeof line.LineAmount === "number") {
      return line.LineAmount / quantity;
    }

    return 0;
  }

  private normalizeDate(value: string | undefined, allowNull = false) {
    const candidate = value?.trim();
    if (!candidate) {
      return allowNull ? null : new Date().toISOString().slice(0, 10);
    }

    return candidate.slice(0, 10);
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private round4(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }
}
