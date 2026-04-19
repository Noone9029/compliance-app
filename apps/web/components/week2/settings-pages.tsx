import React from "react";
import type {
  ConnectorAccountRecord,
  ConnectorSyncLogRecord,
  ConnectorSyncPreviewRecord,
  TeamInvitationRecord,
  TeamMemberRecord,
  CurrencyRecord,
  CustomOrganizationSettingsRecord,
  EmailTemplateRecord,
  InvoiceSettingsRecord,
  OrganizationTaxDetailRecord,
  TaxRateRecord,
  TrackingCategoryRecord
} from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";
import { notFound } from "next/navigation";

import { fetchServerJson } from "../api";
import { ResourceManager } from "./resource-manager";
import { SectionNav } from "./section-nav";
import { SettingsHub } from "./settings-hub";
import { SingletonForm } from "./singleton-form";
import { TeamAccessPanel } from "./team-access-panel";
import { getCapabilities, hasPermission, settingsNav } from "./route-utils";
import { formatDate } from "../week3/shared";

export async function renderSettingsPage(orgSlug: string, segments: string[]) {
  if (segments.length === 1) {
    return <SettingsHub orgSlug={orgSlug} />;
  }

  const section = segments[1];
  const capabilities = await getCapabilities();
  const nav = settingsNav(orgSlug, section);
  const canWrite = hasPermission(capabilities, "setup.write");
  const canReadTeamAccess = hasPermission(
    capabilities,
    "platform.membership.read"
  );
  const canManageTeamAccess = hasPermission(
    capabilities,
    "platform.membership.manage"
  );
  const canReadConnectors = hasPermission(capabilities, "connectors.read");

  if (section === "tax-rates") {
    const taxRates = await fetchServerJson<TaxRateRecord[]>("/v1/setup/tax-rates");

    return (
      <div className="space-y-6">
        <SectionNav items={nav} title="Settings" />
        <ResourceManager
          canWrite={canWrite}
          columns={[
            { label: "Name", field: "name" },
            { label: "Code", field: "code", empty: "None" },
            { label: "Rate", field: "rate" },
            { label: "Scope", field: "scope" },
            {
              label: "Status",
              kind: "badges",
              badges: [
                { field: "isDefault", trueLabel: "Default", trueTone: "success" },
                {
                  field: "isActive",
                  trueLabel: "Active",
                  falseLabel: "Inactive",
                  trueTone: "success",
                  falseTone: "warning"
                }
              ]
            }
          ]}
          createPath="/v1/setup/tax-rates"
          description="Maintain organization tax rates used across setup screens."
          emptyState="No tax rates have been created yet."
          fields={[
            { name: "name", label: "Name", type: "text" },
            { name: "code", label: "Code", type: "text" },
            { name: "rate", label: "Rate", type: "number" },
            {
              name: "scope",
              label: "Scope",
              type: "select",
              options: [
                { label: "Sales", value: "SALES" },
                { label: "Purchase", value: "PURCHASE" },
                { label: "Both", value: "BOTH" }
              ]
            },
            { name: "isDefault", label: "Default", type: "checkbox" },
            { name: "isActive", label: "Active", type: "checkbox" }
          ]}
          items={taxRates}
          formsById={Object.fromEntries(
            taxRates.map((item) => [
              item.id,
              {
                name: item.name,
                code: item.code ?? "",
                rate: item.rate,
                scope: item.scope,
                isDefault: item.isDefault,
                isActive: item.isActive
              }
            ])
          )}
          newItem={{
            name: "",
            code: "",
            rate: "15.00",
            scope: "BOTH",
            isDefault: false,
            isActive: true
          }}
          payloadPreset="tax-rates"
          title="Tax Rates"
          updatePathBase="/v1/setup/tax-rates"
        />
      </div>
    );
  }

  if (section === "organisation-tax-details") {
    const taxDetail = await fetchServerJson<OrganizationTaxDetailRecord | null>(
      "/v1/setup/organisation-tax-details"
    );

    return (
      <div className="space-y-6">
        <SectionNav items={nav} title="Settings" />
        <SingletonForm
          canWrite={canWrite}
          description="Store legal registration and tax profile details for the current organization."
          endpoint="/v1/setup/organisation-tax-details"
          fields={[
            { name: "legalName", label: "Legal Name", type: "text" },
            { name: "taxNumber", label: "Tax Number", type: "text" },
            { name: "countryCode", label: "Country Code", type: "text" },
            { name: "taxOffice", label: "Tax Office", type: "text" },
            { name: "registrationNumber", label: "Registration Number", type: "text" },
            { name: "addressLine1", label: "Address Line 1", type: "text" },
            { name: "addressLine2", label: "Address Line 2", type: "text" },
            { name: "city", label: "City", type: "text" },
            { name: "postalCode", label: "Postal Code", type: "text" }
          ]}
          initialValues={{
            legalName: taxDetail?.legalName ?? "",
            taxNumber: taxDetail?.taxNumber ?? "",
            countryCode: taxDetail?.countryCode ?? "SA",
            taxOffice: taxDetail?.taxOffice ?? "",
            registrationNumber: taxDetail?.registrationNumber ?? "",
            addressLine1: taxDetail?.addressLine1 ?? "",
            addressLine2: taxDetail?.addressLine2 ?? "",
            city: taxDetail?.city ?? "",
            postalCode: taxDetail?.postalCode ?? ""
          }}
          title="Organisation Tax Details"
        />
      </div>
    );
  }

  if (section === "tracking") {
    const trackingCategories = await fetchServerJson<TrackingCategoryRecord[]>(
      "/v1/setup/tracking-categories"
    );

    return (
      <div className="space-y-6">
        <SectionNav items={nav} title="Settings" />
        <ResourceManager
          canWrite={canWrite}
          columns={[
            { label: "Name", field: "name" },
            { label: "Description", field: "description", empty: "None" },
            {
              label: "Options",
              kind: "join-array-field",
              field: "options",
              nestedField: "name",
              empty: "None"
            },
            {
              label: "Status",
              kind: "badges",
              badges: [
                {
                  field: "isActive",
                  trueLabel: "Active",
                  falseLabel: "Inactive",
                  trueTone: "success",
                  falseTone: "warning"
                }
              ]
            }
          ]}
          createPath="/v1/setup/tracking-categories"
          description="Create tracking categories and option sets for reporting and analysis."
          emptyState="No tracking categories exist yet."
          fields={[
            { name: "name", label: "Name", type: "text" },
            { name: "description", label: "Description", type: "textarea", rows: 3 },
            {
              name: "optionsCsv",
              label: "Options (one per line, optional color after a pipe)",
              type: "textarea",
              rows: 5
            },
            { name: "isActive", label: "Active", type: "checkbox" }
          ]}
          items={trackingCategories}
          formsById={Object.fromEntries(
            trackingCategories.map((item) => [
              item.id,
              {
                name: item.name,
                description: item.description ?? "",
                optionsCsv: item.options
                  .map((option) => `${option.name}${option.color ? ` | ${option.color}` : ""}`)
                  .join("\n"),
                isActive: item.isActive
              }
            ])
          )}
          newItem={{
            name: "",
            description: "",
            optionsCsv: "",
            isActive: true
          }}
          payloadPreset="tracking-categories"
          title="Tracking Categories"
          updatePathBase="/v1/setup/tracking-categories"
        />
      </div>
    );
  }

  if (section === "currencies") {
    const currencies = await fetchServerJson<CurrencyRecord[]>("/v1/setup/currencies");

    return (
      <div className="space-y-6">
        <SectionNav items={nav} title="Settings" />
        <ResourceManager
          canWrite={canWrite}
          columns={[
            { label: "Code", field: "code" },
            { label: "Name", field: "name" },
            { label: "Symbol", field: "symbol" },
            { label: "Rate", field: "exchangeRate" },
            {
              label: "Flags",
              kind: "badges",
              badges: [
                { field: "isBase", trueLabel: "Base", trueTone: "success" },
                {
                  field: "isActive",
                  trueLabel: "Active",
                  falseLabel: "Inactive",
                  trueTone: "success",
                  falseTone: "warning"
                }
              ]
            }
          ]}
          createPath="/v1/setup/currencies"
          description="Enable currencies and maintain reference exchange rates."
          emptyState="No currencies configured."
          fields={[
            { name: "code", label: "Code", type: "text" },
            { name: "name", label: "Name", type: "text" },
            { name: "symbol", label: "Symbol", type: "text" },
            { name: "exchangeRate", label: "Exchange Rate", type: "number" },
            { name: "isBase", label: "Base Currency", type: "checkbox" },
            { name: "isActive", label: "Active", type: "checkbox" }
          ]}
          items={currencies}
          formsById={Object.fromEntries(
            currencies.map((item) => [
              item.id,
              {
                code: item.code,
                name: item.name,
                symbol: item.symbol,
                exchangeRate: item.exchangeRate,
                isBase: item.isBase,
                isActive: item.isActive
              }
            ])
          )}
          newItem={{
            code: "SAR",
            name: "",
            symbol: "SAR",
            exchangeRate: "1.000000",
            isBase: false,
            isActive: true
          }}
          payloadPreset="currencies"
          title="Currencies"
          updatePathBase="/v1/setup/currencies"
        />
      </div>
    );
  }

  if (section === "invoice-settings") {
    const invoiceSettings = await fetchServerJson<InvoiceSettingsRecord>(
      "/v1/setup/invoice-settings"
    );

    return (
      <div className="space-y-6">
        <SectionNav items={nav} title="Settings" />
        <SingletonForm
          canWrite={canWrite}
          description="Store invoice numbering defaults and footer content."
          endpoint="/v1/setup/invoice-settings"
          fields={[
            { name: "invoicePrefix", label: "Invoice Prefix", type: "text" },
            { name: "defaultDueDays", label: "Default Due Days", type: "number" },
            { name: "footerNote", label: "Footer Note", type: "textarea", rows: 4 },
            { name: "whatsappEnabled", label: "WhatsApp Placeholder Enabled", type: "checkbox" }
          ]}
          initialValues={{
            invoicePrefix: invoiceSettings.invoicePrefix,
            defaultDueDays: String(invoiceSettings.defaultDueDays),
            footerNote: invoiceSettings.footerNote,
            whatsappEnabled: invoiceSettings.whatsappEnabled
          }}
          title="Invoice Settings"
        />
      </div>
    );
  }

  if (section === "email-templates") {
    const emailTemplates = await fetchServerJson<EmailTemplateRecord[]>(
      "/v1/setup/email-templates"
    );

    return (
      <div className="space-y-6">
        <SectionNav items={nav} title="Settings" />
        <ResourceManager
          canWrite={canWrite}
          columns={[
            { label: "Key", field: "key" },
            { label: "Name", field: "name" },
            { label: "Subject", field: "subject" },
            {
              label: "Flags",
              kind: "badges",
              badges: [
                { field: "isDefault", trueLabel: "Default", trueTone: "success" },
                {
                  field: "isActive",
                  trueLabel: "Active",
                  falseLabel: "Inactive",
                  trueTone: "success",
                  falseTone: "warning"
                }
              ]
            }
          ]}
          createPath="/v1/setup/email-templates"
          description="Maintain outbound template content used across future flows."
          emptyState="No email templates configured."
          fields={[
            { name: "key", label: "Key", type: "text" },
            { name: "name", label: "Name", type: "text" },
            { name: "subject", label: "Subject", type: "text" },
            { name: "body", label: "Body", type: "textarea", rows: 6 },
            { name: "isDefault", label: "Default", type: "checkbox" },
            { name: "isActive", label: "Active", type: "checkbox" }
          ]}
          items={emailTemplates}
          formsById={Object.fromEntries(
            emailTemplates.map((item) => [
              item.id,
              {
                key: item.key,
                name: item.name,
                subject: item.subject,
                body: item.body,
                isDefault: item.isDefault,
                isActive: item.isActive
              }
            ])
          )}
          newItem={{
            key: "",
            name: "",
            subject: "",
            body: "",
            isDefault: false,
            isActive: true
          }}
          payloadPreset="email-templates"
          title="Email Templates"
          updatePathBase="/v1/setup/email-templates"
        />
      </div>
    );
  }

  if (section === "custom-organisation-settings") {
    const customSettings = await fetchServerJson<CustomOrganizationSettingsRecord>(
      "/v1/setup/custom-organisation-settings"
    );

    return (
      <div className="space-y-6">
        <SectionNav items={nav} title="Settings" />
        <SingletonForm
          canWrite={canWrite}
          description="Store operational defaults that are organization-specific."
          endpoint="/v1/setup/custom-organisation-settings"
          fields={[
            { name: "defaultLanguage", label: "Default Language", type: "text" },
            { name: "timezone", label: "Timezone", type: "text" },
            { name: "fiscalYearStartMonth", label: "Fiscal Year Start Month", type: "number" },
            { name: "notes", label: "Notes", type: "textarea", rows: 4 }
          ]}
          initialValues={{
            defaultLanguage: customSettings.defaultLanguage,
            timezone: customSettings.timezone,
            fiscalYearStartMonth: String(customSettings.fiscalYearStartMonth),
            notes: customSettings.notes
          }}
          title="Custom Organisation Settings"
        />
      </div>
    );
  }

  if (section === "connector-settings") {
    if (!canReadConnectors) {
      return (
        <div className="space-y-6">
          <SectionNav items={nav} title="Settings" />
          <Card>
            <CardHeader>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Connector Readiness</h2>
                <p className="text-sm text-slate-500">
                  Your current role does not allow access to connector configuration or history for this organization.
                </p>
              </div>
            </CardHeader>
          </Card>
        </div>
      );
    }

    const [accounts, logs] = await Promise.all([
      fetchServerJson<ConnectorAccountRecord[]>("/v1/connectors/accounts"),
      fetchServerJson<ConnectorSyncLogRecord[]>("/v1/connectors/logs")
    ]);
    const previews = await Promise.all(
      accounts.map((account) =>
        fetchServerJson<ConnectorSyncPreviewRecord>(
          `/v1/connectors/accounts/${account.id}/export-preview`
        ).catch(() => null)
      )
    );
    const previewMap = new Map(
      previews
        .filter((preview): preview is ConnectorSyncPreviewRecord => Boolean(preview))
        .map((preview) => [preview.connectorAccountId, preview])
    );

    return (
      <div className="space-y-6">
        <SectionNav items={nav} title="Settings" />
        <Card>
          <CardHeader>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Connector Readiness</h2>
              <p className="text-sm text-slate-500">
                Stored connector state, export readiness, and sync history are available here.
                Live provider authentication and sync controls are not enabled in this workspace.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Accounts
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {accounts.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Logs Recorded
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{logs.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Connected Accounts
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {accounts.filter((account) => account.status === "CONNECTED").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          {accounts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-slate-500">
                No connector accounts are recorded for this organisation yet.
              </CardContent>
            </Card>
          ) : null}
          {accounts.map((account) => {
            const preview = previewMap.get(account.id);
            return (
              <Card key={account.id}>
                <CardHeader>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold">{account.displayName}</h2>
                      <StatusBadge
                        label={account.status}
                        tone={
                          account.status === "CONNECTED"
                            ? "success"
                            : account.status === "ERROR"
                              ? "warning"
                              : "neutral"
                        }
                      />
                    </div>
                    <p className="text-sm text-slate-500">
                      {presentConnectorProvider(account.provider)}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ConnectorDetail label="External Tenant" value={account.externalTenantId ?? "Not recorded"} />
                    <ConnectorDetail
                      label="Connected"
                      value={account.connectedAt ? formatDate(account.connectedAt) : "Not connected"}
                    />
                    <ConnectorDetail
                      label="Last Sync Logged"
                      value={account.lastSyncedAt ? formatDate(account.lastSyncedAt) : "Not recorded"}
                    />
                    <ConnectorDetail
                      label="Scopes"
                      value={account.scopes.length > 0 ? account.scopes.join(", ") : "Not recorded"}
                    />
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Export readiness</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(preview?.scopes ?? []).length > 0 ? (
                        preview!.scopes.map((scope) => (
                          <div
                            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                            key={scope.scope}
                          >
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                              {scope.scope}
                            </p>
                            <p className="mt-2 text-lg font-semibold text-slate-900">
                              {scope.recordCount}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">
                          No export preview is available for this connector account.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Connector Activity Log</h2>
              <p className="text-sm text-slate-500">
                Recorded sync history and provider-facing messages remain visible even while live transport controls are disabled.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Direction</th>
                    <th className="px-3 py-2 font-medium">Scope</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Started</th>
                    <th className="px-3 py-2 font-medium">Finished</th>
                    <th className="px-3 py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-3 py-3">
                        {presentConnectorProvider(
                          accounts.find((account) => account.id === log.connectorAccountId)?.provider ?? "XERO"
                        )}
                      </td>
                      <td className="px-3 py-3">{log.direction}</td>
                      <td className="px-3 py-3">{log.scope}</td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          label={log.status}
                          tone={log.status === "SUCCESS" ? "success" : "warning"}
                        />
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatDate(log.startedAt)}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {log.finishedAt ? formatDate(log.finishedAt) : "In progress"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{log.message ?? "None"}</td>
                    </tr>
                  ))}
                  {logs.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-slate-500" colSpan={7}>
                        No connector logs recorded.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (section === "team-access") {
    const [members, invitations] = canReadTeamAccess
      ? await Promise.all([
          fetchServerJson<TeamMemberRecord[]>("/v1/memberships/team"),
          fetchServerJson<TeamInvitationRecord[]>("/v1/memberships/invitations")
        ])
      : [[], []];

    return (
      <div className="space-y-6">
        <SectionNav items={nav} title="Settings" />
        <TeamAccessPanel
          canManage={canManageTeamAccess}
          canRead={canReadTeamAccess}
          invitations={invitations}
          members={members}
          orgSlug={orgSlug}
        />
      </div>
    );
  }

  notFound();
}

function ConnectorDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function presentConnectorProvider(provider: ConnectorAccountRecord["provider"]) {
  if (provider === "QUICKBOOKS_ONLINE") {
    return "QuickBooks Online";
  }

  if (provider === "ZOHO_BOOKS") {
    return "Zoho Books";
  }

  return "Xero";
}
