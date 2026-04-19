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
export class ZohoBooksAdapter implements ConnectorAdapter {
  provider = "ZOHO_BOOKS" as const;

  buildPreview(input: ConnectorPreviewInput): ConnectorSyncPreviewRecord {
    return {
      connectorAccountId: input.connectorAccountId,
      provider: this.provider,
      direction: input.direction,
      scopes: [
        { scope: "contacts", recordCount: input.contactCount },
        { scope: "invoices", recordCount: input.invoiceCount },
        { scope: "vendor-bills", recordCount: input.billCount },
        { scope: "quotes", recordCount: input.quoteCount },
        { scope: "fixed-assets", recordCount: input.assetCount }
      ],
      generatedAt: new Date().toISOString()
    };
  }

  buildSuccessMessage(scopeCount: number) {
    return `Zoho Books export completed for ${scopeCount} scopes.`;
  }

  buildImportSuccessMessage(scopeCount: number) {
    return `Zoho Books bootstrap import completed for ${scopeCount} scopes.`;
  }

  buildBootstrapImportPayload(context: ConnectorBootstrapContext) {
    return {
      contacts: [
        {
          contact_id: `${context.organizationSlug}-zoho-contact`,
          contact_name: `${context.organizationName} Zoho Contact`,
          email: `zoho.${context.organizationSlug}@example.com`,
          contact_type: "customer",
          currency_code: context.currencyCode
        }
      ],
      taxes: [
        {
          tax_name: "Zoho VAT 15",
          tax_percentage: "15.00",
          tax_authority_id: "ZOHO15"
        }
      ],
      chart_of_accounts: [
        {
          account_code: "1390",
          account_name: "Zoho Fixed Assets",
          account_type: "ASSET"
        }
      ]
    };
  }

  mapBootstrapImportPayload(
    payload: Record<string, unknown>
  ): ConnectorBootstrapImportBundle {
    const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    const taxRates = Array.isArray(payload.taxes) ? payload.taxes : [];
    const accounts = Array.isArray(payload.chart_of_accounts)
      ? payload.chart_of_accounts
      : [];

    return {
      contacts: contacts.map((entry) => {
        const contact = entry as Record<string, unknown>;
        const contactType = String(contact.contact_type ?? "customer");
        return {
          displayName: String(contact.contact_name ?? "Imported Zoho Contact"),
          email: contact.email ? String(contact.email) : null,
          isCustomer: contactType !== "vendor",
          isSupplier: contactType === "vendor",
          currencyCode: contact.currency_code ? String(contact.currency_code) : null
        };
      }),
      taxRates: taxRates.map((entry) => {
        const taxRate = entry as Record<string, unknown>;
        return {
          name: String(taxRate.tax_name ?? "Imported Zoho Tax"),
          code: String(taxRate.tax_authority_id ?? "ZOHO"),
          rate: String(taxRate.tax_percentage ?? "0.00"),
          scope: "BOTH"
        };
      }),
      accounts: accounts.map((entry) => {
        const account = entry as Record<string, unknown>;
        return {
          code: String(account.account_code ?? "1300"),
          name: String(account.account_name ?? "Imported Zoho Account"),
          type: String(account.account_type ?? "ASSET") as
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
          contact_name: record.displayName,
          email: record.email,
          contact_type: record.isSupplier && !record.isCustomer ? "vendor" : "customer",
          currency_code: record.currencyCode
        };
      case "invoice":
        return {
          invoice_number: record.documentNumber,
          customer_name: record.contactName,
          total: record.total,
          currency_code: record.currencyCode,
          status: record.status
        };
      case "bill":
        return {
          bill_number: record.documentNumber,
          vendor_name: record.contactName,
          total: record.total,
          currency_code: record.currencyCode,
          status: record.status
        };
      case "quote":
        return {
          estimate_number: record.documentNumber,
          customer_name: record.contactName,
          total: record.total,
          currency_code: record.currencyCode,
          status: record.status
        };
      case "asset":
        return {
          asset_number: record.assetNumber,
          asset_name: record.name,
          net_book_value: record.netBookValue,
          currency_code: record.currencyCode
        };
    }
  }
}
