import Link from "next/link";
import React from "react";
import type {
  ContactSummary,
  FixedAssetRecord,
  PurchaseBillSummary,
  PurchaseCreditNoteDetail,
  PurchaseCreditNoteSummary,
  PurchaseOrderDetail,
  PurchaseOrderSummary,
  RepeatingBillRecord,
  RepeatingInvoiceRecord,
  SalesCreditNoteDetail,
  SalesCreditNoteSummary,
  SalesInvoiceSummary,
  TaxRateRecord
} from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { presentContactName } from "../presentation";
import { SectionNav } from "../week2/section-nav";
import { getCapabilities, hasPermission } from "../week2/route-utils";
import { ActionButton } from "../week3/action-button";
import { formatDate, money } from "../week3/shared";
import { CreditNoteForm } from "./credit-note-form";
import { FixedAssetForm } from "./fixed-asset-form";
import { PurchaseOrderForm } from "./purchase-order-form";
import { ScheduleForm } from "./schedule-form";

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

function lineState(lines: {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateId: string | null;
}[]) {
  return lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRateId: line.taxRateId ?? ""
  }));
}

function salesNav(orgSlug: string, activeKey: string) {
  return [
    { href: `/${orgSlug}/accounting/sales`, label: "Sales", active: activeKey === "sales" },
    {
      href: `/${orgSlug}/accounting/sales/credit-notes`,
      label: "Sales Credit Notes",
      active: activeKey === "sales-credit-notes"
    },
    {
      href: `/${orgSlug}/accounting/sales/repeating`,
      label: "Repeating Invoices",
      active: activeKey === "sales-repeating"
    }
  ];
}

function purchasesNav(orgSlug: string, activeKey: string) {
  return [
    {
      href: `/${orgSlug}/accounting/purchases`,
      label: "Purchases",
      active: activeKey === "purchases"
    },
    {
      href: `/${orgSlug}/accounting/purchases/credit-notes`,
      label: "Purchase Credit Notes",
      active: activeKey === "purchase-credit-notes"
    },
    {
      href: `/${orgSlug}/accounting/purchases/orders`,
      label: "Purchase Orders",
      active: activeKey === "purchase-orders"
    },
    {
      href: `/${orgSlug}/accounting/purchases/repeating`,
      label: "Repeating Bills",
      active: activeKey === "purchase-repeating"
    }
  ];
}

export async function renderWeek4AccountingPage(orgSlug: string, segments: string[]) {
  if (segments[1] === "fixed-assets") {
    return renderFixedAssetsPage(orgSlug, segments);
  }

  if (segments[1] === "sales" && segments[2] === "credit-notes") {
    return renderSalesCreditNotesPage(orgSlug, segments);
  }

  if (segments[1] === "sales" && segments[2] === "repeating") {
    return renderRepeatingInvoicesPage(orgSlug, segments);
  }

  if (segments[1] === "purchases" && segments[2] === "credit-notes") {
    return renderPurchaseCreditNotesPage(orgSlug, segments);
  }

  if (segments[1] === "purchases" && segments[2] === "orders") {
    return renderPurchaseOrdersPage(orgSlug, segments);
  }

  return renderRepeatingBillsPage(orgSlug, segments);
}

async function renderSalesCreditNotesPage(orgSlug: string, segments: string[]) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "sales.credit_notes.write");
  const [creditNotes, contacts, taxRates, invoices] = await Promise.all([
    fetchServerJson<SalesCreditNoteSummary[]>("/v1/sales/credit-notes"),
    fetchServerJson<ContactSummary[]>("/v1/contacts?segment=customers"),
    fetchServerJson<TaxRateRecord[]>("/v1/setup/tax-rates"),
    fetchServerJson<SalesInvoiceSummary[]>("/v1/sales/invoices")
  ]);
  const selectedId = segments[3] ?? null;
  const selected = selectedId
    ? await fetchServerJson<SalesCreditNoteDetail>(`/v1/sales/credit-notes/${selectedId}`)
    : null;

  return (
    <div className="space-y-6">
      <SectionNav items={salesNav(orgSlug, "sales-credit-notes")} title="Accounting" />
      <SimpleTableCard
        title="Sales Credit Notes"
        rows={creditNotes.map((creditNote) => ({
          href: `/${orgSlug}/accounting/sales/credit-notes/${creditNote.id}`,
          cells: [
            creditNote.creditNoteNumber,
            presentContactName(creditNote.contactName),
            formatDate(creditNote.issueDate),
            money(creditNote.total, creditNote.currencyCode),
            creditNote.status
          ]
        }))}
      />
      {selected ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <CreditNoteDetailCard detail={selected} />
          <CreditNoteForm
            canWrite={canWrite}
            contacts={mapContacts(contacts)}
            description="Update the linked invoice reference and credit note amounts."
            endpoint={`/v1/sales/credit-notes/${selected.id}`}
            initialValues={{
              contactId: selected.contactId,
              linkedDocumentId: selected.salesInvoiceId ?? "",
              creditNoteNumber: selected.creditNoteNumber,
              status: selected.status,
              issueDate: selected.issueDate.slice(0, 10),
              currencyCode: selected.currencyCode,
              notes: selected.notes ?? "",
              lines: lineState(selected.lines)
            }}
            linkedDocumentKey="salesInvoiceId"
            linkedDocuments={invoices.map((invoice) => ({
              id: invoice.id,
              label: invoice.invoiceNumber
            }))}
            method="PATCH"
            redirectTo={`/${orgSlug}/accounting/sales/credit-notes/${selected.id}`}
            submitLabel="Update Credit Note"
            taxRates={mapTaxRates(taxRates)}
            title="Edit Sales Credit Note"
          />
        </div>
      ) : (
        <CreditNoteForm
          canWrite={canWrite}
          contacts={mapContacts(contacts)}
          description="Create a customer credit note linked to an invoice when applicable."
          endpoint="/v1/sales/credit-notes"
          initialValues={{
            contactId: contacts[0]?.id ?? "",
            linkedDocumentId: invoices[0]?.id ?? "",
            creditNoteNumber: "",
            status: "DRAFT",
            issueDate: "2026-04-13",
            currencyCode: "SAR",
            notes: "",
            lines: [{ description: "", quantity: "1", unitPrice: "0.00", taxRateId: "" }]
          }}
          linkedDocumentKey="salesInvoiceId"
          linkedDocuments={invoices.map((invoice) => ({
            id: invoice.id,
            label: invoice.invoiceNumber
          }))}
          method="POST"
          appendResultId
          redirectTo={`/${orgSlug}/accounting/sales/credit-notes`}
          submitLabel="Create Credit Note"
          taxRates={mapTaxRates(taxRates)}
          title="New Sales Credit Note"
        />
      )}
    </div>
  );
}

async function renderRepeatingInvoicesPage(orgSlug: string, segments: string[]) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "sales.repeating.write");
  const [schedules, contacts, taxRates] = await Promise.all([
    fetchServerJson<RepeatingInvoiceRecord[]>("/v1/sales/repeating-invoices"),
    fetchServerJson<ContactSummary[]>("/v1/contacts?segment=customers"),
    fetchServerJson<TaxRateRecord[]>("/v1/setup/tax-rates")
  ]);
  const selectedId = segments[3] ?? null;
  const selected = selectedId
    ? await fetchServerJson<RepeatingInvoiceRecord>(
        `/v1/sales/repeating-invoices/${selectedId}`
      )
    : null;

  return (
    <div className="space-y-6">
      <SectionNav items={salesNav(orgSlug, "sales-repeating")} title="Accounting" />
      <SimpleTableCard
        title="Repeating Invoices"
        rows={schedules.map((schedule) => ({
          href: `/${orgSlug}/accounting/sales/repeating/${schedule.id}`,
          cells: [
            schedule.templateName,
            presentContactName(schedule.contactName),
            `${schedule.frequencyLabel} x${schedule.intervalCount}`,
            formatDate(schedule.nextRunAt),
            schedule.status
          ]
        }))}
      />
      {selected ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <ScheduleDetailCard
            currencyCode={selected.currencyCode}
            nextRunLabel="Next Invoice Run"
            record={selected}
          />
          <ScheduleForm
            canWrite={canWrite}
            contacts={mapContacts(contacts)}
            description="Update the recurring invoice schedule and line template."
            endpoint={`/v1/sales/repeating-invoices/${selected.id}`}
            initialValues={{
              contactId: selected.contactId,
              templateName: selected.templateName,
              status: selected.status,
              frequencyLabel: selected.frequencyLabel,
              intervalCount: String(selected.intervalCount),
              nextRunAt: selected.nextRunAt.slice(0, 10),
              currencyCode: selected.currencyCode,
              notes: selected.notes ?? "",
              lines: lineState(selected.lines)
            }}
            method="PATCH"
            redirectTo={`/${orgSlug}/accounting/sales/repeating/${selected.id}`}
            submitLabel="Update Schedule"
            taxRates={mapTaxRates(taxRates)}
            title="Edit Repeating Invoice"
          />
        </div>
      ) : (
        <ScheduleForm
          canWrite={canWrite}
          contacts={mapContacts(contacts)}
          description="Create a repeating invoice schedule for active customers."
          endpoint="/v1/sales/repeating-invoices"
          initialValues={{
            contactId: contacts[0]?.id ?? "",
            templateName: "Monthly Support",
            status: "ACTIVE",
            frequencyLabel: "Monthly",
            intervalCount: "1",
            nextRunAt: "2026-05-01",
            currencyCode: "SAR",
            notes: "",
            lines: [{ description: "", quantity: "1", unitPrice: "0.00", taxRateId: "" }]
          }}
          method="POST"
          appendResultId
          redirectTo={`/${orgSlug}/accounting/sales/repeating`}
          submitLabel="Create Schedule"
          taxRates={mapTaxRates(taxRates)}
          title="New Repeating Invoice"
        />
      )}
    </div>
  );
}

async function renderPurchaseCreditNotesPage(orgSlug: string, segments: string[]) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "purchases.credit_notes.write");
  const [creditNotes, contacts, taxRates, bills] = await Promise.all([
    fetchServerJson<PurchaseCreditNoteSummary[]>("/v1/purchases/credit-notes"),
    fetchServerJson<ContactSummary[]>("/v1/contacts?segment=suppliers"),
    fetchServerJson<TaxRateRecord[]>("/v1/setup/tax-rates"),
    fetchServerJson<PurchaseBillSummary[]>("/v1/purchases/bills")
  ]);
  const selectedId = segments[3] ?? null;
  const selected = selectedId
    ? await fetchServerJson<PurchaseCreditNoteDetail>(
        `/v1/purchases/credit-notes/${selectedId}`
      )
    : null;

  return (
    <div className="space-y-6">
      <SectionNav items={purchasesNav(orgSlug, "purchase-credit-notes")} title="Accounting" />
      <SimpleTableCard
        title="Purchase Credit Notes"
        rows={creditNotes.map((creditNote) => ({
          href: `/${orgSlug}/accounting/purchases/credit-notes/${creditNote.id}`,
          cells: [
            creditNote.creditNoteNumber,
            presentContactName(creditNote.contactName),
            formatDate(creditNote.issueDate),
            money(creditNote.total, creditNote.currencyCode),
            creditNote.status
          ]
        }))}
      />
      {selected ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <CreditNoteDetailCard detail={selected} />
          <CreditNoteForm
            canWrite={canWrite}
            contacts={mapContacts(contacts)}
            description="Update the supplier credit note and linked purchase bill."
            endpoint={`/v1/purchases/credit-notes/${selected.id}`}
            initialValues={{
              contactId: selected.contactId,
              linkedDocumentId: selected.purchaseBillId ?? "",
              creditNoteNumber: selected.creditNoteNumber,
              status: selected.status,
              issueDate: selected.issueDate.slice(0, 10),
              currencyCode: selected.currencyCode,
              notes: selected.notes ?? "",
              lines: lineState(selected.lines)
            }}
            linkedDocumentKey="purchaseBillId"
            linkedDocuments={bills.map((bill) => ({
              id: bill.id,
              label: bill.billNumber
            }))}
            method="PATCH"
            redirectTo={`/${orgSlug}/accounting/purchases/credit-notes/${selected.id}`}
            submitLabel="Update Credit Note"
            taxRates={mapTaxRates(taxRates)}
            title="Edit Purchase Credit Note"
          />
        </div>
      ) : (
        <CreditNoteForm
          canWrite={canWrite}
          contacts={mapContacts(contacts)}
          description="Create a supplier credit note for rebates or purchase adjustments."
          endpoint="/v1/purchases/credit-notes"
          initialValues={{
            contactId: contacts[0]?.id ?? "",
            linkedDocumentId: bills[0]?.id ?? "",
            creditNoteNumber: "",
            status: "DRAFT",
            issueDate: "2026-04-13",
            currencyCode: "SAR",
            notes: "",
            lines: [{ description: "", quantity: "1", unitPrice: "0.00", taxRateId: "" }]
          }}
          linkedDocumentKey="purchaseBillId"
          linkedDocuments={bills.map((bill) => ({
            id: bill.id,
            label: bill.billNumber
          }))}
          method="POST"
          appendResultId
          redirectTo={`/${orgSlug}/accounting/purchases/credit-notes`}
          submitLabel="Create Credit Note"
          taxRates={mapTaxRates(taxRates)}
          title="New Purchase Credit Note"
        />
      )}
    </div>
  );
}

async function renderPurchaseOrdersPage(orgSlug: string, segments: string[]) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "purchases.orders.write");
  const [orders, contacts, taxRates] = await Promise.all([
    fetchServerJson<PurchaseOrderSummary[]>("/v1/purchases/orders"),
    fetchServerJson<ContactSummary[]>("/v1/contacts?segment=suppliers"),
    fetchServerJson<TaxRateRecord[]>("/v1/setup/tax-rates")
  ]);
  const selectedId = segments[3] ?? null;
  const selected = selectedId
    ? await fetchServerJson<PurchaseOrderDetail>(`/v1/purchases/orders/${selectedId}`)
    : null;

  return (
    <div className="space-y-6">
      <SectionNav items={purchasesNav(orgSlug, "purchase-orders")} title="Accounting" />
      <SimpleTableCard
        title="Purchase Orders"
        rows={orders.map((order) => ({
          href: `/${orgSlug}/accounting/purchases/orders/${order.id}`,
          cells: [
            order.orderNumber,
            presentContactName(order.contactName),
            formatDate(order.expectedDate),
            money(order.total, order.currencyCode),
            order.status
          ]
        }))}
      />
      {selected ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <OrderDetailCard detail={selected} />
          <PurchaseOrderForm
            canWrite={canWrite}
            contacts={mapContacts(contacts)}
            description="Update supplier purchase orders before fulfillment."
            endpoint={`/v1/purchases/orders/${selected.id}`}
            initialValues={{
              contactId: selected.contactId,
              orderNumber: selected.orderNumber,
              status: selected.status,
              issueDate: selected.issueDate.slice(0, 10),
              expectedDate: selected.expectedDate.slice(0, 10),
              currencyCode: selected.currencyCode,
              notes: selected.notes ?? "",
              lines: lineState(selected.lines)
            }}
            method="PATCH"
            redirectTo={`/${orgSlug}/accounting/purchases/orders/${selected.id}`}
            submitLabel="Update Order"
            taxRates={mapTaxRates(taxRates)}
            title="Edit Purchase Order"
          />
        </div>
      ) : (
        <PurchaseOrderForm
          canWrite={canWrite}
          contacts={mapContacts(contacts)}
          description="Create a purchase order for supplier fulfillment."
          endpoint="/v1/purchases/orders"
          initialValues={{
            contactId: contacts[0]?.id ?? "",
            orderNumber: "",
            status: "DRAFT",
            issueDate: "2026-04-13",
            expectedDate: "2026-04-28",
            currencyCode: "SAR",
            notes: "",
            lines: [{ description: "", quantity: "1", unitPrice: "0.00", taxRateId: "" }]
          }}
          method="POST"
          appendResultId
          redirectTo={`/${orgSlug}/accounting/purchases/orders`}
          submitLabel="Create Order"
          taxRates={mapTaxRates(taxRates)}
          title="New Purchase Order"
        />
      )}
    </div>
  );
}

async function renderRepeatingBillsPage(orgSlug: string, segments: string[]) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "purchases.repeating.write");
  const [schedules, contacts, taxRates] = await Promise.all([
    fetchServerJson<RepeatingBillRecord[]>("/v1/purchases/repeating-bills"),
    fetchServerJson<ContactSummary[]>("/v1/contacts?segment=suppliers"),
    fetchServerJson<TaxRateRecord[]>("/v1/setup/tax-rates")
  ]);
  const selectedId = segments[3] ?? null;
  const selected = selectedId
    ? await fetchServerJson<RepeatingBillRecord>(
        `/v1/purchases/repeating-bills/${selectedId}`
      )
    : null;

  return (
    <div className="space-y-6">
      <SectionNav items={purchasesNav(orgSlug, "purchase-repeating")} title="Accounting" />
      <SimpleTableCard
        title="Repeating Bills"
        rows={schedules.map((schedule) => ({
          href: `/${orgSlug}/accounting/purchases/repeating/${schedule.id}`,
          cells: [
            schedule.templateName,
            presentContactName(schedule.contactName),
            `${schedule.frequencyLabel} x${schedule.intervalCount}`,
            formatDate(schedule.nextRunAt),
            schedule.status
          ]
        }))}
      />
      {selected ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <ScheduleDetailCard
            currencyCode={selected.currencyCode}
            nextRunLabel="Next Bill Run"
            record={selected}
          />
          <ScheduleForm
            canWrite={canWrite}
            contacts={mapContacts(contacts)}
            description="Update recurring supplier bill schedules."
            endpoint={`/v1/purchases/repeating-bills/${selected.id}`}
            initialValues={{
              contactId: selected.contactId,
              templateName: selected.templateName,
              status: selected.status,
              frequencyLabel: selected.frequencyLabel,
              intervalCount: String(selected.intervalCount),
              nextRunAt: selected.nextRunAt.slice(0, 10),
              currencyCode: selected.currencyCode,
              notes: selected.notes ?? "",
              lines: lineState(selected.lines)
            }}
            method="PATCH"
            redirectTo={`/${orgSlug}/accounting/purchases/repeating/${selected.id}`}
            submitLabel="Update Schedule"
            taxRates={mapTaxRates(taxRates)}
            title="Edit Repeating Bill"
          />
        </div>
      ) : (
        <ScheduleForm
          canWrite={canWrite}
          contacts={mapContacts(contacts)}
          description="Create a repeating supplier bill schedule."
          endpoint="/v1/purchases/repeating-bills"
          initialValues={{
            contactId: contacts[0]?.id ?? "",
            templateName: "Monthly Facility Support",
            status: "ACTIVE",
            frequencyLabel: "Monthly",
            intervalCount: "1",
            nextRunAt: "2026-05-03",
            currencyCode: "SAR",
            notes: "",
            lines: [{ description: "", quantity: "1", unitPrice: "0.00", taxRateId: "" }]
          }}
          method="POST"
          appendResultId
          redirectTo={`/${orgSlug}/accounting/purchases/repeating`}
          submitLabel="Create Schedule"
          taxRates={mapTaxRates(taxRates)}
          title="New Repeating Bill"
        />
      )}
    </div>
  );
}

async function renderFixedAssetsPage(orgSlug: string, segments: string[]) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "assets.write");
  const canDepreciate = hasPermission(capabilities, "assets.depreciate");
  const [assets, depreciationRuns] = await Promise.all([
    fetchServerJson<FixedAssetRecord[]>("/v1/assets"),
    fetchServerJson<
      {
        id: string;
        fixedAssetId: string;
        runDate: string;
        depreciationAmount: string;
        netBookValue: string;
      }[]
    >("/v1/assets/depreciation-runs")
  ]);
  const selectedId = segments[2] ?? null;
  const selected = selectedId
    ? await fetchServerJson<FixedAssetRecord>(`/v1/assets/${selectedId}`)
    : null;

  return (
    <div className="space-y-6">
      <SectionNav
        items={[{ href: `/${orgSlug}/accounting/fixed-assets`, label: "Fixed Assets", active: true }]}
        title="Accounting"
      />
      <SimpleTableCard
        title="Fixed Assets"
        rows={assets.map((asset) => ({
          href: `/${orgSlug}/accounting/fixed-assets/${asset.id}`,
          cells: [
            asset.assetNumber,
            asset.name,
            formatDate(asset.purchaseDate),
            money(asset.netBookValue),
            asset.status
          ]
        }))}
      />
      {selected ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <AssetDetailCard
            asset={selected}
            canDepreciate={canDepreciate}
            depreciationRuns={depreciationRuns.filter(
              (run) => run.fixedAssetId === selected.id
            )}
          />
          <div className="space-y-6">
            <FixedAssetForm
              canWrite={canWrite}
              endpoint={`/v1/assets/${selected.id}`}
              initialValues={{
                assetNumber: selected.assetNumber,
                name: selected.name,
                category: selected.category,
                purchaseDate: selected.purchaseDate.slice(0, 10),
                cost: selected.cost,
                salvageValue: selected.salvageValue,
                usefulLifeMonths: String(selected.usefulLifeMonths),
                depreciationMethod: selected.depreciationMethod
              }}
              method="PATCH"
            redirectTo={`/${orgSlug}/accounting/fixed-assets/${selected.id}`}
              submitLabel="Update Asset"
            />
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Run Depreciation</h3>
              </CardHeader>
              <CardContent>
                <ActionButton
                  body={{ runDate: new Date("2026-05-01T00:00:00.000Z").toISOString() }}
                  canWrite={canDepreciate}
                  endpoint={`/v1/assets/${selected.id}/depreciate`}
                  label="Post Monthly Depreciation"
                  pendingLabel="Posting..."
                />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <FixedAssetForm
          canWrite={canWrite}
          endpoint="/v1/assets"
          initialValues={{
            assetNumber: "",
            name: "",
            category: "",
            purchaseDate: "2026-04-01",
            cost: "0.00",
            salvageValue: "0.00",
            usefulLifeMonths: "36",
            depreciationMethod: "STRAIGHT_LINE"
          }}
          method="POST"
          appendResultId
          redirectTo={`/${orgSlug}/accounting/fixed-assets`}
          submitLabel="Create Asset"
        />
      )}
    </div>
  );
}

function SimpleTableCard({
  title,
  rows
}: {
  title: string;
  rows: { href: string; cells: string[] }[];
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold">{title}</h2>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.href}>
                  <td className="px-3 py-3">
                    <Link className="underline underline-offset-4" href={row.href}>
                      {row.cells[0]}
                    </Link>
                  </td>
                  {row.cells.slice(1).map((cell, index) => (
                    <td className="px-3 py-3" key={`${row.href}-${index}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CreditNoteDetailCard({
  detail
}: {
  detail: SalesCreditNoteDetail | PurchaseCreditNoteDetail;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{detail.creditNoteNumber}</h2>
            <p className="text-sm text-slate-500">
              {presentContactName(detail.contactName)}
            </p>
          </div>
          <StatusBadge label={detail.status} tone="warning" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">{detail.notes || "No notes recorded."}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Subtotal" value={money(detail.subtotal, detail.currencyCode)} />
          <Metric label="Tax" value={money(detail.taxTotal, detail.currencyCode)} />
          <Metric label="Total" value={money(detail.total, detail.currencyCode)} />
        </div>
      </CardContent>
    </Card>
  );
}

function OrderDetailCard({ detail }: { detail: PurchaseOrderDetail }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{detail.orderNumber}</h2>
            <p className="text-sm text-slate-500">
              {presentContactName(detail.contactName)}
            </p>
          </div>
          <StatusBadge label={detail.status} tone="warning" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">{detail.notes || "No notes recorded."}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Subtotal" value={money(detail.subtotal, detail.currencyCode)} />
          <Metric label="Tax" value={money(detail.taxTotal, detail.currencyCode)} />
          <Metric label="Total" value={money(detail.total, detail.currencyCode)} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleDetailCard({
  record,
  currencyCode,
  nextRunLabel
}: {
  record: RepeatingInvoiceRecord | RepeatingBillRecord;
  currencyCode: string;
  nextRunLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{record.templateName}</h2>
            <p className="text-sm text-slate-500">
              {presentContactName(record.contactName)}
            </p>
          </div>
          <StatusBadge label={record.status} tone="success" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Frequency" value={`${record.frequencyLabel} x${record.intervalCount}`} />
          <Metric label={nextRunLabel} value={formatDate(record.nextRunAt)} />
          <Metric label="Total" value={money(record.total, currencyCode)} />
        </div>
        <p className="text-sm text-slate-600">{record.notes || "No notes recorded."}</p>
      </CardContent>
    </Card>
  );
}

function AssetDetailCard({
  asset,
  depreciationRuns,
  canDepreciate
}: {
  asset: FixedAssetRecord;
  depreciationRuns: {
    id: string;
    runDate: string;
    depreciationAmount: string;
    netBookValue: string;
  }[];
  canDepreciate: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{asset.assetNumber}</h2>
            <p className="text-sm text-slate-500">{asset.name}</p>
          </div>
          <StatusBadge label={asset.status} tone={canDepreciate ? "success" : "warning"} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Cost" value={money(asset.cost)} />
          <Metric label="Accumulated Depreciation" value={money(asset.accumulatedDepreciation)} />
          <Metric label="Net Book Value" value={money(asset.netBookValue)} />
        </div>
        <div className="space-y-2">
          {depreciationRuns.map((run) => (
            <div className="rounded-lg border border-slate-200 p-3" key={run.id}>
              <p className="text-sm font-medium text-slate-800">{formatDate(run.runDate)}</p>
              <p className="text-sm text-slate-500">
                Depreciation {money(run.depreciationAmount)} • NBV {money(run.netBookValue)}
              </p>
            </div>
          ))}
          {depreciationRuns.length === 0 ? (
            <p className="text-sm text-slate-500">No depreciation runs recorded.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
