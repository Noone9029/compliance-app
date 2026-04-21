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

type ZohoBootstrapPayload = {
  contacts?: Array<{
    contact_id?: string;
    contact_name?: string;
    email?: string | null;
    phone?: string | null;
    is_customer?: boolean;
    is_supplier?: boolean;
    currency_code?: string | null;
  }>;
  taxes?: Array<{
    tax_id?: string;
    tax_name?: string;
    tax_percentage?: number | string;
    tax_authority_id?: string | null;
  }>;
  chart_of_accounts?: Array<{
    account_id?: string;
    account_code?: string | null;
    account_name?: string;
    account_type?: string | null;
  }>;
};

type ZohoLiveContact = {
  contact_id?: string;
  contact_name?: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  is_customer?: boolean;
  is_vendor?: boolean;
  currency_code?: string | null;
  tax_number?: string | null;
};

type ZohoLiveInvoiceLine = {
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

type ZohoLiveInvoice = {
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
  line_items?: ZohoLiveInvoiceLine[];
};

@Injectable()
export class ZohoBooksAdapter implements ConnectorAdapter {
  readonly provider: ConnectorProvider = "ZOHO_BOOKS";

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
      contacts: [
        {
          contact_id: "zoho-demo-contact-1",
          contact_name: `${input.organizationName} Zoho Contact`,
          email: "zoho@example.com",
          phone: "+966500000002",
          is_customer: true,
          is_supplier: false,
          currency_code: input.defaultCurrencyCode
        }
      ],
      taxes: [
        {
          tax_id: "zoho-tax-1",
          tax_name: "VAT 15%",
          tax_percentage: 15,
          tax_authority_id: "VAT15"
        }
      ],
      chart_of_accounts: [
        {
          account_id: "zoho-account-1",
          account_code: "300",
          account_name: "Revenue",
          account_type: "REVENUE"
        }
      ]
    };
  }

  mapBootstrapImportPayload(payload: Record<string, unknown>): CanonicalImportBundle {
    const typed = payload as ZohoBootstrapPayload;

    return {
      contacts: (typed.contacts ?? []).map((contact): CanonicalContact => ({
        externalId: contact.contact_id ?? null,
        displayName: contact.contact_name?.trim() || "Zoho Contact",
        email: contact.email?.trim() || null,
        phone: contact.phone?.trim() || null,
        taxNumber: null,
        isCustomer: Boolean(contact.is_customer ?? true),
        isSupplier: Boolean(contact.is_supplier ?? false),
        currencyCode: contact.currency_code?.trim() || null
      })),
      taxRates: (typed.taxes ?? []).map((taxRate) => ({
        externalId: taxRate.tax_id ?? null,
        name: taxRate.tax_name?.trim() || "Zoho Tax",
        rate: Number(taxRate.tax_percentage ?? 0),
        code: taxRate.tax_authority_id?.trim() || null
      })),
      accounts: (typed.chart_of_accounts ?? []).map((account) => ({
        externalId: account.account_id ?? null,
        code: account.account_code?.trim() || null,
        name: account.account_name?.trim() || "Zoho Account",
        type: account.account_type?.trim() || null
      })),
      invoices: []
    };
  }

  mapExportRecord(record: CanonicalExportRecord): Record<string, unknown> {
    return {
      invoice_number: record.invoiceNumber,
      customer_name: record.contactName,
      total: record.total,
      currency_code: record.currency,
      status: record.status
    };
  }

  mapLiveImportPayload(input: {
    contacts: ZohoLiveContact[];
    invoices: ZohoLiveInvoice[];
  }): CanonicalImportBundle {
    const contacts = input.contacts.map((contact) => this.mapContact(contact));

    const contactNameById = new Map(
      contacts
        .filter((contact) => contact.externalId?.trim())
        .map((contact) => [contact.externalId!.trim(), contact.displayName])
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

  private mapContact(contact: ZohoLiveContact): CanonicalContact {
    return {
      externalId: contact.contact_id?.trim() || null,
      displayName: contact.contact_name?.trim() || "Zoho Contact",
      email: contact.email?.trim() || null,
      phone: contact.phone?.trim() || contact.mobile?.trim() || null,
      taxNumber: contact.tax_number?.trim() || null,
      isCustomer: Boolean(contact.is_customer ?? true),
      isSupplier: Boolean(contact.is_vendor ?? false),
      currencyCode: contact.currency_code?.trim() || null
    };
  }

  private mapInvoice(
    invoice: ZohoLiveInvoice,
    contactNameById: Map<string, string>
  ): CanonicalInvoice {
    const contactExternalId = invoice.customer_id?.trim() || null;
    const contactDisplayName =
      invoice.customer_name?.trim() ||
      (contactExternalId ? contactNameById.get(contactExternalId) : null) ||
      "Zoho Contact";

    const lines = (invoice.line_items ?? []).map((line) => this.mapInvoiceLine(line));

    const subtotal = this.round2(
      typeof invoice.sub_total === "number"
        ? invoice.sub_total
        : lines.reduce((sum, line) => sum + line.lineAmountExclusive, 0)
    );

    const taxTotal = this.round2(
      typeof invoice.tax_total === "number"
        ? invoice.tax_total
        : lines.reduce((sum, line) => sum + (line.taxAmount ?? 0), 0)
    );

    const total = this.round2(
      typeof invoice.total === "number" ? invoice.total : subtotal + taxTotal
    );

    const balance =
      typeof invoice.balance === "number" ? this.round2(invoice.balance) : null;

    const externalId =
      invoice.invoice_id?.trim() ||
      invoice.invoice_number?.trim() ||
      `zoho-${contactExternalId ?? "invoice"}`;

    return {
      externalId,
      provider: this.provider,
      documentNumber: invoice.invoice_number?.trim() || `ZOHO-${externalId}`,
      status: this.deriveInvoiceStatus(invoice.status, balance, total),
      currency: invoice.currency_code?.trim() || "SAR",
      issueDate: this.normalizeDate(invoice.date) ?? new Date().toISOString().slice(0, 10),
      dueDate: this.normalizeDate(invoice.due_date, true),
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

  private mapInvoiceLine(line: ZohoLiveInvoiceLine): CanonicalInvoiceLine {
    const quantity = this.normalizeQuantity(line.quantity);
    const unitPrice = this.round4(this.resolveUnitPrice(line, quantity));
    const lineAmountExclusive = this.round2(
      typeof line.item_total === "number" ? line.item_total : unitPrice * quantity
    );

    const taxAmount =
      typeof line.tax_amount === "number" ? this.round2(line.tax_amount) : null;

    const lineAmountInclusive =
      taxAmount === null ? null : this.round2(lineAmountExclusive + taxAmount);

    return {
      externalId: line.line_item_id?.trim() || null,
      description: line.description?.trim() || line.name?.trim() || "Zoho line",
      quantity,
      unitPrice,
      lineAmountExclusive,
      lineAmountInclusive,
      taxAmount,
      taxCode: line.tax_name?.trim() || null,
      taxRate:
        typeof line.tax_percentage === "number"
          ? this.round4(line.tax_percentage)
          : null,
      itemCode: line.item_id?.trim() || null
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

    if (normalized === "VOID" || normalized === "VOIDED") {
      return "VOID";
    }

    if (normalized === "DRAFT") {
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

  private normalizeQuantity(quantity: number | undefined) {
    const parsed = Number(quantity ?? 1);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1;
    }

    return parsed;
  }

  private resolveUnitPrice(line: ZohoLiveInvoiceLine, quantity: number) {
    if (typeof line.rate === "number") {
      return line.rate;
    }

    if (typeof line.item_total === "number") {
      return line.item_total / quantity;
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
