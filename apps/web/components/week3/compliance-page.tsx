import Link from "next/link";
import React from "react";
import type {
  ComplianceOverviewRecord,
  EInvoiceIntegrationRecord,
  SalesInvoiceSummary
} from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { presentContactName } from "../presentation";
import { ActionButton } from "./action-button";
import { formatDate, toneForComplianceStatus, toneForInvoiceStatus } from "./shared";
import { getCapabilities, hasPermission } from "../week2/route-utils";
import { EInvoiceIntegrationPanel } from "../week10/einvoice-integration-panel";

export async function renderCompliancePage(orgSlug: string) {
  const capabilities = await getCapabilities();
  const canReport = hasPermission(capabilities, "compliance.report");
  const canWrite = hasPermission(capabilities, "compliance.write");
  const [overview, invoices, integration] = await Promise.all([
    fetchServerJson<ComplianceOverviewRecord>("/v1/compliance/overview"),
    fetchServerJson<SalesInvoiceSummary[]>("/v1/sales/invoices"),
    fetchServerJson<EInvoiceIntegrationRecord>("/v1/compliance/integration")
  ]);

  const reportableInvoices = invoices.filter(
    (invoice) =>
      invoice.status !== "DRAFT" &&
      invoice.status !== "VOID" &&
      ![
        "CLEARED",
        "CLEARED_WITH_WARNINGS",
        "REPORTED",
        "REPORTED_WITH_WARNINGS"
      ].includes(invoice.complianceStatus ?? "")
  );

  return (
    <div className="space-y-6">
      <EInvoiceIntegrationPanel canWrite={canWrite} integration={integration} />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Invoices Ready" value={String(overview.totalInvoicesReady)} />
        <MetricCard
          label="Reported Documents"
          value={String(overview.totalReportedDocuments)}
        />
        <MetricCard label="Queued Submissions" value={String(overview.queuedSubmissions)} />
        <MetricCard
          label="In Flight / Failed"
          value={String(
            overview.processingSubmissions +
              overview.retryScheduledSubmissions +
              overview.failedSubmissions
          )}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Reportable Invoices</h2>
            <p className="text-sm text-slate-500">
              Queue invoices for clearance or reporting and monitor the result from invoice detail.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {reportableInvoices.length === 0 ? (
            <p className="text-sm text-slate-500">No invoices are currently ready to report.</p>
          ) : (
            <div className="space-y-3">
              {reportableInvoices.map((invoice) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                  key={invoice.id}
                >
                  <div className="space-y-1">
                    <Link
                      className="font-medium text-slate-800 underline underline-offset-4"
                      href={`/${orgSlug}/accounting/sales/${invoice.id}`}
                    >
                      {invoice.invoiceNumber}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {presentContactName(invoice.contactName)} • {formatDate(invoice.issueDate)}
                    </p>
                    <div className="flex gap-2">
                      <StatusBadge
                        label={invoice.status}
                        tone={toneForInvoiceStatus(invoice.status)}
                      />
                      {invoice.complianceStatus ? (
                        <StatusBadge
                          label={invoice.complianceStatus}
                          tone={toneForComplianceStatus(invoice.complianceStatus)}
                        />
                      ) : null}
                    </div>
                  </div>
                  <ActionButton
                    canWrite={canReport}
                    endpoint={`/v1/compliance/invoices/${invoice.id}/report`}
                    label="Queue Submission"
                    pendingLabel="Submitting..."
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Recent Compliance Documents</h2>
            <p className="text-sm text-slate-500">
              Latest successful and failed submissions from the live compliance log.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {overview.recentReportedDocuments.length === 0 ? (
            <p className="text-sm text-slate-500">No reported documents yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Document</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Response</th>
                    <th className="px-3 py-2 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.recentReportedDocuments.map((document) => (
                    <tr key={document.id}>
                      <td className="px-3 py-3">{document.documentNumber}</td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          label={document.status}
                          tone={toneForComplianceStatus(document.status as never)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {document.responseCode ?? "No code"}
                        {document.responseMessage ? ` • ${document.responseMessage}` : ""}
                      </td>
                      <td className="px-3 py-3">{formatDate(document.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          {label}
        </p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
