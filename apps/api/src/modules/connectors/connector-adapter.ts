import type { ConnectorProvider } from "@daftar/types";

export type ConnectorExportPreview = {
  contacts: number;
  invoices: number;
  bills: number;
  quotes: number;
};

export type CanonicalContact = {
  externalId?: string | null;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  currencyCode?: string | null;
};

export type CanonicalTaxRate = {
  externalId?: string | null;
  name: string;
  rate: number;
  code?: string | null;
};

export type CanonicalAccount = {
  externalId?: string | null;
  code?: string | null;
  name: string;
  type?: string | null;
};

export type CanonicalInvoiceLine = {
  externalId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineAmountExclusive: number;
  lineAmountInclusive?: number | null;
  taxAmount?: number | null;
  taxCode?: string | null;
  taxRate?: number | null;
  itemCode?: string | null;
};

export type CanonicalInvoice = {
  externalId: string;
  provider: ConnectorProvider;
  documentNumber: string;
  status: string;
  currency: string;
  issueDate: string;
  dueDate?: string | null;
  contactExternalId?: string | null;
  contactDisplayName: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  balance?: number | null;
  lines: CanonicalInvoiceLine[];
  raw: Record<string, unknown>;
};

export type CanonicalImportBundle = {
  contacts: CanonicalContact[];
  taxRates: CanonicalTaxRate[];
  accounts: CanonicalAccount[];
  invoices: CanonicalInvoice[];
};

export type CanonicalExportRecord = {
  contactName: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  status: string;
};

export interface ConnectorAdapter {
  readonly provider: ConnectorProvider;

  buildExportPreview(input: ConnectorExportPreview): Promise<Record<string, unknown>>;

  buildBootstrapImportPayload(input: {
    organizationName: string;
    defaultCurrencyCode: string;
  }): Promise<Record<string, unknown>>;

  mapBootstrapImportPayload(payload: Record<string, unknown>): CanonicalImportBundle;

  mapExportRecord(record: CanonicalExportRecord): Record<string, unknown>;
}