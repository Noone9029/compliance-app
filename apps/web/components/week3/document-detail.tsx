import Link from "next/link";
import React from "react";
import type {
  PurchaseBillDetail,
  QuoteDetail,
  ReportedDocumentRecord,
  SalesInvoiceDetail
} from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { AttachmentManager } from "./attachment-manager";
import { DocumentActions } from "./document-actions";
import { InvoiceReportButton } from "./invoice-report-button";
import { presentContactName, presentEmail } from "../presentation";
import {
  formatDate,
  money,
  toneForBillStatus,
  toneForQuoteStatus
} from "./shared";

const publicApiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function buildEmailHref(input: {
  contactEmail: string | null;
  documentNumber: string;
  contactName: string;
  label: string;
}) {
  if (!input.contactEmail) {
    return null;
  }

  const subject = encodeURIComponent(`${input.label} ${input.documentNumber}`);
  const body = encodeURIComponent(
    `Hello ${presentContactName(input.contactName)},%0D%0A%0D%0APlease find ${input.label.toLowerCase()} ${input.documentNumber}.`
  );
  return `mailto:${input.contactEmail}?subject=${subject}&body=${body}`;
}

function buildWhatsAppHref(input: {
  documentNumber: string;
  contactName: string;
  label: string;
}) {
  const message = encodeURIComponent(
    `Hello ${presentContactName(input.contactName)}, ${input.label} ${input.documentNumber} is ready for review.`
  );
  return `https://wa.me/?text=${message}`;
}

function actionLinkClass(options?: {
  tone?: "green" | "slate";
  disabled?: boolean;
}) {
  const tone = options?.tone ?? "green";
  const disabled = options?.disabled ?? false;

  if (disabled) {
    return "inline-flex min-h-10 items-center justify-center rounded-md bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-400";
  }

  return [
    "inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition",
    tone === "slate"
      ? "bg-slate-600 text-white hover:bg-slate-500"
      : "bg-emerald-600 text-white hover:bg-emerald-500"
  ].join(" ");
}

function menuSummaryClass() {
  return [
    "inline-flex min-h-10 cursor-pointer list-none items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950",
    "[&::-webkit-details-marker]:hidden"
  ].join(" ");
}

function menuItemClass(disabled = false) {
  return [
    "block rounded-md px-3 py-2 text-sm",
    disabled
      ? "cursor-not-allowed text-slate-400"
      : "text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
  ].join(" ");
}

function formatCompactDate(value: string | null | undefined) {
  if (!value) {
    return "---";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "---";
  }

  return date.toISOString().slice(0, 10);
}

function formatReportedAt(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const day = date.toISOString().slice(0, 10);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${day} ${hours}:${minutes}`;
}

function amount(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatInvoiceStatus(document: SalesInvoiceDetail) {
  if (document.status === "PAID" || Number(document.amountDue) <= 0) {
    return "Paid";
  }

  if (document.status === "VOID") {
    return "Void";
  }

  if (document.status === "DRAFT") {
    return "Draft";
  }

  return "Awaiting Payment";
}

function exportLabel(kind: SalesInvoiceDetail["complianceInvoiceKind"]) {
  return kind === "SIMPLIFIED" ? "Simplified Invoice" : "Tax Invoice";
}

function formatStatusLabel(status: string | null | undefined) {
  if (!status) {
    return "Pending";
  }

  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function canEditSalesInvoice(document: SalesInvoiceDetail) {
  return document.status === "DRAFT" && !document.compliance;
}

function canManageSalesInvoiceAttachments(document: SalesInvoiceDetail) {
  return canEditSalesInvoice(document);
}

function canShareSalesInvoice(document: SalesInvoiceDetail) {
  if (document.compliance) {
    return document.compliance.canShareWithCustomer;
  }

  if (document.status === "DRAFT" || document.status === "VOID") {
    return false;
  }

  return document.complianceInvoiceKind === "SIMPLIFIED";
}

function canRecordSalesInvoicePayment(document: SalesInvoiceDetail) {
  return document.status !== "DRAFT" && document.status !== "VOID" && Number(document.amountDue) > 0;
}

function canEditPurchaseBill(document: PurchaseBillDetail) {
  return document.status === "DRAFT";
}

function canManagePurchaseBillAttachments(document: PurchaseBillDetail) {
  return canEditPurchaseBill(document);
}

function canRecordPurchaseBillPayment(document: PurchaseBillDetail) {
  return document.status !== "DRAFT" && document.status !== "VOID" && Number(document.amountDue) > 0;
}

function canEditQuote(document: QuoteDetail) {
  return document.status !== "CONVERTED";
}

export function DocumentDetail(props: {
  kind: "sales" | "purchases" | "quotes";
  document: SalesInvoiceDetail | PurchaseBillDetail | QuoteDetail;
  orgSlug?: string;
  canWrite?: boolean;
  canReport?: boolean;
  reportedDocument?: ReportedDocumentRecord | null;
}) {
  if (props.kind === "sales") {
    return (
      <SalesInvoiceDetailView
        canReport={props.canReport ?? false}
        canWrite={props.canWrite ?? false}
        document={props.document as SalesInvoiceDetail}
        orgSlug={props.orgSlug ?? ""}
        reportedDocument={props.reportedDocument ?? null}
      />
    );
  }

  if (props.kind === "purchases") {
    return (
      <PurchaseBillDetailView
        canWrite={props.canWrite ?? false}
        document={props.document as PurchaseBillDetail}
      />
    );
  }

  return (
    <QuoteDetailView
      canWrite={props.canWrite ?? false}
      document={props.document as QuoteDetail}
      orgSlug={props.orgSlug ?? ""}
    />
  );
}

function SalesInvoiceDetailView({
  document,
  canWrite,
  canReport,
  orgSlug,
  reportedDocument
}: {
  document: SalesInvoiceDetail;
  canWrite: boolean;
  canReport: boolean;
  orgSlug: string;
  reportedDocument: ReportedDocumentRecord | null;
}) {
  const exportBase = `${publicApiBaseUrl}/v1/sales/invoices/${document.id}/export`;
  const emailHref = buildEmailHref({
    contactEmail: document.contactEmail,
    documentNumber: document.invoiceNumber,
    contactName: presentContactName(document.contactName),
    label: "Invoice"
  });
  const whatsappHref = buildWhatsAppHref({
    documentNumber: document.invoiceNumber,
    contactName: presentContactName(document.contactName),
    label: "Invoice"
  });
  const reportedAt =
    formatReportedAt(
      document.compliance?.clearedAt ??
        document.compliance?.reportedAt ??
        reportedDocument?.submittedAt ??
        document.compliance?.lastSubmittedAt
    );
  const editable = canWrite && canEditSalesInvoice(document);
  const canManageAttachments = canWrite && canManageSalesInvoiceAttachments(document);
  const canRecordPayment = canWrite && canRecordSalesInvoicePayment(document);
  const canShareDocument = canShareSalesInvoice(document);
  const readOnlyMessage = canWrite
    ? "Issued invoices are locked. Use payments or credit notes for post-issue activity."
    : "Read-only access";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_80px_-60px_rgba(15,23,42,0.4)]">
        <div className="space-y-8 px-5 py-6 sm:px-7 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                Invoice {document.invoiceNumber}
              </h2>
              <Link
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition hover:text-emerald-700"
                href={orgSlug ? `/${orgSlug}/accounting/sales` : "/"}
              >
                <span aria-hidden="true">&larr;</span>
                <span>Get Back</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="inline-flex min-h-10 min-w-[220px] items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500">
                <span>-- Select Template --</span>
                <span aria-hidden="true">▼</span>
              </div>
              {reportedAt ? (
                <div className="inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  {formatStatusLabel(document.compliance?.status)} ({reportedAt})
                </div>
              ) : null}
              <details className="relative">
                <summary className={menuSummaryClass()}>
                  Export: {exportLabel(document.complianceInvoiceKind)}
                </summary>
                <div className="absolute right-0 top-full z-20 mt-2 min-w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_22px_50px_-30px_rgba(15,23,42,0.35)]">
                  {canShareDocument ? (
                    <a className={menuItemClass(false)} href={`${exportBase}?variant=full`}>
                      Download tax invoice
                    </a>
                  ) : (
                    <span className={menuItemClass(true)}>Download tax invoice</span>
                  )}
                  {canShareDocument ? (
                    <a className={menuItemClass(false)} href={`${exportBase}?variant=small`}>
                      Download small invoice
                    </a>
                  ) : (
                    <span className={menuItemClass(true)}>Download small invoice</span>
                  )}
                  <a className={menuItemClass(false)} href={`${exportBase}?variant=packing-slip`}>
                    Download packing slip
                  </a>
                </div>
              </details>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex flex-wrap items-start gap-3">
              <ContactStatusNote contactEmail={document.contactEmail} />
              <InvoiceReportButton
                canReport={canReport}
                compliance={document.compliance}
                invoiceId={document.id}
              />
              <a className={actionLinkClass()} href={`${exportBase}?variant=packing-slip`}>
                Packing Slip
              </a>
              <a className={actionLinkClass()} href="#history-notes">
                Files ({document.attachments.length})
              </a>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {canShareDocument ? (
                <a className={actionLinkClass()} href={`${exportBase}?variant=full`}>
                  Download
                </a>
              ) : (
                <span className={actionLinkClass({ disabled: true })}>Download</span>
              )}
              {emailHref && canShareDocument ? (
                <a className={actionLinkClass()} href={emailHref}>
                  Email
                </a>
              ) : (
                <span className={actionLinkClass({ disabled: true })}>Email</span>
              )}
              {canShareDocument ? (
                <a className={actionLinkClass()} href={`${exportBase}?variant=small`}>
                  Small Invoice
                </a>
              ) : (
                <span className={actionLinkClass({ disabled: true })}>Small Invoice</span>
              )}
              {canShareDocument ? (
                <a
                  className={actionLinkClass()}
                  href={whatsappHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  Whatsapp
                </a>
              ) : (
                <span className={actionLinkClass({ disabled: true })}>Whatsapp</span>
              )}
              <details className="relative">
                <summary className={actionLinkClass()}>Options</summary>
                <div className="absolute right-0 top-full z-20 mt-2 min-w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_22px_50px_-30px_rgba(15,23,42,0.35)]">
                  <a className={menuItemClass(false)} href="#history-notes">
                    Show history and notes
                  </a>
                  <a className={menuItemClass(false)} href="#attachments">
                    View files
                  </a>
                  <a className={menuItemClass(false)} href="#manage-invoice">
                    Edit invoice and payment
                  </a>
                </div>
              </details>
              <a
                className={actionLinkClass({ disabled: !canRecordPayment })}
                href={canRecordPayment ? "#payment-form" : undefined}
              >
                Add Payment
              </a>
            </div>
          </div>

          {!canShareDocument ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {document.complianceInvoiceKind === "STANDARD"
                ? "Standard tax invoices remain customer-share locked until ZATCA clearance is accepted."
                : "Submit the invoice to ZATCA to complete the compliance record before sharing from the platform."}
            </div>
          ) : null}

          <div className="grid gap-x-8 gap-y-10 border-t border-slate-200 pt-8 md:grid-cols-2 xl:grid-cols-4">
            <InvoiceMetaField
              emphasis
              label="To"
              value={presentContactName(document.contactName)}
            />
            <InvoiceMetaField label="Status" value={formatInvoiceStatus(document)} />
            <InvoiceMetaField label="Date" value={formatCompactDate(document.issueDate)} />
            <InvoiceMetaField label="Due Date" value={formatCompactDate(document.dueDate)} />
            <InvoiceMetaField label="Supply Date" value="---" />
            <InvoiceMetaField label="Invoice Number" value={document.invoiceNumber} />
            <InvoiceMetaField label="Notes / Reference" value={document.notes ?? "---"} />
            <InvoiceMetaField
              label="Compliance"
              value={
                document.complianceStatus
                  ? formatStatusLabel(document.complianceStatus)
                  : "Pending"
              }
            />
          </div>

          <div className="space-y-6 border-t border-slate-200 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xl font-medium text-slate-950">
                Currency : <span className="font-semibold">{document.currencyCode}</span>
              </p>
              <p className="text-base text-slate-700">
                Amounts with <span className="font-semibold text-slate-950">Tax Exclusive</span>
              </p>
            </div>

            <InvoiceLinesTable currencyCode={document.currencyCode} lines={document.lines} />

            <div className="flex justify-end">
              <InvoiceTotalsTable
                rows={[
                  ["Subtotal", amount(document.subtotal)],
                  ["Total Tax", amount(document.taxTotal)],
                  ["Total", amount(document.total)],
                  ["Amount Due", amount(document.amountDue)]
                ]}
              />
            </div>
          </div>

          <details
            className="group rounded-[22px] border border-slate-200 bg-slate-50/80"
            id="history-notes"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-xl font-medium text-slate-950 [&::-webkit-details-marker]:hidden">
              <span>Show History &amp; Notes</span>
              <span className="text-base text-slate-500 transition group-open:rotate-180">
                ▼
              </span>
            </summary>
            <div className="space-y-5 border-t border-slate-200 px-5 py-5">
              <NotesCard notes={document.notes} />
              <PaymentsCard currencyCode={document.currencyCode} payments={document.payments} />
              <AttachmentManager
                attachments={document.attachments}
                canWrite={canManageAttachments}
                readOnlyMessage={readOnlyMessage}
                relatedId={document.id}
                relatedType="sales-invoice"
              />
              <StatusEventsCard events={document.statusEvents} />
              <ComplianceResponseCard
                compliance={document.compliance}
                reportedDocument={reportedDocument}
              />
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}

function ContactStatusNote({ contactEmail }: { contactEmail: string | null }) {
  const hasEmail = Boolean(contactEmail);

  return (
    <div
      className={[
        "space-y-1 rounded-md px-1 py-1 text-sm",
        hasEmail ? "text-emerald-700" : "text-slate-500"
      ].join(" ")}
    >
      <p className="font-medium">
        <span aria-hidden="true">{hasEmail ? "✓" : "!"}</span>{" "}
        {hasEmail ? "Ready to send" : "No email recorded"}
      </p>
      <p>{presentEmail(contactEmail) ?? "Update the contact before sending."}</p>
    </div>
  );
}

function InvoiceMetaField({
  label,
  value,
  emphasis = false
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[15px] font-medium text-slate-950">{label}</p>
      <p
        className={[
          "text-[18px] leading-8",
          emphasis ? "font-semibold text-emerald-600" : "text-slate-700"
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function InvoiceLinesTable({
  lines,
  currencyCode
}: {
  lines: {
    id: string;
    description: string;
    inventoryItemCode: string | null;
    inventoryItemName: string | null;
    quantity: string;
    unitPrice: string;
    taxRateName: string | null;
    taxRatePercent: string;
    lineSubtotal: string;
    lineTax: string;
  }[];
  currencyCode: string;
}) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700">
          <thead>
            <tr className="bg-slate-100/80 text-left text-[15px] font-medium text-slate-600">
              <th className="px-4 py-4 font-medium">Item/Description</th>
              <th className="px-4 py-4 text-center font-medium">Qty</th>
              <th className="px-4 py-4 text-right font-medium">Unit Price</th>
              <th className="px-4 py-4 text-center font-medium">Disc %</th>
              <th className="px-4 py-4 text-right font-medium">Tax</th>
              <th className="px-4 py-4 text-right font-medium">Amount {currencyCode}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr className="border-t border-slate-200 align-top" key={line.id}>
                <td className="px-4 py-4">
                  <div className="space-y-2">
                    <p className="text-[17px] text-slate-700">{line.description}</p>
                    <p className="text-[15px] text-slate-500">
                      {line.inventoryItemCode || line.inventoryItemName
                        ? [line.inventoryItemCode, line.inventoryItemName]
                            .filter(Boolean)
                            .join(" · ")
                        : "Manual line"}
                    </p>
                    <p className="text-[15px] text-slate-500">
                      Tax:{" "}
                      <span className="font-semibold text-slate-700">
                        {line.taxRateName
                          ? `${line.taxRateName} (${line.taxRatePercent}%)`
                          : "No tax"}
                      </span>
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">{Number(line.quantity)}</td>
                <td className="px-4 py-4 text-right">{amount(line.unitPrice)}</td>
                <td className="px-4 py-4 text-center">-</td>
                <td className="px-4 py-4 text-right">{amount(line.lineTax)}</td>
                <td className="px-4 py-4 text-right">{amount(line.lineSubtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceTotalsTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="min-w-[300px] overflow-hidden rounded-md border border-slate-200">
      <table className="min-w-full text-sm text-slate-700">
        <tbody>
          {rows.map(([label, value], index) => {
            const isStrong = index >= rows.length - 2;
            return (
              <tr className="border-t border-slate-200 first:border-t-0" key={label}>
                <td className="bg-slate-50 px-4 py-3 text-right text-base">{label}</td>
                <td
                  className={[
                    "bg-slate-50 px-4 py-3 text-right",
                    isStrong ? "text-2xl font-semibold text-slate-950" : "text-xl"
                  ].join(" ")}
                >
                  {value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NotesCard({ notes }: { notes: string | null }) {
  return (
    <Card className="border-slate-200 shadow-none">
      <CardHeader>
        <h3 className="text-lg font-semibold text-slate-950">Notes</h3>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600">{notes || "No notes recorded for this invoice."}</p>
      </CardContent>
    </Card>
  );
}

function ComplianceResponseCard({
  compliance,
  reportedDocument
}: {
  compliance: SalesInvoiceDetail["compliance"];
  reportedDocument: ReportedDocumentRecord | null;
}) {
  if (!compliance && !reportedDocument) {
    return null;
  }

  return (
    <Card className="border-slate-200 shadow-none" id="compliance-response">
      <CardHeader>
        <h3 className="text-lg font-semibold text-slate-950">ZATCA Compliance</h3>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <ComplianceValue
            label="Lifecycle Status"
            value={formatStatusLabel(compliance?.status ?? reportedDocument?.status)}
          />
          <ComplianceValue
            label="Submission Flow"
            value={formatStatusLabel(compliance?.submissionFlow ?? reportedDocument?.submissionFlow)}
          />
          <ComplianceValue
            label="Response Code"
            value={
              reportedDocument?.responseCode ??
              compliance?.lastSubmissionStatus ??
              "Pending"
            }
          />
          <ComplianceValue
            label="Submitted At"
            value={
              formatReportedAt(
                compliance?.clearedAt ??
                  compliance?.reportedAt ??
                  reportedDocument?.submittedAt ??
                  compliance?.lastSubmittedAt
              ) ?? "---"
            }
          />
          <ComplianceValue
            label="Response Message"
            value={
              reportedDocument?.responseMessage ??
              compliance?.lastError ??
              "No response log available."
            }
          />
          <ComplianceValue
            label="Failure Category"
            value={formatStatusLabel(compliance?.failureCategory)}
          />
          <ComplianceValue
            label="UUID"
            value={compliance?.uuid ?? "---"}
          />
          <ComplianceValue
            label="External Submission ID"
            value={
              compliance?.externalSubmissionId ??
              reportedDocument?.externalSubmissionId ??
              "---"
            }
          />
          <ComplianceValue label="Invoice Counter" value={String(compliance?.invoiceCounter ?? "---")} />
          <ComplianceValue label="Current Hash" value={compliance?.currentHash ?? "---"} />
          <ComplianceValue
            label="Previous Hash"
            value={compliance?.previousHash ?? "First document hash"}
          />
          <ComplianceValue label="QR Payload" value={compliance?.qrPayload ?? "---"} />
        </div>

        {compliance?.submission ? (
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <h4 className="text-base font-semibold text-slate-950">Current Submission</h4>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm md:grid-cols-2">
              <ComplianceValue
                label="Queue Status"
                value={formatStatusLabel(compliance.submission.status)}
              />
              <ComplianceValue
                label="Attempts"
                value={`${compliance.submission.attemptCount}/${compliance.submission.maxAttempts}`}
              />
              <ComplianceValue
                label="Next Retry"
                value={formatReportedAt(compliance.submission.nextRetryAt) ?? "---"}
              />
              <ComplianceValue
                label="Error"
                value={compliance.submission.errorMessage ?? "---"}
              />
            </CardContent>
          </Card>
        ) : null}

        {compliance?.attempts.length ? (
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <h4 className="text-base font-semibold text-slate-950">Transport Attempts</h4>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {compliance.attempts.map((attempt) => (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={attempt.id}>
                  <p className="font-medium text-slate-900">
                    Attempt {attempt.attemptNumber} • {formatStatusLabel(attempt.status)}
                  </p>
                  <p className="text-slate-600">
                    {attempt.endpoint}
                    {attempt.httpStatus ? ` • HTTP ${attempt.httpStatus}` : ""}
                  </p>
                  <p className="text-slate-600">
                    Started {formatReportedAt(attempt.startedAt) ?? "---"}
                    {attempt.finishedAt
                      ? ` • Finished ${formatReportedAt(attempt.finishedAt)}`
                      : ""}
                  </p>
                  <p className="text-slate-600">
                    {attempt.errorMessage ??
                      formatStatusLabel(attempt.failureCategory) ??
                      "No transport error recorded."}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {compliance?.timeline.length ? (
          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <h4 className="text-base font-semibold text-slate-950">Compliance Timeline</h4>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {compliance.timeline.map((event) => (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={event.id}>
                  <p className="font-medium text-slate-900">{event.action}</p>
                  <p className="text-slate-600">
                    {formatStatusLabel(event.status)} • {formatReportedAt(event.createdAt) ?? "---"}
                  </p>
                  <p className="text-slate-600">{event.message ?? "No message recorded."}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ComplianceValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="break-all text-slate-600">{value}</p>
    </div>
  );
}

function PurchaseBillDetailView({
  document,
  canWrite
}: {
  document: PurchaseBillDetail;
  canWrite: boolean;
}) {
  const editable = canWrite && canEditPurchaseBill(document);
  const canManageAttachments = canWrite && canManagePurchaseBillAttachments(document);
  const canRecordPayment = canWrite && canRecordPurchaseBillPayment(document);

  return (
    <div className="space-y-6">
      <DocumentActions
        attachmentCount={document.attachments.length}
        canWrite={canRecordPayment}
        contactEmail={document.contactEmail}
        contactName={presentContactName(document.contactName)}
        documentId={document.id}
        documentLabel="Bill"
        documentNumber={document.billNumber}
        kind="purchases"
        showPaymentAction
      />
      <DocumentHeader
        badges={[
          <StatusBadge
            key="bill-status"
            label={document.status}
            tone={toneForBillStatus(document.status)}
          />
        ]}
        contactName={presentContactName(document.contactName)}
        currencyCode={document.currencyCode}
        dueLabel="Due Date"
        dueValue={document.dueDate}
        notes={document.notes}
        number={document.billNumber}
        totals={[
          ["Subtotal", money(document.subtotal, document.currencyCode)],
          ["Tax", money(document.taxTotal, document.currencyCode)],
          ["Total", money(document.total, document.currencyCode)],
          ["Amount Due", money(document.amountDue, document.currencyCode)]
        ]}
      />

      <LinesCard currencyCode={document.currencyCode} lines={document.lines} />
      <PaymentsCard currencyCode={document.currencyCode} payments={document.payments} />
      <AttachmentManager
        attachments={document.attachments}
        canWrite={canManageAttachments}
        readOnlyMessage={
          editable || !canWrite
            ? "Read-only access"
            : "Approved bills keep their attachments read-only."
        }
        relatedId={document.id}
        relatedType="purchase-bill"
      />
    </div>
  );
}

function QuoteDetailView({
  document,
  orgSlug,
  canWrite
}: {
  document: QuoteDetail;
  orgSlug: string;
  canWrite: boolean;
}) {
  const canManageAttachments = canWrite && canEditQuote(document);

  return (
    <div className="space-y-6">
      <DocumentActions
        attachmentCount={document.attachments.length}
        canWrite={canWrite}
        contactEmail={document.contactEmail}
        contactName={presentContactName(document.contactName)}
        documentId={document.id}
        documentLabel="Quote"
        documentNumber={document.quoteNumber}
        kind="quotes"
      />
      <DocumentHeader
        badges={[
          <StatusBadge
            key="quote-status"
            label={document.status}
            tone={toneForQuoteStatus(document.status)}
          />
        ]}
        contactName={presentContactName(document.contactName)}
        currencyCode={document.currencyCode}
        dueLabel="Expiry Date"
        dueValue={document.expiryDate}
        notes={document.notes}
        number={document.quoteNumber}
        totals={[
          ["Subtotal", money(document.subtotal, document.currencyCode)],
          ["Tax", money(document.taxTotal, document.currencyCode)],
          ["Total", money(document.total, document.currencyCode)]
        ]}
      />

      <LinesCard currencyCode={document.currencyCode} lines={document.lines} />
      <AttachmentManager
        attachments={document.attachments}
        canWrite={canManageAttachments}
        readOnlyMessage={
          canManageAttachments || !canWrite
            ? "Read-only access"
            : "Converted quotes keep their attachments read-only."
        }
        relatedId={document.id}
        relatedType="quote"
      />

      {document.convertedInvoiceId ? (
        <Card className="border-slate-100">
          <CardHeader>
            <h3 className="text-xl font-semibold tracking-tight text-slate-950">Conversion Result</h3>
          </CardHeader>
          <CardContent>
            <Link
              className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
              href={`/${orgSlug}/accounting/sales/${document.convertedInvoiceId}`}
            >
              Open converted invoice draft
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function DocumentHeader({
  number,
  contactName,
  dueLabel,
  dueValue,
  currencyCode,
  notes,
  totals,
  badges
}: {
  number: string;
  contactName: string;
  dueLabel: string;
  dueValue: string;
  currencyCode: string;
  notes: string | null;
  totals: [string, string][];
  badges: React.ReactNode[];
}) {
  return (
    <Card className="border-slate-100">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{number}</h2>
            <p className="text-sm text-slate-500">{presentContactName(contactName)}</p>
          </div>
          <div className="flex flex-wrap gap-2">{badges}</div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-slate-700">Currency</p>
            <p className="text-slate-600">{currencyCode}</p>
          </div>
          <div>
            <p className="font-medium text-slate-700">{dueLabel}</p>
            <p className="text-slate-600">{formatDate(dueValue)}</p>
          </div>
          <div>
            <p className="font-medium text-slate-700">Notes</p>
            <p className="text-slate-600">{notes || "No notes recorded."}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {totals.map(([label, value]) => (
            <SummaryMetric key={label} label={label} value={value} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LinesCard({
  lines,
  currencyCode
}: {
  lines: {
    id: string;
    description: string;
    inventoryItemCode: string | null;
    inventoryItemName: string | null;
    quantity: string;
    unitPrice: string;
    taxRateName: string | null;
    taxRatePercent: string;
    lineTotal: string;
  }[];
  currencyCode: string;
}) {
  return (
    <Card className="border-slate-100">
      <CardHeader>
        <h3 className="text-xl font-semibold tracking-tight text-slate-950">Line Items</h3>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-[24px] border border-slate-200">
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Tax</th>
                <th className="px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line) => (
                <tr className="transition hover:bg-slate-50/80" key={line.id}>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p>{line.description}</p>
                      {line.inventoryItemCode || line.inventoryItemName ? (
                        <p className="text-xs text-slate-500">
                          {[line.inventoryItemCode, line.inventoryItemName]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{line.quantity}</td>
                  <td className="px-4 py-3">{money(line.unitPrice, currencyCode)}</td>
                  <td className="px-4 py-3">
                    {line.taxRateName ? `${line.taxRateName} (${line.taxRatePercent}%)` : "No tax"}
                  </td>
                  <td className="px-4 py-3">{money(line.lineTotal, currencyCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentsCard({
  payments,
  currencyCode
}: {
  payments: {
    id: string;
    bankAccountId: string | null;
    bankAccountName: string | null;
    paymentDate: string;
    amount: string;
    method: string;
    reference: string | null;
    notes?: string | null;
  }[];
  currencyCode: string;
}) {
  return (
    <Card className="border-slate-100">
      <CardHeader>
        <h3 className="text-xl font-semibold tracking-tight text-slate-950">Payments</h3>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4"
                key={payment.id}
              >
                <div>
                  <p className="font-medium text-slate-800">{payment.method}</p>
                  <p className="text-sm text-slate-500">
                    {formatDate(payment.paymentDate)}
                    {payment.reference ? ` • ${payment.reference}` : ""}
                  </p>
                  <p className="text-sm text-slate-500">
                    {payment.bankAccountName ?? "Unassigned bank account"}
                  </p>
                </div>
                <p className="font-semibold text-slate-900">
                  {money(payment.amount, currencyCode)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusEventsCard({
  events
}: {
  events: {
    id: string;
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    message: string | null;
    createdAt: string;
  }[];
}) {
  return (
    <Card className="border-slate-100">
      <CardHeader>
        <h3 className="text-xl font-semibold tracking-tight text-slate-950">Status Timeline</h3>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No status history recorded.</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4" key={event.id}>
                <p className="font-medium text-slate-800">{event.action}</p>
                <p className="text-sm text-slate-500">
                  {event.fromStatus ?? "Start"} → {event.toStatus ?? "Unchanged"} •{" "}
                  {formatDate(event.createdAt)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {event.message || "No message recorded."}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
