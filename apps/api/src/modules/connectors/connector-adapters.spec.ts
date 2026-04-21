import { describe, expect, it } from "vitest";

import type { CanonicalImportBundle } from "./connector-adapter";
import { QuickBooksAdapter } from "./quickbooks.adapter";
import { XeroAdapter } from "./xero.adapter";
import { ZohoBooksAdapter } from "./zoho-books.adapter";

const canonicalContactKeys = [
  "currencyCode",
  "displayName",
  "email",
  "externalId",
  "isCustomer",
  "isSupplier",
  "phone",
  "taxNumber",
];

const canonicalTaxRateKeys = ["code", "externalId", "name", "rate"];
const canonicalAccountKeys = ["code", "externalId", "name", "type"];

function expectCanonicalBundleShape(bundle: CanonicalImportBundle) {
  expect(Array.isArray(bundle.contacts)).toBe(true);
  expect(Array.isArray(bundle.taxRates)).toBe(true);
  expect(Array.isArray(bundle.accounts)).toBe(true);
  expect(Array.isArray(bundle.invoices)).toBe(true);
  expect(bundle.invoices).toHaveLength(0);

  expect(Object.keys(bundle.contacts[0]).sort()).toEqual(canonicalContactKeys);
  expect(Object.keys(bundle.taxRates[0]).sort()).toEqual(canonicalTaxRateKeys);
  expect(Object.keys(bundle.accounts[0]).sort()).toEqual(canonicalAccountKeys);
}

describe("connector adapters", () => {
  it("keeps Xero adapter contract aligned with canonical import/export expectations", async () => {
    const adapter = new XeroAdapter();
    expect(adapter.provider).toBe("XERO");

    const preview = await adapter.buildExportPreview({
      contacts: 2,
      invoices: 3,
      bills: 4,
      quotes: 5,
    });
    const payload = await adapter.buildBootstrapImportPayload({
      organizationName: "Nomad Events",
      defaultCurrencyCode: "SAR",
    });
    const bundle = adapter.mapBootstrapImportPayload(payload);
    const exportRecord = adapter.mapExportRecord({
      contactName: "Nomad Client",
      invoiceNumber: "INV-1001",
      total: 115,
      currency: "SAR",
      status: "ISSUED",
    });
    const live = adapter.mapLiveImportPayload({
      contacts: [
        {
          ContactID: "xero-contact-1",
          Name: "Acme Holdings",
          EmailAddress: "finance@acme.example",
          Phones: [{ PhoneNumber: "+966500000101" }],
          IsCustomer: true,
          IsSupplier: false,
          DefaultCurrency: "SAR",
        },
      ],
      invoices: [
        {
          InvoiceID: "xero-invoice-1",
          InvoiceNumber: "XERO-INV-1",
          Type: "ACCREC",
          Status: "AUTHORISED",
          DateString: "2026-04-20T00:00:00",
          DueDateString: "2026-04-30T00:00:00",
          CurrencyCode: "SAR",
          Contact: {
            ContactID: "xero-contact-1",
            Name: "Acme Holdings",
          },
          SubTotal: 100,
          TotalTax: 15,
          Total: 115,
          AmountDue: 115,
          LineItems: [
            {
              LineItemID: "xero-line-1",
              Description: "Consulting",
              Quantity: 1,
              UnitAmount: 100,
              LineAmount: 100,
              TaxAmount: 15,
              TaxType: "OUTPUT2",
              ItemCode: "CONSULTING-01",
            },
          ],
        },
        {
          InvoiceID: "xero-invoice-2",
          InvoiceNumber: "XERO-INV-2",
          Type: "ACCREC",
          Status: "PAID",
          DateString: "2026-04-20T00:00:00",
          CurrencyCode: "SAR",
          Contact: {
            ContactID: "xero-contact-1",
            Name: "Acme Holdings",
          },
          SubTotal: 100,
          TotalTax: 15,
          Total: 115,
          AmountDue: 0,
          LineItems: [
            {
              LineItemID: "xero-line-2",
              Description: "Retainer",
              Quantity: 1,
              UnitAmount: 100,
              LineAmount: 100,
              TaxAmount: 15,
              TaxType: "OUTPUT2",
              ItemCode: "RETAINER-01",
            },
          ],
        },
      ],
    });

    expect(preview).toEqual({
      provider: "XERO",
      summary: {
        contacts: 2,
        invoices: 3,
        bills: 4,
        quotes: 5,
      },
    });
    expectCanonicalBundleShape(bundle);
    expect(bundle.accounts[0].type).toBe("REVENUE");
    expect(exportRecord).toMatchObject({
      Contact: {
        Name: "Nomad Client",
      },
      InvoiceNumber: "INV-1001",
      CurrencyCode: "SAR",
      Total: 115,
      Status: "ISSUED",
    });

    expect(live.contacts).toHaveLength(1);
    expect(live.contacts[0]).toMatchObject({
      externalId: "xero-contact-1",
      displayName: "Acme Holdings",
      email: "finance@acme.example",
      phone: "+966500000101",
      isCustomer: true,
      isSupplier: false,
      currencyCode: "SAR",
    });

    expect(live.invoices).toHaveLength(2);
    expect(live.invoices[0]).toMatchObject({
      externalId: "xero-invoice-1",
      provider: "XERO",
      documentNumber: "XERO-INV-1",
      status: "AUTHORISED",
      currency: "SAR",
      contactExternalId: "xero-contact-1",
      contactDisplayName: "Acme Holdings",
      subtotal: 100,
      taxTotal: 15,
      total: 115,
      balance: 115,
    });
    expect(live.invoices[0].lines[0]).toMatchObject({
      externalId: "xero-line-1",
      description: "Consulting",
      quantity: 1,
      unitPrice: 100,
      lineAmountExclusive: 100,
      lineAmountInclusive: 115,
      taxAmount: 15,
      taxCode: "OUTPUT2",
      itemCode: "CONSULTING-01",
    });
    expect(live.invoices[1].status).toBe("PAID");

    for (const invoice of live.invoices) {
      expect(invoice.raw).toBeTruthy();
      expect(typeof invoice.raw).toBe("object");
    }
  });

  it("keeps QuickBooks adapter contract aligned and maps live payloads into canonical records", async () => {
    const adapter = new QuickBooksAdapter();
    expect(adapter.provider).toBe("QUICKBOOKS_ONLINE");

    const preview = await adapter.buildExportPreview({
      contacts: 1,
      invoices: 2,
      bills: 3,
      quotes: 4,
    });
    const payload = await adapter.buildBootstrapImportPayload({
      organizationName: "Nomad Events",
      defaultCurrencyCode: "SAR",
    });
    const bundle = adapter.mapBootstrapImportPayload(payload);
    const exportRecord = adapter.mapExportRecord({
      contactName: "Nomad Client",
      invoiceNumber: "INV-1002",
      total: 230,
      currency: "SAR",
      status: "ISSUED",
    });

    const live = adapter.mapLiveImportPayload({
      customers: [
        {
          Id: "cust-1",
          DisplayName: "Alpha Trading",
          PrimaryEmailAddr: { Address: "alpha@example.com" },
          PrimaryPhone: { FreeFormNumber: "+966500000011" },
        },
      ],
      invoices: [
        {
          Id: "inv-1",
          DocNumber: "QBO-INV-1",
          TxnDate: "2026-04-20",
          DueDate: "2026-04-30",
          CurrencyRef: { value: "SAR" },
          CustomerRef: { value: "cust-1", name: "Alpha Trading" },
          TotalAmt: 115,
          Balance: 115,
          TotalTax: 15,
          Line: [
            {
              Id: "line-1",
              Description: "Consulting hours",
              Amount: 100,
              DetailType: "SalesItemLineDetail",
              SalesItemLineDetail: {
                Qty: 1,
                UnitPrice: 100,
                ItemRef: { value: "svc-1", name: "Consulting Service" },
                TaxCodeRef: { value: "S" },
              },
            },
          ],
        },
        {
          Id: "inv-2",
          DocNumber: "QBO-INV-2",
          TxnDate: "2026-04-20",
          CurrencyRef: { value: "SAR" },
          CustomerRef: { value: "cust-1", name: "Alpha Trading" },
          TotalAmt: 115,
          Balance: 0,
          TotalTax: 15,
          Line: [
            {
              Id: "line-2",
              Description: "Retainer",
              Amount: 100,
              DetailType: "SalesItemLineDetail",
              SalesItemLineDetail: {
                Qty: 1,
                UnitPrice: 100,
                ItemRef: { value: "svc-2", name: "Retainer Service" },
                TaxCodeRef: { value: "S" },
              },
            },
          ],
        },
      ],
    });

    expect(preview).toEqual({
      provider: "QUICKBOOKS_ONLINE",
      summary: {
        contacts: 1,
        invoices: 2,
        bills: 3,
        quotes: 4,
      },
    });
    expectCanonicalBundleShape(bundle);
    expect(bundle.taxRates[0].code).toBe("S");
    expect(exportRecord).toMatchObject({
      CustomerMemo: { value: "Nomad Client" },
      DocNumber: "INV-1002",
      CurrencyRef: { value: "SAR" },
      TotalAmt: 230,
    });

    expect(live.contacts).toHaveLength(1);
    expect(live.contacts[0]).toMatchObject({
      externalId: "cust-1",
      displayName: "Alpha Trading",
      email: "alpha@example.com",
      isCustomer: true,
      isSupplier: false,
    });

    expect(live.invoices).toHaveLength(2);
    expect(live.invoices[0]).toMatchObject({
      externalId: "inv-1",
      provider: "QUICKBOOKS_ONLINE",
      documentNumber: "QBO-INV-1",
      status: "ISSUED",
      currency: "SAR",
      contactExternalId: "cust-1",
      contactDisplayName: "Alpha Trading",
      subtotal: 100,
      taxTotal: 15,
      total: 115,
      balance: 115,
    });
    expect(live.invoices[0].lines[0]).toMatchObject({
      externalId: "line-1",
      description: "Consulting hours",
      quantity: 1,
      unitPrice: 100,
      lineAmountExclusive: 100,
      taxCode: "S",
      itemCode: "svc-1",
    });
    expect(live.invoices[1].status).toBe("PAID");

    for (const invoice of live.invoices) {
      expect(invoice.raw).toBeTruthy();
      expect(typeof invoice.raw).toBe("object");
    }
  });

  it("derives PARTIALLY_PAID for QuickBooks invoices when balance is between zero and total", () => {
    const adapter = new QuickBooksAdapter();
    const live = adapter.mapLiveImportPayload({
      customers: [{ Id: "cust-2", DisplayName: "Partial Co" }],
      invoices: [
        {
          Id: "inv-partial",
          DocNumber: "QBO-INV-PARTIAL",
          TxnDate: "2026-04-20",
          CurrencyRef: { value: "SAR" },
          CustomerRef: { value: "cust-2", name: "Partial Co" },
          TotalAmt: 115,
          Balance: 40,
          TotalTax: 15,
          Line: [
            {
              Id: "line-partial",
              Description: "Partial status line",
              Amount: 100,
              DetailType: "SalesItemLineDetail",
              SalesItemLineDetail: {
                Qty: 1,
                UnitPrice: 100,
              },
            },
          ],
        },
      ],
    });

    expect(live.invoices).toHaveLength(1);
    expect(live.invoices[0].status).toBe("PARTIALLY_PAID");
  });

  it("keeps Zoho adapter contract aligned with canonical import/export expectations", async () => {
    const adapter = new ZohoBooksAdapter();
    expect(adapter.provider).toBe("ZOHO_BOOKS");

    const preview = await adapter.buildExportPreview({
      contacts: 8,
      invoices: 9,
      bills: 10,
      quotes: 11,
    });
    const payload = await adapter.buildBootstrapImportPayload({
      organizationName: "Nomad Events",
      defaultCurrencyCode: "SAR",
    });
    const bundle = adapter.mapBootstrapImportPayload(payload);
    const exportRecord = adapter.mapExportRecord({
      contactName: "Nomad Client",
      invoiceNumber: "INV-1003",
      total: 900,
      currency: "SAR",
      status: "ISSUED",
    });
    const live = adapter.mapLiveImportPayload({
      contacts: [
        {
          contact_id: "zoho-contact-1",
          contact_name: "Nomad Trading",
          email: "billing@nomadtrading.example",
          phone: "+966500000121",
          is_customer: true,
          is_vendor: false,
          currency_code: "SAR",
          tax_number: "300123456700003",
        },
      ],
      invoices: [
        {
          invoice_id: "zoho-invoice-1",
          invoice_number: "ZB-INV-1",
          status: "sent",
          date: "2026-04-20",
          due_date: "2026-04-30",
          currency_code: "SAR",
          customer_id: "zoho-contact-1",
          customer_name: "Nomad Trading",
          sub_total: 100,
          tax_total: 15,
          total: 115,
          balance: 115,
          line_items: [
            {
              line_item_id: "zoho-line-1",
              name: "Consulting package",
              description: "Monthly consulting package",
              quantity: 1,
              rate: 100,
              item_total: 100,
              tax_amount: 15,
              tax_name: "VAT 15%",
              tax_percentage: 15,
              item_id: "service-1",
            },
          ],
        },
        {
          invoice_id: "zoho-invoice-2",
          invoice_number: "ZB-INV-2",
          status: "paid",
          date: "2026-04-20",
          currency_code: "SAR",
          customer_id: "zoho-contact-1",
          customer_name: "Nomad Trading",
          sub_total: 100,
          tax_total: 15,
          total: 115,
          balance: 0,
          line_items: [
            {
              line_item_id: "zoho-line-2",
              name: "Retainer",
              quantity: 1,
              rate: 100,
              item_total: 100,
              tax_amount: 15,
              tax_name: "VAT 15%",
              tax_percentage: 15,
              item_id: "service-2",
            },
          ],
        },
      ],
    });

    expect(preview).toEqual({
      provider: "ZOHO_BOOKS",
      summary: {
        contacts: 8,
        invoices: 9,
        bills: 10,
        quotes: 11,
      },
    });
    expectCanonicalBundleShape(bundle);
    expect(bundle.accounts[0].type).toBe("REVENUE");
    expect(exportRecord).toMatchObject({
      invoice_number: "INV-1003",
      customer_name: "Nomad Client",
      total: 900,
      currency_code: "SAR",
      status: "ISSUED",
    });

    expect(live.contacts).toHaveLength(1);
    expect(live.contacts[0]).toMatchObject({
      externalId: "zoho-contact-1",
      displayName: "Nomad Trading",
      email: "billing@nomadtrading.example",
      phone: "+966500000121",
      taxNumber: "300123456700003",
      isCustomer: true,
      isSupplier: false,
      currencyCode: "SAR",
    });

    expect(live.invoices).toHaveLength(2);
    expect(live.invoices[0]).toMatchObject({
      externalId: "zoho-invoice-1",
      provider: "ZOHO_BOOKS",
      documentNumber: "ZB-INV-1",
      status: "SENT",
      currency: "SAR",
      contactExternalId: "zoho-contact-1",
      contactDisplayName: "Nomad Trading",
      subtotal: 100,
      taxTotal: 15,
      total: 115,
      balance: 115,
    });
    expect(live.invoices[0].lines[0]).toMatchObject({
      externalId: "zoho-line-1",
      description: "Monthly consulting package",
      quantity: 1,
      unitPrice: 100,
      lineAmountExclusive: 100,
      lineAmountInclusive: 115,
      taxAmount: 15,
      taxCode: "VAT 15%",
      taxRate: 15,
      itemCode: "service-1",
    });
    expect(live.invoices[1].status).toBe("PAID");

    for (const invoice of live.invoices) {
      expect(invoice.raw).toBeTruthy();
      expect(typeof invoice.raw).toBe("object");
    }
  });
});
