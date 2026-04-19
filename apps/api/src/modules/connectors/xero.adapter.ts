import { Injectable } from "@nestjs/common";
import type { ConnectorProvider } from "@daftar/types";

import type {
  CanonicalContact,
  CanonicalExportRecord,
  CanonicalImportBundle,
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
}