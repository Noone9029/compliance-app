import { Injectable } from "@nestjs/common";
import type { ConnectorSyncPreviewRecord } from "@daftar/types";

import type {
  ConnectorAdapter,
  ConnectorBootstrapContext,
  ConnectorBootstrapImportBundle,
  ConnectorCanonicalExportRecord,
  ConnectorPreviewInput
} from "./connector-adapter";

@Injectable()
export class XeroAdapter implements ConnectorAdapter {
  provider = "XERO" as const;

  buildPreview(input: ConnectorPreviewInput): ConnectorSyncPreviewRecord {
    return {
      connectorAccountId: input.connectorAccountId,
      provider: this.provider,
      direction: input.direction,
      scopes: [
        { scope: "contacts", recordCount: input.contactCount },
        { scope: "invoices", recordCount: input.invoiceCount },
        { scope: "bills", recordCount: input.billCount },
        { scope: "quotes", recordCount: input.quoteCount }
      ],
      generatedAt: new Date().toISOString()
    };
  }

  buildSuccessMessage(scopeCount: number) {
    return `Xero export completed for ${scopeCount} scopes.`;
  }

  buildImportSuccessMessage(scopeCount: number) {
    return `Xero bootstrap import completed for ${scopeCount} scopes.`;
  }

  buildBootstrapImportPayload(context: ConnectorBootstrapContext) {
    return {
      Contacts: [
        {
          ContactID: `${context.organizationSlug}-xero-contact`,
          Name: `${context.organizationName} Xero Customer`,
          EmailAddress: `xero.${context.organizationSlug}@example.com`,
          IsCustomer: true,
          IsSupplier: false,
          DefaultCurrency: context.currencyCode
        }
      ],
      TaxRates: [
        {
          Name: "Xero VAT 15",
          TaxType: "OUTPUT2",
          EffectiveRate: "15.00"
        }
      ],
      Accounts: [
        {
          Code: "4190",
          Name: "Xero Revenue",
          Type: "REVENUE"
        }
      ]
    };
  }

  mapBootstrapImportPayload(
    payload: Record<string, unknown>
  ): ConnectorBootstrapImportBundle {
    const contacts = Array.isArray(payload.Contacts) ? payload.Contacts : [];
    const taxRates = Array.isArray(payload.TaxRates) ? payload.TaxRates : [];
    const accounts = Array.isArray(payload.Accounts) ? payload.Accounts : [];

    return {
      contacts: contacts.map((entry) => {
        const contact = entry as Record<string, unknown>;
        return {
          displayName: String(contact.Name ?? "Imported Xero Contact"),
          email: contact.EmailAddress ? String(contact.EmailAddress) : null,
          isCustomer: Boolean(contact.IsCustomer ?? true),
          isSupplier: Boolean(contact.IsSupplier ?? false),
          currencyCode: contact.DefaultCurrency ? String(contact.DefaultCurrency) : null
        };
      }),
      taxRates: taxRates.map((entry) => {
        const taxRate = entry as Record<string, unknown>;
        return {
          name: String(taxRate.Name ?? "Imported Xero Tax"),
          code: String(taxRate.TaxType ?? "XERO"),
          rate: String(taxRate.EffectiveRate ?? "0.00"),
          scope: "BOTH"
        };
      }),
      accounts: accounts.map((entry) => {
        const account = entry as Record<string, unknown>;
        return {
          code: String(account.Code ?? "4100"),
          name: String(account.Name ?? "Imported Xero Account"),
          type: String(account.Type ?? "REVENUE") as
            | "ASSET"
            | "LIABILITY"
            | "EQUITY"
            | "REVENUE"
            | "EXPENSE"
        };
      })
    };
  }

  mapCanonicalExportRecord(record: ConnectorCanonicalExportRecord) {
    switch (record.entity) {
      case "contact":
        return {
          Name: record.displayName,
          EmailAddress: record.email,
          IsCustomer: record.isCustomer,
          IsSupplier: record.isSupplier,
          DefaultCurrency: record.currencyCode
        };
      case "invoice":
        return {
          Type: "ACCREC",
          InvoiceNumber: record.documentNumber,
          Contact: { Name: record.contactName },
          Total: record.total,
          CurrencyCode: record.currencyCode,
          Status: record.status
        };
      case "bill":
        return {
          Type: "ACCPAY",
          InvoiceNumber: record.documentNumber,
          Contact: { Name: record.contactName },
          Total: record.total,
          CurrencyCode: record.currencyCode,
          Status: record.status
        };
      case "quote":
        return {
          QuoteNumber: record.documentNumber,
          Contact: { Name: record.contactName },
          Total: record.total,
          CurrencyCode: record.currencyCode,
          Status: record.status
        };
      case "asset":
        return {
          AssetNumber: record.assetNumber,
          AssetName: record.name,
          BookValue: record.netBookValue,
          CurrencyCode: record.currencyCode
        };
    }
  }
}
