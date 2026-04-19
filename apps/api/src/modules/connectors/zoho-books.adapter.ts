import { Injectable } from "@nestjs/common";
import type { ConnectorProvider } from "@daftar/types";

import type {
  CanonicalContact,
  CanonicalExportRecord,
  CanonicalImportBundle,
  ConnectorAdapter,
  ConnectorExportPreview
} from "./connector-adapter";

type ZohoBootstrapPayload = {
  contacts?: Array<{
    contact_id?: string;
    contact_name?: string;
    email?: string | null;
    phone?: string | null;
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
          phone: "+966500000002"
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
        isCustomer: true,
        isSupplier: false,
        currencyCode: null
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
}