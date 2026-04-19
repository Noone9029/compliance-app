import React from "react";
import type { AuditReportResponse } from "@daftar/types";
import { Button, Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { fetchServerJson } from "../api";

function getFirstQueryValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function formatDateTime(value: string) {
  const date = new Date(value).toISOString();
  return `${date.slice(0, 10)} ${date.slice(11, 16)} UTC`;
}

function toneForResult(result: "SUCCESS" | "FAILURE" | "INFO") {
  if (result === "SUCCESS") {
    return "success" as const;
  }

  if (result === "FAILURE") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function buildAuditReportEndpoint(filters: {
  search?: string;
  result?: "SUCCESS" | "FAILURE" | "INFO";
}) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.result) {
    params.set("result", filters.result);
  }

  return params.size ? `/v1/audit-report?${params.toString()}` : "/v1/audit-report";
}

function MetricCard({
  label,
  value,
  subtitle
}: {
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export async function renderAuditReportPage(
  orgSlug: string,
  searchParams: Record<string, string | string[] | undefined>
) {
  const search = getFirstQueryValue(searchParams.search)?.trim() || "";
  const rawResult = getFirstQueryValue(searchParams.result);
  const result =
    rawResult === "SUCCESS" || rawResult === "FAILURE" || rawResult === "INFO"
      ? rawResult
      : "";

  const report = await fetchServerJson<AuditReportResponse>(
    buildAuditReportEndpoint({
      search: search || undefined,
      result: result || undefined
    })
  );

  const hasFilters = Boolean(search || result);
  const filtersAction = `/${orgSlug}/audit-report`;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          label="Matching Events"
          subtitle="Tenant-scoped events matching the current filters."
          value={String(report.metrics.totalEvents)}
        />
        <MetricCard
          label="Success"
          subtitle="Successful write and system events."
          value={String(report.metrics.successCount)}
        />
        <MetricCard
          label="Failures"
          subtitle="Failed actions worth investigation."
          value={String(report.metrics.failureCount)}
        />
        <MetricCard
          label="Actors"
          subtitle={`${report.metrics.userEvents} user events and ${report.metrics.systemEvents} system events.`}
          value={String(report.metrics.userEvents + report.metrics.systemEvents)}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Audit Report</h2>
            <p className="text-sm text-slate-500">
              Query the tenant audit trail across auth, setup, accounting, billing,
              compliance, connectors, and file actions.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form
            action={filtersAction}
            className="grid gap-3 lg:grid-cols-[2fr_1fr_auto_auto]"
            method="get"
          >
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Search</span>
              <input
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-400"
                defaultValue={search}
                name="search"
                placeholder="Action, actor, target, or id"
                type="search"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Result</span>
              <select
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-0 transition focus:border-slate-400"
                defaultValue={result}
                name="result"
              >
                <option value="">All results</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="FAILURE">FAILURE</option>
                <option value="INFO">INFO</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button className="w-full lg:w-auto" type="submit">
                Apply Filters
              </Button>
            </div>
            <div className="flex items-end">
              {hasFilters ? (
                <a
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 lg:w-auto"
                  href={filtersAction}
                >
                  Clear
                </a>
              ) : (
                <div />
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Events</h3>
              <p className="text-sm text-slate-500">
                Showing the latest {report.events.length} matching events.
              </p>
            </div>
            {report.metrics.totalEvents > report.events.length ? (
              <p className="text-sm text-slate-500">
                Refine filters to narrow {report.metrics.totalEvents} total matches.
              </p>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {report.events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-900">
                No audit events matched the current filters.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Try a broader search term or clear the result filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Target</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.events.map((event) => (
                    <tr key={event.id}>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-slate-900">
                          {formatDateTime(event.createdAt)}
                        </p>
                        {event.requestId ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Request {event.requestId}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-slate-900">
                          {event.actorDisplayName ?? event.actorEmail ?? event.actorType}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {event.actorEmail ?? event.actorType}
                          {event.ipAddress ? ` • ${event.ipAddress}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-slate-900">{event.action}</p>
                        {event.metadata ? (
                          <details className="mt-2 text-xs text-slate-500">
                            <summary className="cursor-pointer select-none">
                              Metadata
                            </summary>
                            <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-3 text-[11px] text-slate-700">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-slate-900">{event.targetType}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {event.targetId ?? "No target id"}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <StatusBadge label={event.result} tone={toneForResult(event.result)} />
                      </td>
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
