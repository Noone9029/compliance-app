import Link from "next/link";
import React from "react";
import type {
  BankAccountRecord,
  ContactSummary,
  InventoryItemSummary,
  PurchaseBillDetail,
  PurchaseBillSummary,
  QuoteDetail,
  QuoteSummary,
  ReportedDocumentRecord,
  SalesInvoiceDetail,
  SalesInvoiceSummary,
  TaxRateRecord
} from "@daftar/types";
import {
  purchaseBillStatuses,
  quoteStatuses,
  salesInvoiceStatuses
} from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { presentContactName } from "../presentation";
import { SectionNav } from "../week2/section-nav";
import { getCapabilities, hasPermission } from "../week2/route-utils";
import { ActionButton } from "./action-button";
import { DocumentDetail } from "./document-detail";
import { DocumentForm } from "./document-form";
import { DocumentListTableClient } from "./document-list-table-client";
import { PaymentForm } from "./payment-form";
import {
  money,
  toneForBillStatus,
  toneForComplianceStatus,
  toneForInvoiceStatus,
  toneForQuoteStatus
} from "./shared";

const publicApiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type DocumentListFilters = {
  search?: string;
  status?: string;
  contactId?: string;
  from?: string;
  to?: string;
};

function accountingNav(orgSlug: string, activeKey: "sales" | "purchases" | "quotes") {
  return [
    { href: `/${orgSlug}/accounting/sales`, label: "Sales", active: activeKey === "sales" },
    {
      href: `/${orgSlug}/accounting/purchases`,
      label: "Purchases",
      active: activeKey === "purchases"
    },
    { href: `/${orgSlug}/accounting/quotes`, label: "Quotes", active: activeKey === "quotes" }
  ];
}

function mapTaxRates(taxRates: TaxRateRecord[]) {
  return taxRates.map((taxRate) => ({
    id: taxRate.id,
    label: `${taxRate.name} (${taxRate.rate}%)`
  }));
}

function mapContacts(contacts: ContactSummary[]) {
  return contacts.map((contact) => ({
    id: contact.id,
    label: presentContactName(contact.displayName)
  }));
}

function mapInventoryItems(items: InventoryItemSummary[]) {
  return items.map((item) => ({
    id: item.id,
    label: `${item.itemCode} · ${item.itemName}`,
    itemName: item.itemName,
    costPrice: item.costPrice,
    salePrice: item.salePrice
  }));
}

function dateInputValue(value: string) {
  return value.slice(0, 10);
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function listFiltersFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): DocumentListFilters {
  return {
    search: firstQueryValue(searchParams.search),
    status: firstQueryValue(searchParams.status),
    contactId: firstQueryValue(searchParams.contactId),
    from: firstQueryValue(searchParams.from),
    to: firstQueryValue(searchParams.to)
  };
}

function buildDocumentListEndpoint(basePath: string, filters: DocumentListFilters) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.contactId) {
    params.set("contactId", filters.contactId);
  }

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  return params.size ? `${basePath}?${params.toString()}` : basePath;
}

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function lineStateFromDetail(
  detail: SalesInvoiceDetail | PurchaseBillDetail | QuoteDetail
) {
  return detail.lines.map((line) => ({
    inventoryItemId: line.inventoryItemId ?? "",
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRateId: line.taxRateId ?? ""
  }));
}

export async function renderWeek3AccountingPage(
  orgSlug: string,
  segments: string[],
  searchParams: Record<string, string | string[] | undefined>
) {
  const pageKey = segments[1];

  if (pageKey === "sales") {
    return renderSalesPage(orgSlug, segments, searchParams);
  }

  if (pageKey === "purchases") {
    return renderPurchasesPage(orgSlug, segments, searchParams);
  }

  return renderQuotesPage(orgSlug, segments, searchParams);
}

async function renderSalesPage(
  orgSlug: string,
  segments: string[],
  searchParams: Record<string, string | string[] | undefined>
) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "sales.write");
  const canReport = hasPermission(capabilities, "compliance.report");
  const canReadCompliance = hasPermission(capabilities, "compliance.read");
  const canReadInventory = hasPermission(capabilities, "inventory.read");
  const canReadSetup = hasPermission(capabilities, "setup.read");
  const filters = listFiltersFromSearchParams(searchParams);

  const [invoices, contacts, taxRates, inventoryItems, bankAccounts] = await Promise.all([
    fetchServerJson<SalesInvoiceSummary[]>(
      buildDocumentListEndpoint("/v1/sales/invoices", filters)
    ),
    fetchServerJson<ContactSummary[]>("/v1/contacts?segment=customers"),
    fetchServerJson<TaxRateRecord[]>("/v1/setup/tax-rates"),
    canReadInventory
      ? fetchServerJson<InventoryItemSummary[]>("/v1/inventory/items")
      : Promise.resolve([]),
    canReadSetup
      ? fetchServerJson<BankAccountRecord[]>("/v1/setup/bank-accounts")
      : Promise.resolve([])
  ]);

  const selectedId = segments[2] ?? null;
  const [selectedInvoice, reportedDocuments] = selectedId
    ? await Promise.all([
        fetchServerJson<SalesInvoiceDetail>(`/v1/sales/invoices/${selectedId}`),
        canReadCompliance
          ? fetchServerJson<ReportedDocumentRecord[]>("/v1/compliance/reported-documents")
          : Promise.resolve([] as ReportedDocumentRecord[])
      ])
    : [null, [] as ReportedDocumentRecord[]];
  const selectedReportedDocument = selectedInvoice
    ? reportedDocuments.find((document) => document.salesInvoiceId === selectedInvoice.id) ?? null
    : null;
  const canEditSelectedInvoice = Boolean(
    selectedInvoice &&
      canWrite &&
      selectedInvoice.status === "DRAFT" &&
      !selectedInvoice.compliance
  );
  const canRecordSelectedInvoicePayment = Boolean(
    selectedInvoice &&
      canWrite &&
      selectedInvoice.status !== "DRAFT" &&
      selectedInvoice.status !== "VOID" &&
      Number(selectedInvoice.amountDue) > 0
  );

  return (
    <div className="space-y-6">
      <SectionNav items={accountingNav(orgSlug, "sales")} title="Accounting" />
      <InvoiceListCard
        contacts={contacts}
        filters={filters}
        invoices={invoices}
        orgSlug={orgSlug}
      />
      {selectedInvoice ? (
        <div className="space-y-6">
          <DocumentDetail
            canReport={canReport}
            canWrite={canWrite}
            document={selectedInvoice}
            kind="sales"
            orgSlug={orgSlug}
            reportedDocument={selectedReportedDocument}
          />
          <section
            className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.4)]"
            id="manage-invoice"
          >
            <div className="space-y-1">
              <h3 className="text-xl font-semibold text-slate-950">Manage Invoice</h3>
              <p className="text-sm text-slate-500">
                Update the invoice and record payments without leaving the detail view.
              </p>
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <DocumentForm
                canWrite={canEditSelectedInvoice}
                contacts={mapContacts(contacts)}
                dateFields={[
                  { name: "issueDate", label: "Issue Date" },
                  { name: "dueDate", label: "Due Date" }
                ]}
                description="Update invoice values, line items, and financial status."
                endpoint={`/v1/sales/invoices/${selectedInvoice.id}`}
                includeComplianceKind
                initialValues={{
                  contactId: selectedInvoice.contactId,
                  numberValue: selectedInvoice.invoiceNumber,
                  status: selectedInvoice.status,
                  issueDate: dateInputValue(selectedInvoice.issueDate),
                  dueOrExpiryDate: dateInputValue(selectedInvoice.dueDate),
                  currencyCode: selectedInvoice.currencyCode,
                  notes: selectedInvoice.notes ?? "",
                  complianceInvoiceKind: selectedInvoice.complianceInvoiceKind,
                  lines: lineStateFromDetail(selectedInvoice)
                }}
                inventoryItems={mapInventoryItems(inventoryItems)}
                inventoryPriceField="salePrice"
                method="PATCH"
                numberField={{ name: "invoiceNumber", label: "Invoice Number" }}
                statusOptions={salesInvoiceStatuses.map((status) => ({
                  label: status,
                  value: status
                }))}
                submitLabel="Update Invoice"
                taxRates={mapTaxRates(taxRates)}
                title="Edit Invoice"
              />
              <div className="space-y-6">
                <div id="payment-form">
                  <PaymentForm
                    bankAccounts={bankAccounts.map((account) => ({
                      id: account.id,
                      name: account.name,
                      currencyCode: account.currencyCode
                    }))}
                    canWrite={canRecordSelectedInvoicePayment}
                    defaultAmount={selectedInvoice.amountDue}
                    endpoint={`/v1/sales/invoices/${selectedInvoice.id}/payments`}
                    readOnlyMessage="Payments are available after the invoice is issued and while a balance remains."
                    title="Add Payment"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <DocumentForm
          canWrite={canWrite}
          contacts={mapContacts(contacts)}
          dateFields={[
            { name: "issueDate", label: "Issue Date" },
            { name: "dueDate", label: "Due Date" }
          ]}
          description="Create a sales invoice with live line totals and compliance classification."
          endpoint="/v1/sales/invoices"
          includeComplianceKind
          initialValues={{
            contactId: contacts[0]?.id ?? "",
            numberValue: "",
            status: "DRAFT",
            issueDate: "2026-04-12",
            dueOrExpiryDate: "2026-04-27",
            currencyCode: "SAR",
            notes: "",
            complianceInvoiceKind: "STANDARD",
            lines: [
              {
                inventoryItemId: "",
                description: "",
                quantity: "1",
                unitPrice: "0.00",
                taxRateId: ""
              }
            ]
          }}
          inventoryItems={mapInventoryItems(inventoryItems)}
          inventoryPriceField="salePrice"
          method="POST"
          numberField={{ name: "invoiceNumber", label: "Invoice Number" }}
          appendResultId
          redirectTo={`/${orgSlug}/accounting/sales`}
          statusOptions={salesInvoiceStatuses.map((status) => ({
            label: status,
            value: status
          }))}
          submitLabel="Create Invoice"
          taxRates={mapTaxRates(taxRates)}
          title="New Invoice"
        />
      )}
    </div>
  );
}

async function renderPurchasesPage(
  orgSlug: string,
  segments: string[],
  searchParams: Record<string, string | string[] | undefined>
) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "purchases.write");
  const canReadInventory = hasPermission(capabilities, "inventory.read");
  const canReadSetup = hasPermission(capabilities, "setup.read");
  const filters = listFiltersFromSearchParams(searchParams);

  const [bills, contacts, taxRates, inventoryItems, bankAccounts] = await Promise.all([
    fetchServerJson<PurchaseBillSummary[]>(
      buildDocumentListEndpoint("/v1/purchases/bills", filters)
    ),
    fetchServerJson<ContactSummary[]>("/v1/contacts?segment=suppliers"),
    fetchServerJson<TaxRateRecord[]>("/v1/setup/tax-rates"),
    canReadInventory
      ? fetchServerJson<InventoryItemSummary[]>("/v1/inventory/items")
      : Promise.resolve([]),
    canReadSetup
      ? fetchServerJson<BankAccountRecord[]>("/v1/setup/bank-accounts")
      : Promise.resolve([])
  ]);

  const selectedId = segments[2] ?? null;
  const selectedBill = selectedId
    ? await fetchServerJson<PurchaseBillDetail>(`/v1/purchases/bills/${selectedId}`)
    : null;
  const canEditSelectedBill = Boolean(
    selectedBill &&
      canWrite &&
      selectedBill.status === "DRAFT"
  );
  const canRecordSelectedBillPayment = Boolean(
    selectedBill &&
      canWrite &&
      selectedBill.status !== "DRAFT" &&
      selectedBill.status !== "VOID" &&
      Number(selectedBill.amountDue) > 0
  );

  return (
    <div className="space-y-6">
      <SectionNav items={accountingNav(orgSlug, "purchases")} title="Accounting" />
      <BillListCard bills={bills} contacts={contacts} filters={filters} orgSlug={orgSlug} />
      {selectedBill ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <DocumentDetail
            canWrite={canWrite}
            document={selectedBill}
            kind="purchases"
          />
          <div className="space-y-6">
            <DocumentForm
              canWrite={canEditSelectedBill}
              contacts={mapContacts(contacts)}
              dateFields={[
                { name: "issueDate", label: "Issue Date" },
                { name: "dueDate", label: "Due Date" }
              ]}
              description="Update supplier bill values and line items."
              endpoint={`/v1/purchases/bills/${selectedBill.id}`}
              initialValues={{
                contactId: selectedBill.contactId,
                numberValue: selectedBill.billNumber,
                status: selectedBill.status,
                issueDate: dateInputValue(selectedBill.issueDate),
                dueOrExpiryDate: dateInputValue(selectedBill.dueDate),
                currencyCode: selectedBill.currencyCode,
                notes: selectedBill.notes ?? "",
                lines: lineStateFromDetail(selectedBill)
              }}
              inventoryItems={mapInventoryItems(inventoryItems)}
              inventoryPriceField="costPrice"
              method="PATCH"
              numberField={{ name: "billNumber", label: "Bill Number" }}
              statusOptions={purchaseBillStatuses.map((status) => ({
                label: status,
                value: status
              }))}
              submitLabel="Update Bill"
              taxRates={mapTaxRates(taxRates)}
              title="Edit Bill"
            />
            <div id="payment-form">
              <PaymentForm
                bankAccounts={bankAccounts.map((account) => ({
                  id: account.id,
                  name: account.name,
                  currencyCode: account.currencyCode
                }))}
                canWrite={canRecordSelectedBillPayment}
                defaultAmount={selectedBill.amountDue}
                endpoint={`/v1/purchases/bills/${selectedBill.id}/payments`}
                readOnlyMessage="Payments are available after the bill is approved and while a balance remains."
                title="Add Payment"
              />
            </div>
          </div>
        </div>
      ) : (
        <DocumentForm
          canWrite={canWrite}
          contacts={mapContacts(contacts)}
          dateFields={[
            { name: "issueDate", label: "Issue Date" },
            { name: "dueDate", label: "Due Date" }
          ]}
          description="Create a supplier bill and keep payable balances current."
          endpoint="/v1/purchases/bills"
          initialValues={{
            contactId: contacts[0]?.id ?? "",
            numberValue: "",
            status: "DRAFT",
            issueDate: "2026-04-12",
            dueOrExpiryDate: "2026-04-26",
            currencyCode: "SAR",
            notes: "",
            lines: [
              {
                inventoryItemId: "",
                description: "",
                quantity: "1",
                unitPrice: "0.00",
                taxRateId: ""
              }
            ]
          }}
          inventoryItems={mapInventoryItems(inventoryItems)}
          inventoryPriceField="costPrice"
          method="POST"
          numberField={{ name: "billNumber", label: "Bill Number" }}
          appendResultId
          redirectTo={`/${orgSlug}/accounting/purchases`}
          statusOptions={purchaseBillStatuses.map((status) => ({
            label: status,
            value: status
          }))}
          submitLabel="Create Bill"
          taxRates={mapTaxRates(taxRates)}
          title="New Bill"
        />
      )}
    </div>
  );
}

async function renderQuotesPage(
  orgSlug: string,
  segments: string[],
  searchParams: Record<string, string | string[] | undefined>
) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "quotes.write");
  const canConvert = hasPermission(capabilities, "quotes.convert");
  const canReadInventory = hasPermission(capabilities, "inventory.read");
  const filters = listFiltersFromSearchParams(searchParams);

  const [quotes, contacts, taxRates, inventoryItems] = await Promise.all([
    fetchServerJson<QuoteSummary[]>(buildDocumentListEndpoint("/v1/quotes", filters)),
    fetchServerJson<ContactSummary[]>("/v1/contacts?segment=customers"),
    fetchServerJson<TaxRateRecord[]>("/v1/setup/tax-rates"),
    canReadInventory
      ? fetchServerJson<InventoryItemSummary[]>("/v1/inventory/items")
      : Promise.resolve([])
  ]);

  const selectedId = segments[2] ?? null;
  const selectedQuote = selectedId
    ? await fetchServerJson<QuoteDetail>(`/v1/quotes/${selectedId}`)
    : null;

  return (
    <div className="space-y-6">
      <SectionNav items={accountingNav(orgSlug, "quotes")} title="Accounting" />
      <QuoteListCard contacts={contacts} filters={filters} orgSlug={orgSlug} quotes={quotes} />
      {selectedQuote ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <DocumentDetail
            canWrite={canWrite}
            document={selectedQuote}
            kind="quotes"
            orgSlug={orgSlug}
          />
          <div className="space-y-6">
            <DocumentForm
              canWrite={canWrite}
              contacts={mapContacts(contacts)}
              dateFields={[
                { name: "issueDate", label: "Issue Date" },
                { name: "expiryDate", label: "Expiry Date" }
              ]}
              description="Update quote lines and client-facing details."
              endpoint={`/v1/quotes/${selectedQuote.id}`}
              initialValues={{
                contactId: selectedQuote.contactId,
                numberValue: selectedQuote.quoteNumber,
                status: selectedQuote.status,
                issueDate: dateInputValue(selectedQuote.issueDate),
                dueOrExpiryDate: dateInputValue(selectedQuote.expiryDate),
                currencyCode: selectedQuote.currencyCode,
                notes: selectedQuote.notes ?? "",
                lines: lineStateFromDetail(selectedQuote)
              }}
              inventoryItems={mapInventoryItems(inventoryItems)}
              inventoryPriceField="salePrice"
              method="PATCH"
              numberField={{ name: "quoteNumber", label: "Quote Number" }}
              statusOptions={quoteStatuses.map((status) => ({
                label: status,
                value: status
              }))}
              submitLabel="Update Quote"
              taxRates={mapTaxRates(taxRates)}
              title="Edit Quote"
            />
            {selectedQuote.status !== "CONVERTED" ? (
              <Card>
                <CardHeader>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">Convert to Invoice</h3>
                    <p className="text-sm text-slate-500">
                      Create a draft sales invoice from this quote without leaving the quote workspace.
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <ActionButton
                    canWrite={canConvert}
                    endpoint={`/v1/quotes/${selectedQuote.id}/convert`}
                    label="Convert Quote"
                    pendingLabel="Converting..."
                    redirectField="invoiceId"
                    redirectTo={`/${orgSlug}/accounting/sales`}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      ) : (
        <DocumentForm
          canWrite={canWrite}
          contacts={mapContacts(contacts)}
          dateFields={[
            { name: "issueDate", label: "Issue Date" },
            { name: "expiryDate", label: "Expiry Date" }
          ]}
          description="Create a quote and convert it to an invoice when the customer accepts."
          endpoint="/v1/quotes"
          initialValues={{
            contactId: contacts[0]?.id ?? "",
            numberValue: "",
            status: "DRAFT",
            issueDate: "2026-04-12",
            dueOrExpiryDate: "2026-04-30",
            currencyCode: "SAR",
            notes: "",
            lines: [
              {
                inventoryItemId: "",
                description: "",
                quantity: "1",
                unitPrice: "0.00",
                taxRateId: ""
              }
            ]
          }}
          inventoryItems={mapInventoryItems(inventoryItems)}
          inventoryPriceField="salePrice"
          method="POST"
          numberField={{ name: "quoteNumber", label: "Quote Number" }}
          appendResultId
          redirectTo={`/${orgSlug}/accounting/quotes`}
          statusOptions={quoteStatuses.map((status) => ({
            label: status,
            value: status
          }))}
          submitLabel="Create Quote"
          taxRates={mapTaxRates(taxRates)}
          title="New Quote"
        />
      )}
    </div>
  );
}

function InvoiceListCard({
  orgSlug,
  invoices,
  contacts,
  filters
}: {
  orgSlug: string;
  invoices: SalesInvoiceSummary[];
  contacts: ContactSummary[];
  filters: DocumentListFilters;
}) {
  return (
    <DocumentListShell
      basePath={`/${orgSlug}/accounting/sales`}
      contacts={contacts}
      description="Sales invoices with live payment and compliance status filters."
      filters={filters}
      rows={invoices.map((invoice) => ({
        id: invoice.id,
        href: `/${orgSlug}/accounting/sales/${invoice.id}`,
        number: invoice.invoiceNumber,
        contactName: presentContactName(invoice.contactName),
        contactEmail: invoice.contactEmail,
        issueDate: invoice.issueDate,
        amountDue: money(invoice.amountDue, invoice.currencyCode),
        downloadHref: `${publicApiBaseUrl}/v1/sales/invoices/${invoice.id}/export?variant=full`,
        statusBadges: [
          { label: invoice.status, tone: toneForInvoiceStatus(invoice.status) },
          ...(invoice.complianceStatus
            ? [
                {
                  label: invoice.complianceStatus,
                  tone: toneForComplianceStatus(invoice.complianceStatus)
                }
              ]
            : [])
        ]
      }))}
      documentLabel="Invoice"
      statusOptions={[...salesInvoiceStatuses]}
      title="Sales Invoices"
    />
  );
}

function BillListCard({
  orgSlug,
  bills,
  contacts,
  filters
}: {
  orgSlug: string;
  bills: PurchaseBillSummary[];
  contacts: ContactSummary[];
  filters: DocumentListFilters;
}) {
  return (
    <DocumentListShell
      basePath={`/${orgSlug}/accounting/purchases`}
      contacts={contacts}
      description="Supplier bills with search, date filters, and direct export actions."
      filters={filters}
      rows={bills.map((bill) => ({
        id: bill.id,
        href: `/${orgSlug}/accounting/purchases/${bill.id}`,
        number: bill.billNumber,
        contactName: presentContactName(bill.contactName),
        contactEmail: bill.contactEmail,
        issueDate: bill.issueDate,
        amountDue: money(bill.amountDue, bill.currencyCode),
        downloadHref: `${publicApiBaseUrl}/v1/purchases/bills/${bill.id}/export?variant=full`,
        statusBadges: [{ label: bill.status, tone: toneForBillStatus(bill.status) }]
      }))}
      documentLabel="Bill"
      statusOptions={[...purchaseBillStatuses]}
      title="Purchase Bills"
    />
  );
}

function QuoteListCard({
  orgSlug,
  quotes,
  contacts,
  filters
}: {
  orgSlug: string;
  quotes: QuoteSummary[];
  contacts: ContactSummary[];
  filters: DocumentListFilters;
}) {
  return (
    <DocumentListShell
      basePath={`/${orgSlug}/accounting/quotes`}
      contacts={contacts}
      description="Quote flow with conversion into draft invoices and direct send/download actions."
      filters={filters}
      rows={quotes.map((quote) => ({
        id: quote.id,
        href: `/${orgSlug}/accounting/quotes/${quote.id}`,
        number: quote.quoteNumber,
        contactName: presentContactName(quote.contactName),
        contactEmail: quote.contactEmail,
        issueDate: quote.issueDate,
        amountDue: money(quote.total, quote.currencyCode),
        downloadHref: `${publicApiBaseUrl}/v1/quotes/${quote.id}/export?variant=full`,
        statusBadges: [{ label: quote.status, tone: toneForQuoteStatus(quote.status) }]
      }))}
      documentLabel="Quote"
      statusOptions={[...quoteStatuses]}
      title="Quotes"
    />
  );
}

function buildFilterHref(
  basePath: string,
  filters: DocumentListFilters,
  overrides: Partial<DocumentListFilters>
) {
  const nextFilters: DocumentListFilters = {
    ...filters,
    ...overrides
  };

  if (overrides.status === "") {
    delete nextFilters.status;
  }

  return buildDocumentListEndpoint(basePath, nextFilters);
}

function DocumentListShell({
  title,
  documentLabel,
  description,
  basePath,
  contacts,
  filters,
  statusOptions,
  rows
}: {
  title: string;
  documentLabel: string;
  description: string;
  basePath: string;
  contacts: ContactSummary[];
  filters: DocumentListFilters;
  statusOptions: string[];
  rows: {
    id: string;
    href: string;
    number: string;
    contactName: string;
    contactEmail: string | null;
    issueDate: string;
    amountDue: string;
    statusBadges: {
      label: string;
      tone: React.ComponentProps<typeof StatusBadge>["tone"];
    }[];
    downloadHref: string;
  }[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Link
            className={[
              "rounded-md px-3 py-2 text-sm font-medium",
              !filters.status ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
            ].join(" ")}
            href={buildFilterHref(basePath, filters, { status: "" })}
          >
            All
          </Link>
          {statusOptions.map((status) => (
            <Link
              className={[
                "rounded-md px-3 py-2 text-sm font-medium",
                filters.status === status
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600"
              ].join(" ")}
              href={buildFilterHref(basePath, filters, { status })}
              key={status}
            >
              {formatStatusLabel(status)}
            </Link>
          ))}
        </div>

        <form action={basePath} className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.9fr_0.9fr_auto_auto]" method="get">
          {filters.status ? <input name="status" type="hidden" value={filters.status} /> : null}
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Enter Number or Reference</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              defaultValue={filters.search ?? ""}
              name="search"
              placeholder="Search documents"
              type="text"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Filter by Contact</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              defaultValue={filters.contactId ?? ""}
              name="contactId"
            >
              <option value="">All contacts</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {presentContactName(contact.displayName)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Start Date</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              defaultValue={filters.from ?? ""}
              name="from"
              type="date"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>End Date</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              defaultValue={filters.to ?? ""}
              name="to"
              type="date"
            />
          </label>
          <div className="flex items-end">
            <button
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              type="submit"
            >
              Search
            </button>
          </div>
          <div className="flex items-end">
            <Link
              className="w-full rounded-md bg-slate-100 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-200"
              href={basePath}
            >
              Clear
            </Link>
          </div>
        </form>

        <DocumentListTableClient documentLabel={documentLabel} rows={rows} />
      </CardContent>
    </Card>
  );
}
