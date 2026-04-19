import { describe, expect, it } from "vitest";

import { QuickBooksAdapter } from "./quickbooks.adapter";
import { XeroAdapter } from "./xero.adapter";
import { ZohoBooksAdapter } from "./zoho-books.adapter";

const canonicalKeys = [
  "currencyCode",
  "displayName",
  "email",
  "isCustomer",
  "isSupplier"
];

describe("connector adapters", () => {
  it("maps Xero bootstrap payloads into canonical records and exports provider-shaped records", () => {
    const adapter = new XeroAdapter();
    const payload = adapter.buildBootstrapImportPayload({
      organizationName: "Nomad Events",
      organizationSlug: "nomad-events",
      currencyCode: "SAR"
    });
    const bundle = adapter.mapBootstrapImportPayload(payload);
    const exportRecord = adapter.mapCanonicalExportRecord({
      entity: "invoice",
      documentNumber: "INV-1001",
      contactName: "Nomad Client",
      total: "115.00",
      currencyCode: "SAR",
      status: "ISSUED"
    });

    expect(Object.keys(bundle.contacts[0]).sort()).toEqual(canonicalKeys);
    expect(bundle.accounts[0].type).toBe("REVENUE");
    expect(exportRecord).toMatchObject({
      Type: "ACCREC",
      InvoiceNumber: "INV-1001",
      CurrencyCode: "SAR"
    });
  });

  it("maps QuickBooks payloads into canonical records without leaking provider schema", () => {
    const adapter = new QuickBooksAdapter();
    const payload = adapter.buildBootstrapImportPayload({
      organizationName: "Nomad Events",
      organizationSlug: "nomad-events",
      currencyCode: "SAR"
    });
    const bundle = adapter.mapBootstrapImportPayload(payload);
    const exportRecord = adapter.mapCanonicalExportRecord({
      entity: "contact",
      displayName: "Nomad Client",
      email: "client@example.com",
      isCustomer: true,
      isSupplier: false,
      currencyCode: "SAR"
    });

    expect(Object.keys(bundle.contacts[0]).sort()).toEqual(canonicalKeys);
    expect(bundle.taxRates[0].code).toBe("QBO15");
    expect(exportRecord).toMatchObject({
      DisplayName: "Nomad Client",
      PrimaryEmailAddr: { Address: "client@example.com" },
      CurrencyRef: { value: "SAR" }
    });
  });

  it("maps Zoho payloads into canonical records and keeps provider-specific fields out of the core domain", () => {
    const adapter = new ZohoBooksAdapter();
    const payload = adapter.buildBootstrapImportPayload({
      organizationName: "Nomad Events",
      organizationSlug: "nomad-events",
      currencyCode: "SAR"
    });
    const bundle = adapter.mapBootstrapImportPayload(payload);
    const exportRecord = adapter.mapCanonicalExportRecord({
      entity: "asset",
      assetNumber: "FA-1001",
      name: "Display Wall",
      netBookValue: "900.00",
      currencyCode: "SAR"
    });

    expect(Object.keys(bundle.contacts[0]).sort()).toEqual(canonicalKeys);
    expect(bundle.accounts[0].type).toBe("ASSET");
    expect(exportRecord).toMatchObject({
      asset_number: "FA-1001",
      asset_name: "Display Wall",
      net_book_value: "900.00"
    });
  });
});
