import React from "react";
import type {
  AccountingDashboardRecord,
  ChartPointRecord,
  OrganizationStatsRecord,
  PermissionKey,
  ProfitLossSeriesRecord
} from "@daftar/types";
import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { presentOrganizationName } from "../presentation";
import { getCapabilities, hasPermission } from "../week2/route-utils";
import { money } from "../week3/shared";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

type ServiceTileDefinition = {
  key: string;
  label: string;
  href: (orgSlug: string) => string;
  permission: PermissionKey;
  icon: "accounting" | "hr" | "compliance" | "subscription" | "task" | "apps" | "list" | "settings";
};

const HOME_MODULES: ServiceTileDefinition[] = [
  {
    key: "accounting",
    label: "Accounting",
    href: (orgSlug) => `/${orgSlug}/accounting/dashboard`,
    permission: "shell.accounting.read",
    icon: "accounting"
  },
  {
    key: "hr-payroll",
    label: "HR & Payroll",
    href: (orgSlug) => `/${orgSlug}/hr-payroll`,
    permission: "shell.hr_payroll.read",
    icon: "hr"
  },
  {
    key: "e-invoice",
    label: "E-Invoice Integration",
    href: (orgSlug) => `/${orgSlug}/e-invoice-integration`,
    permission: "shell.e_invoice.read",
    icon: "compliance"
  },
  {
    key: "subscription",
    label: "Subscription",
    href: (orgSlug) => `/${orgSlug}/subscription`,
    permission: "shell.subscription.read",
    icon: "subscription"
  },
  {
    key: "task-management",
    label: "Task Management",
    href: (orgSlug) => `/${orgSlug}/task-management`,
    permission: "shell.task_management.read",
    icon: "task"
  },
  {
    key: "applications",
    label: "Applications",
    href: (orgSlug) => `/${orgSlug}/applications`,
    permission: "shell.applications.read",
    icon: "apps"
  },
  {
    key: "list-tracking",
    label: "List Tracking",
    href: (orgSlug) => `/${orgSlug}/list-tracking`,
    permission: "shell.list_tracking.read",
    icon: "list"
  },
  {
    key: "settings",
    label: "Settings",
    href: (orgSlug) => `/${orgSlug}/settings`,
    permission: "shell.settings.read",
    icon: "settings"
  }
];

const ACCOUNTING_OVERVIEW_MODULES = [
  ["sales", "Sales", "Invoices, credit notes, and recurring sales flows."],
  ["purchases", "Purchases", "Bills, purchase orders, and vendor activity."],
  ["quotes", "Quotes", "Prepare and convert quotes into live invoices."],
  ["bank-accounts", "Bank Accounts", "Bank account balances and opening positions."],
  ["chart-of-accounts", "Chart of Accounts", "Canonical account structure and ledgers."],
  ["inventory", "Inventory", "Products, stock counts, and manual adjustment history."],
  ["fixed-assets", "Fixed Assets", "Asset register, depreciation, and book values."],
  ["manual-journals", "Manual Journals", "Balanced manual entries for accruals, corrections, and adjustments."]
] as const;

function getFirstQueryValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function buildOrganisationStatsEndpoint(filters: { year?: string; month?: string }) {
  const params = new URLSearchParams();

  if (filters.year) {
    params.set("year", filters.year);
  }

  if (filters.month) {
    params.set("month", filters.month);
  }

  return params.size
    ? `/v1/accounting/organisation-stats?${params.toString()}`
    : "/v1/accounting/organisation-stats";
}

function ServiceIcon({ icon }: { icon: ServiceTileDefinition["icon"] }) {
  const shared = "h-8 w-8 text-emerald-600";

  if (icon === "accounting") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <rect height="20" rx="3" stroke="currentColor" strokeWidth="1.8" width="16" x="8" y="6" />
        <path d="M12 12h8M12 17h8M12 22h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M20 6v20" stroke="currentColor" strokeDasharray="2 2" strokeWidth="1.4" />
      </svg>
    );
  }

  if (icon === "hr") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="21" cy="11" r="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6.5 24a6 6 0 0 1 11 0M17 24a4.5 4.5 0 0 1 8 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "compliance") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <rect height="18" rx="3" stroke="currentColor" strokeWidth="1.8" width="14" x="9" y="7" />
        <path d="M13 12h6M13 16h6M13 20h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="m22 10 3 3-6 6-3 1 1-3 5-5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "subscription") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <rect height="18" rx="3" stroke="currentColor" strokeWidth="1.8" width="20" x="6" y="7" />
        <path d="M6 12h20M12 18h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "task") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <rect height="18" rx="3" stroke="currentColor" strokeWidth="1.8" width="16" x="8" y="7" />
        <path d="m12 15 2.5 2.5L20 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M12 20h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "apps") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <rect height="8" rx="2" stroke="currentColor" strokeWidth="1.8" width="8" x="6" y="6" />
        <rect height="8" rx="2" stroke="currentColor" strokeWidth="1.8" width="8" x="18" y="6" />
        <rect height="8" rx="2" stroke="currentColor" strokeWidth="1.8" width="8" x="6" y="18" />
        <rect height="8" rx="2" stroke="currentColor" strokeWidth="1.8" width="8" x="18" y="18" />
      </svg>
    );
  }

  if (icon === "list") {
    return (
      <svg className={shared} fill="none" viewBox="0 0 32 32">
        <rect height="18" rx="3" stroke="currentColor" strokeWidth="1.8" width="18" x="7" y="7" />
        <path d="M12 12h8M12 16h8M12 20h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="10" cy="12" fill="currentColor" r="1.2" />
        <circle cx="10" cy="16" fill="currentColor" r="1.2" />
        <circle cx="10" cy="20" fill="currentColor" r="1.2" />
      </svg>
    );
  }

  return (
    <svg className={shared} fill="none" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 6v4M16 22v4M6 16h4M22 16h4M9.5 9.5l2.8 2.8M19.7 19.7l2.8 2.8M22.5 9.5l-2.8 2.8M12.3 19.7l-2.8 2.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
      {message}
    </div>
  );
}

function SeriesLegend({
  items
}: {
  items: { label: string; colorClass: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
      {items.map((item) => (
        <span className="inline-flex items-center gap-2" key={item.label}>
          <span className={`h-2.5 w-2.5 rounded-full ${item.colorClass}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function HorizontalBars({
  points,
  tone = "bg-sky-400",
  suffix = "",
  formatValue = money
}: {
  points: ChartPointRecord[];
  tone?: string;
  suffix?: string;
  formatValue?: (value: string) => string;
}) {
  if (points.length === 0) {
    return <EmptyState message="No data has been recorded for this card yet." />;
  }

  const max = Math.max(...points.map((point) => Math.abs(Number(point.value))), 1);

  return (
    <div className="space-y-3">
      {points.map((point) => {
        const width = `${Math.max((Math.abs(Number(point.value)) / max) * 100, 6)}%`;

        return (
          <div className="space-y-2" key={point.label}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-slate-700">{point.label}</span>
              <span className="text-slate-500">
                {formatValue(point.value)}
                {suffix}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${tone}`} style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfitLossTrend({ points }: { points: ProfitLossSeriesRecord[] }) {
  if (points.length === 0) {
    return <EmptyState message="Profit and loss trends will appear after posting activity." />;
  }

  const seriesConfig = [
    { key: "revenue", label: "Revenue", colorClass: "bg-emerald-400" },
    { key: "expenses", label: "Expenses", colorClass: "bg-rose-400" },
    { key: "grossProfit", label: "Gross Profit", colorClass: "bg-amber-400" },
    { key: "netProfit", label: "Net Profit", colorClass: "bg-sky-500" }
  ] as const;
  const max = Math.max(
    ...points.flatMap((point) =>
      seriesConfig.map((series) => Math.abs(Number(point[series.key])))
    ),
    1
  );

  return (
    <div className="space-y-4">
      <SeriesLegend items={seriesConfig.map(({ label, colorClass }) => ({ label, colorClass }))} />
      <div className="space-y-4">
        {points.map((point) => (
          <div className="grid gap-3 md:grid-cols-[72px_1fr]" key={point.label}>
            <p className="pt-1 text-sm font-medium text-slate-700">{point.label}</p>
            <div className="grid gap-3">
              {seriesConfig.map((series) => {
                const rawValue = Number(point[series.key]);
                const width = `${Math.max((Math.abs(rawValue) / max) * 100, 5)}%`;

                return (
                  <div className="space-y-1" key={series.key}>
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{series.label}</span>
                      <span>{money(rawValue)}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${series.colorClass}`} style={{ width }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CashFlowRows({
  points
}: {
  points: AccountingDashboardRecord["cashFlow"];
}) {
  if (points.length === 0) {
    return <EmptyState message="Add bank accounts and payments to populate cash movement." />;
  }

  return (
    <div className="space-y-3">
      {points.map((point) => (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={point.label}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-slate-800">{point.label}</p>
            <p className="text-sm text-slate-500">Remaining {money(point.cashRemaining)}</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <MetricPill label="Cash In" tone="emerald" value={money(point.cashIn)} />
            <MetricPill label="Cash Out" tone="rose" value={money(point.cashOut)} />
            <MetricPill label="Cash Remaining" tone="amber" value={money(point.cashRemaining)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SalesPurchaseRows({
  points
}: {
  points: AccountingDashboardRecord["salesPurchases"];
}) {
  if (points.length === 0) {
    return <EmptyState message="Receivable and payable balances will appear here." />;
  }

  const max = Math.max(...points.flatMap((point) => [Number(point.total), Number(point.due)]), 1);

  return (
    <div className="space-y-4">
      {points.map((point) => (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4" key={point.label}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-slate-800">{point.label}</p>
            <div className="text-sm text-slate-500">
              <span>Total {money(point.total)}</span>
              <span className="mx-2">•</span>
              <span>Due {money(point.due)}</span>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "Total", value: Number(point.total), tone: "bg-cyan-400" },
              { label: "Due", value: Number(point.due), tone: "bg-rose-400" }
            ].map((entry) => (
              <div className="space-y-1" key={entry.label}>
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{entry.label}</span>
                  <span>{money(entry.value)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${entry.tone}`}
                    style={{
                      width: `${Math.max((Math.abs(entry.value) / max) * 100, 5)}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone = "slate"
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "rose" | "amber";
}) {
  return (
    <div
      className={[
        "rounded-xl px-4 py-3",
        tone === "slate" && "bg-slate-100",
        tone === "emerald" && "bg-emerald-50",
        tone === "rose" && "bg-rose-50",
        tone === "amber" && "bg-amber-50"
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function DashboardCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function QuietPanelCard({
  title,
  description,
  message
}: {
  title: string;
  description: string;
  message: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-16 text-center">
          <p className="text-sm text-slate-500">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export async function renderHomePage(orgSlug: string) {
  const capabilities = await getCapabilities();
  const modules = HOME_MODULES.filter((module) =>
    hasPermission(capabilities, module.permission)
  );

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-gradient-to-b from-white via-white to-slate-50">
        <CardContent className="px-6 py-14 sm:px-10">
          <div className="mx-auto max-w-4xl space-y-8 text-center">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-600">
                Workspace Home
              </p>
              <h2 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                What services do you need?
              </h2>
              <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                Open the accounting, compliance, subscription, and administration
                modules from one launcher.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-4">
              {modules.map((module) => (
                <a
                  className="group flex w-[172px] flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                  href={module.href(orgSlug)}
                  key={module.key}
                >
                  <div className="rounded-2xl bg-emerald-50 p-4 transition group-hover:bg-emerald-100">
                    <ServiceIcon icon={module.icon} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{module.label}</p>
                    <p className="text-xs text-slate-500">Open module</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export async function renderAccountingOverviewPage(orgSlug: string) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="px-6 py-10 sm:px-10">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Accounting Overview
            </p>
            <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
              Open an accounting workflow
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Use this overview to jump directly into the core accounting areas for
              day-to-day work.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ACCOUNTING_OVERVIEW_MODULES.map(([key, label, description]) => (
          <a
            className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
            href={`/${orgSlug}/accounting/${key}`}
            key={key}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50">
              <ServiceIcon icon="accounting" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{label}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

export async function renderAccountingDashboardPage() {
  const dashboard = await fetchServerJson<AccountingDashboardRecord>("/v1/accounting/dashboard");

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white">
        <CardContent className="px-6 py-10 text-center sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
            Accounting Dashboard
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight">
            Accounting performance at a glance
          </h2>
          <p className="mt-3 text-lg text-slate-300">
            {presentOrganizationName(dashboard.organizationName)}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <DashboardCard
          subtitle="Closing balances using opening balances plus posted cash movement."
          title="Bank Balance"
        >
          <HorizontalBars points={dashboard.bankBalances} tone="bg-sky-400" />
        </DashboardCard>

        <DashboardCard
          subtitle="Six-month revenue, expense, gross-profit, and net-profit trend."
          title="Profit and Loss"
        >
          <ProfitLossTrend points={dashboard.profitLossSeries} />
        </DashboardCard>

        <DashboardCard
          subtitle="Assets, equity, and liabilities derived from the live ledger summary."
          title="Balance Sheet"
        >
          <HorizontalBars points={dashboard.balanceSheet} tone="bg-cyan-400" />
        </DashboardCard>

        <DashboardCard
          subtitle="Top posted expense categories including depreciation."
          title="Expenses"
        >
          <HorizontalBars points={dashboard.expenseBreakdown} tone="bg-amber-400" />
        </DashboardCard>

        <DashboardCard
          subtitle="Cash movement reflects posted invoice and bill payments grouped by recorded bank account."
          title="Cash Flow"
        >
          <CashFlowRows points={dashboard.cashFlow} />
        </DashboardCard>

        <DashboardCard
          subtitle="Receivable and payable totals with due balances."
          title="Sales and Purchases"
        >
          <SalesPurchaseRows points={dashboard.salesPurchases} />
        </DashboardCard>
      </div>
    </div>
  );
}

export async function renderOrganisationStatsPage(
  orgSlug: string,
  searchParams: Record<string, string | string[] | undefined>
) {
  const year = getFirstQueryValue(searchParams.year);
  const month = getFirstQueryValue(searchParams.month);
  const stats = await fetchServerJson<OrganizationStatsRecord>(
    buildOrganisationStatsEndpoint({ year, month })
  );
  const filtersAction = `/${orgSlug}/accounting/organisation-stats`;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6 px-6 py-8 sm:px-10">
          <div className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Organisation Stats
            </p>
            <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
              Organisation activity overview
            </h2>
            <p className="text-lg text-slate-600">
              {presentOrganizationName(stats.organizationName)}
            </p>
          </div>

          <form
            action={filtersAction}
            className="grid gap-3 xl:grid-cols-[1.7fr_0.9fr_0.9fr_auto]"
            method="get"
          >
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Current organisation
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {presentOrganizationName(stats.organizationName)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Use the header switcher to change tenant context.
              </p>
            </div>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Year</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                defaultValue={String(stats.selectedYear)}
                name="year"
              >
                {stats.availableYears.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Month</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                defaultValue={String(stats.selectedMonth)}
                name="month"
              >
                {MONTH_NAMES.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <Button className="w-full xl:w-auto" type="submit">
                Apply
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard
          subtitle="Role distribution for the current organisation membership."
          title="Organisation Users"
        >
          <div className="space-y-5">
            <HorizontalBars
              formatValue={(value) => value}
              points={stats.usersByRole}
              tone="bg-sky-400"
              suffix=" users"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricPill label="Total Users" value={String(stats.totalUsers)} />
              <MetricPill label="Active Users" tone="emerald" value={String(stats.activeUsers)} />
              <MetricPill label="Invited Users" tone="amber" value={String(stats.invitedUsers)} />
            </div>
          </div>
        </DashboardCard>

        <QuietPanelCard
          description="Time-off activity connected through HR & Payroll appears here when available."
          message="No time-off activity has been recorded for the selected period."
          title="Organisation Time-off"
        />

        <QuietPanelCard
          description="Payroll run totals and posting status appear here when available."
          message="No pay-run activity has been recorded for the selected period."
          title="Organisation Pay-run"
        />

        <DashboardCard
          subtitle={`${MONTH_NAMES[stats.selectedMonth - 1]} ${stats.selectedYear} membership activity.`}
          title="Organisation Employee"
        >
          <div className="space-y-5">
            <HorizontalBars
              formatValue={(value) => value}
              points={stats.membershipStatus}
              tone="bg-emerald-400"
              suffix=" users"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricPill
                label="Joined This Period"
                tone="slate"
                value={String(stats.joinedThisPeriod)}
              />
              <MetricPill
                label="Active This Period"
                tone="emerald"
                value={String(stats.activeUsersThisPeriod)}
              />
              <MetricPill
                label="Disabled Users"
                tone="rose"
                value={String(stats.disabledUsers)}
              />
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
