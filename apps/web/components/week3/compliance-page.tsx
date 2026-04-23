import Link from "next/link";
import React from "react";
import type {
  ComplianceDeadLetterDetailRecord,
  ComplianceDeadLetterRecord,
  ComplianceMonitorInvoiceRecord,
  ComplianceOverviewRecord,
  EInvoiceIntegrationRecord,
  ReportedDocumentRecord,
  SalesInvoiceSummary
} from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { presentContactName } from "../presentation";
import { ActionButton } from "./action-button";
import {
  complianceDocumentStatusMeta,
  deadLetterStateMeta,
  failureCategoryMeta,
  formatGeneralStatusLabel,
  normalizeOperatorQueueStatus,
  operatorQueueStatusMeta,
  submissionStatusMeta,
  validationStatusMeta,
} from "./compliance-status";
import { formatDate, money, toneForComplianceStatus, toneForInvoiceStatus } from "./shared";
import { getCapabilities, hasPermission } from "../week2/route-utils";
import { EInvoiceIntegrationPanel } from "../week10/einvoice-integration-panel";

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  const day = date.toISOString().slice(0, 10);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${day} ${hours}:${minutes}`;
}


function takeMessages(messages: string[] | undefined, limit = 2) {
  if (!messages || messages.length === 0) {
    return "None";
  }

  const slice = messages.slice(0, limit);
  if (messages.length <= limit) {
    return slice.join(" | ");
  }

  return `${slice.join(" | ")} +${messages.length - limit} more`;
}

export async function renderCompliancePage(
  orgSlug: string,
  options?: {
    deadLetterSubmissionId?: string;
  },
) {
  const capabilities = await getCapabilities();
  const canReport = hasPermission(capabilities, "compliance.report");
  const canWrite = hasPermission(capabilities, "compliance.write");
  const canManageLifecycle =
    canWrite && hasPermission(capabilities, "platform.org.manage");
  const deadLetterSubmissionId = options?.deadLetterSubmissionId ?? null;
  const [overview, invoices, integration, reportedDocuments, monitorDocuments, deadLetterItems, selectedDeadLetter] =
    await Promise.all([
    fetchServerJson<ComplianceOverviewRecord>("/v1/compliance/overview"),
    fetchServerJson<SalesInvoiceSummary[]>("/v1/sales/invoices"),
    fetchServerJson<EInvoiceIntegrationRecord>("/v1/compliance/integration"),
    fetchServerJson<ReportedDocumentRecord[]>("/v1/compliance/reported-documents"),
    fetchServerJson<ComplianceMonitorInvoiceRecord[]>("/v1/compliance/documents"),
    fetchServerJson<ComplianceDeadLetterRecord[]>("/v1/compliance/dead-letter"),
    deadLetterSubmissionId
      ? fetchServerJson<ComplianceDeadLetterDetailRecord>(
          `/v1/compliance/dead-letter/${deadLetterSubmissionId}`,
        ).catch(() => null)
      : Promise.resolve(null),
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
  const reportedByInvoiceId = new Map(
    reportedDocuments.map((document) => [document.salesInvoiceId, document]),
  );

  return (
    <div className="space-y-6">
      <EInvoiceIntegrationPanel
        canManageLifecycle={canManageLifecycle}
        canWrite={canWrite}
        integration={integration}
      />

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
            <h2 className="text-xl font-semibold">Dead-letter Remediation</h2>
            <p className="text-sm text-slate-500">
              Resolve submissions that exhausted retries and need explicit operator action.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {deadLetterItems.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              No active dead-letter submissions. Automatic retries and latest submissions are currently stable.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Invoice</th>
                    <th className="px-3 py-2 font-medium">State</th>
                    <th className="px-3 py-2 font-medium">Failure</th>
                    <th className="px-3 py-2 font-medium">Failed</th>
                    <th className="px-3 py-2 font-medium">Retryability</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {deadLetterItems.map((item) => {
                    const deadLetterMeta = deadLetterStateMeta(item.state);
                    const failureMeta = failureCategoryMeta(item.failureCategory);

                    return (
                    <tr key={item.submissionId}>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <Link
                            className="font-medium text-slate-800 underline underline-offset-4"
                            href={`/${orgSlug}/accounting/sales/${item.salesInvoiceId}`}
                          >
                            {item.invoiceNumber}
                          </Link>
                          <p className="text-xs text-slate-500">
                            Submission {item.submissionId.slice(0, 12)}... •{" "}
                            {formatGeneralStatusLabel(item.submissionFlow)}
                          </p>
                          <p className="text-xs text-slate-600">{item.reason}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          label={`${deadLetterMeta.icon} ${deadLetterMeta.label}`}
                          tone={deadLetterMeta.tone}
                        />
                        <p className="mt-1 text-xs text-slate-500">{deadLetterMeta.operatorDescription}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <p className="text-xs text-slate-700">
                            {failureMeta.label}
                          </p>
                          <p className="text-xs text-slate-500">
                            Last error: {item.lastError ?? "Not available"}
                          </p>
                          <p className="text-xs text-slate-500">{failureMeta.operatorDescription}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {formatDateTime(item.failedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-xs text-slate-700">
                          {item.wasRetryable ? "Retryable root cause" : "Terminal root cause"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Attempts {item.attemptCount}/{item.maxAttempts}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.canRequeue ? "Can be requeued" : "Requeue blocked"}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <Link
                            className="inline-flex text-xs font-medium text-slate-700 underline underline-offset-4"
                            href={`/${orgSlug}/e-invoice-integration/dead-letter/${item.submissionId}`}
                          >
                            View detail
                          </Link>
                          <ActionButton
                            canWrite={canReport && item.canRequeue}
                            endpoint={`/v1/compliance/dead-letter/${item.submissionId}/requeue`}
                            label="Requeue"
                            pendingLabel="Requeueing..."
                          />
                          <ActionButton
                            canWrite={canReport}
                            endpoint={`/v1/compliance/dead-letter/${item.submissionId}/acknowledge`}
                            label="Acknowledge"
                            pendingLabel="Saving..."
                          />
                          <ActionButton
                            canWrite={canReport}
                            endpoint={`/v1/compliance/dead-letter/${item.submissionId}/escalate`}
                            label="Escalate"
                            pendingLabel="Escalating..."
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedDeadLetter ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Dead-letter Detail</h2>
                <p className="text-sm text-slate-500">
                  Submission {selectedDeadLetter.submissionId}
                </p>
              </div>
              <Link
                className="text-sm font-medium text-slate-700 underline underline-offset-4"
                href={`/${orgSlug}/e-invoice-integration`}
              >
                Close detail
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(() => {
                const deadLetterMeta = deadLetterStateMeta(selectedDeadLetter.state);
                const failureMeta = failureCategoryMeta(selectedDeadLetter.failureCategory);
                const submissionMeta = submissionStatusMeta(
                  selectedDeadLetter.submissionStatus,
                );
                const complianceMeta = complianceDocumentStatusMeta(
                  selectedDeadLetter.compliance.status,
                );

                return (
                  <>
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  label={`${deadLetterMeta.icon} ${deadLetterMeta.label}`}
                  tone={deadLetterMeta.tone}
                />
                <StatusBadge
                  label={`${submissionMeta.icon} ${submissionMeta.label}`}
                  tone={submissionMeta.tone}
                />
                <StatusBadge
                  label={`${complianceMeta.icon} ${complianceMeta.label}`}
                  tone={complianceMeta.tone}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <p className="text-sm text-slate-700">
                  Invoice: {selectedDeadLetter.invoiceNumber}
                </p>
                <p className="text-sm text-slate-700">
                  Failure: {failureMeta.label}
                </p>
                <p className="text-sm text-slate-700">
                  Failed at: {formatDateTime(selectedDeadLetter.failedAt)}
                </p>
                <p className="text-sm text-slate-700">
                  Request ID: {selectedDeadLetter.requestId ?? "Not available"}
                </p>
              </div>
              <p className="text-sm text-slate-700">
                Reason: {selectedDeadLetter.reason}
              </p>
              <p className="text-sm text-slate-600">{failureMeta.operatorDescription}</p>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  Attempts Timeline
                </h3>
                {selectedDeadLetter.compliance.attempts.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No attempts are available for this submission.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDeadLetter.compliance.attempts.map((attempt) => (
                      <div
                        className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                        key={attempt.id}
                      >
                        <p className="text-xs font-medium text-slate-800">
                          Attempt {attempt.attemptNumber} •{" "}
                          {formatGeneralStatusLabel(attempt.status)}
                        </p>
                        <p className="text-xs text-slate-600">
                          {attempt.endpoint}
                          {attempt.httpStatus ? ` • HTTP ${attempt.httpStatus}` : ""}
                        </p>
                        <p className="text-xs text-slate-600">
                          Started {formatDateTime(attempt.startedAt)}
                          {attempt.finishedAt
                            ? ` • Finished ${formatDateTime(attempt.finishedAt)}`
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Event Timeline</h3>
                {selectedDeadLetter.timeline.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No compliance events are available.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDeadLetter.timeline.map((entry) => (
                      <div
                        className="rounded-lg border border-slate-200 bg-white p-2"
                        key={entry.id}
                      >
                        <p className="text-xs font-medium text-slate-800">
                          {entry.action}
                        </p>
                        <p className="text-xs text-slate-600">
                          {formatGeneralStatusLabel(entry.status)} •{" "}
                          {formatDateTime(entry.createdAt)}
                        </p>
                        {entry.message ? (
                          <p className="text-xs text-slate-600">{entry.message}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Invoice Compliance Monitor</h2>
            <p className="text-sm text-slate-500">
              Track queued, processing, accepted, and rejected submissions with
              validation details and retry actions.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {monitorDocuments.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No compliance submission records are available yet. Queue an invoice from the reportable list to start tracking attempts, warnings, and responses.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Invoice</th>
                    <th className="px-3 py-2 font-medium">Submission Status</th>
                    <th className="px-3 py-2 font-medium">Validation</th>
                    <th className="px-3 py-2 font-medium">ZATCA Response</th>
                    <th className="px-3 py-2 font-medium">Attempts Timeline</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {monitorDocuments.map((item) => {
                    const compliance = item.compliance;
                    const queueStatus = normalizeOperatorQueueStatus({
                      status: compliance.status,
                      lastSubmissionStatus: compliance.lastSubmissionStatus,
                      submissionStatus: compliance.submission?.status ?? null,
                    });
                    const queueMeta = operatorQueueStatusMeta(queueStatus);
                    const validationMeta = validationStatusMeta(
                      compliance.localValidation?.status,
                    );
                    const failureMeta = failureCategoryMeta(
                      compliance.failureCategory,
                    );
                    const complianceMeta = complianceDocumentStatusMeta(compliance.status);
                    const reported = reportedByInvoiceId.get(item.salesInvoiceId);
                    const latestAttempt = compliance.attempts[0];
                    const requestId =
                      compliance.submission?.requestId ??
                      latestAttempt?.requestId ??
                      "No request id";

                    return (
                      <tr key={compliance.id}>
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <Link
                              className="font-medium text-slate-800 underline underline-offset-4"
                              href={`/${orgSlug}/accounting/sales/${item.salesInvoiceId}`}
                            >
                              {item.invoiceNumber}
                            </Link>
                            <p className="text-xs text-slate-500">
                              Issue {formatDate(item.issueDate)} • Due {formatDate(item.dueDate)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {money(item.total, item.currencyCode)}
                            </p>
                            <div className="flex gap-2">
                              <StatusBadge
                                label={item.invoiceStatus}
                                tone={toneForInvoiceStatus(item.invoiceStatus)}
                              />
                              <StatusBadge
                                label={`${complianceMeta.icon} ${complianceMeta.label}`}
                                tone={complianceMeta.tone}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-2">
                            <StatusBadge
                              label={`${queueMeta.icon} ${queueMeta.label}`}
                              tone={queueMeta.tone}
                            />
                            <p className="text-xs text-slate-500">{queueMeta.operatorDescription}</p>
                            <p className="text-xs text-slate-500">
                              Last update {formatDateTime(compliance.updatedAt)}
                            </p>
                            {compliance.submission?.nextRetryAt ? (
                              <p className="text-xs text-slate-500">
                                Next retry {formatDateTime(compliance.submission.nextRetryAt)}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {compliance.localValidation ? (
                            <div className="space-y-1">
                              <p className="font-medium text-slate-800">
                                {validationMeta.icon} {validationMeta.label}
                              </p>
                              <p className="text-xs text-slate-500">{validationMeta.operatorDescription}</p>
                              <p className="text-xs text-amber-700">
                                Warnings:{" "}
                                {takeMessages(compliance.localValidation.warnings)}
                              </p>
                              <p className="text-xs text-rose-700">
                                Errors: {takeMessages(compliance.localValidation.errors)}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">
                              Local SDK validation has not been recorded yet.
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-1 text-xs text-slate-600">
                            <p>
                              Response:{" "}
                              {reported?.responseCode ??
                                compliance.lastSubmissionStatus ??
                                "No response code"}
                            </p>
                            <p>
                              Message:{" "}
                              {reported?.responseMessage ??
                                compliance.lastError ??
                                "No response message"}
                            </p>
                            <p>Request ID: {requestId}</p>
                            <p>
                              External ID:{" "}
                              {compliance.externalSubmissionId ??
                                reported?.externalSubmissionId ??
                                "Not provided"}
                            </p>
                            {compliance.failureCategory ? (
                              <p>
                                Failure: {failureMeta.label}
                              </p>
                            ) : null}
                            {compliance.failureCategory ? (
                              <p>{failureMeta.operatorDescription}</p>
                            ) : null}
                            <p>
                              Submission warnings:{" "}
                              {takeMessages(compliance.submission?.warnings)}
                            </p>
                            <p>
                              Submission errors:{" "}
                              {takeMessages(compliance.submission?.errors)}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {compliance.attempts.length === 0 &&
                          compliance.timeline.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No attempts or events recorded yet.
                            </p>
                          ) : (
                            <details>
                              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                                {compliance.attempts.length} attempts •{" "}
                                {compliance.timeline.length} events
                              </summary>
                              <div className="mt-2 space-y-2">
                                {compliance.attempts.map((attempt) => (
                                  <div
                                    className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                                    key={attempt.id}
                                  >
                                    <p className="font-medium text-slate-800">
                                      Attempt {attempt.attemptNumber} •{" "}
                                      {formatGeneralStatusLabel(attempt.status)}
                                    </p>
                                    <p className="text-xs text-slate-600">
                                      {attempt.endpoint}
                                      {attempt.httpStatus
                                        ? ` • HTTP ${attempt.httpStatus}`
                                        : ""}
                                    </p>
                                    <p className="text-xs text-slate-600">
                                      Started {formatDateTime(attempt.startedAt)}
                                      {attempt.finishedAt
                                        ? ` • Finished ${formatDateTime(attempt.finishedAt)}`
                                        : ""}
                                    </p>
                                    <p className="text-xs text-amber-700">
                                      Warnings: {takeMessages(attempt.warnings)}
                                    </p>
                                    <p className="text-xs text-rose-700">
                                      Errors: {takeMessages(attempt.errors)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-2">
                            <Link
                              className="inline-flex text-xs font-medium text-slate-700 underline underline-offset-4"
                              href={`/${orgSlug}/accounting/sales/${item.salesInvoiceId}`}
                            >
                              Open Invoice
                            </Link>
                            {compliance.retryAllowed ? (
                              <ActionButton
                                canWrite={canReport}
                                endpoint={`/v1/compliance/invoices/${item.salesInvoiceId}/retry`}
                                label="Retry"
                                pendingLabel="Retrying..."
                              />
                            ) : (
                              <p className="text-xs text-slate-500">
                                Retry is currently blocked. Review failure category and dead-letter state for remediation.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                    <th className="px-3 py-2 font-medium">Request</th>
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
                      <td className="px-3 py-3">
                        {document.externalSubmissionId ??
                          document.failureCategory ??
                          "No request id"}
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
