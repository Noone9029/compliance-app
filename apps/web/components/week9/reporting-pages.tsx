import React from "react";
import { notFound } from "next/navigation";
import type {
  ChartPointRecord,
  ChartsDashboardRecord,
  ComplianceOverviewRecord,
  ContactTransactionRecord,
  OutstandingDocumentRecord,
  ReportedDocumentRecord,
  ReportsDashboardRecord,
  SalesTaxLineRecord,
  TrialBalanceLineRecord
} from "@daftar/types";
import { Card, CardContent, CardHeader } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { presentContactName } from "../presentation";
import { getCapabilities, hasPermission } from "../week2/route-utils";
import { formatDate, money } from "../week3/shared";
import {
  AccessCard,
  ActionLinkCard,
  BarChart,
  DataTable,
  DateFilterCard,
  DonutBreakdown,
  DownloadAction,
  DualSeriesChart,
  getPageQuery,
  LaunchCardGrid,
  MetricGrid,
  type NavSection,
  PageIntro,
  SearchFilterCard,
  SecondaryRouteLayout,
  StatementSections,
  type TenantSearchParams,
  resolveRouteKey,
  withDateQuery,
  withPageQuery
} from "./reporting-ui";

type ReportRouteKey =
  | "overview"
  | "balance_sheet"
  | "profit_and_loss"
  | "trial_balance"
  | "bank_summary"
  | "budget_summary"
  | "executive_summary"
  | "sales_tax"
  | "zatca_tax"
  | "reported_documents"
  | "contact_transactions"
  | "payable_receivable_detail";

type ChartRouteKey =
  | "overview"
  | "bankbalance"
  | "balance_chart"
  | "profit_loss"
  | "expenses"
  | "sales_purchases"
  | "receivable_payable";

const reportNavSections: NavSection<ReportRouteKey>[] = [
  {
    title: "Overview",
    items: [
      {
        key: "overview",
        label: "Financial Overview",
        path: "",
        description: "Entry point for the finance, tax, and document reporting surfaces."
      }
    ]
  },
  {
    title: "Financial Overview",
    items: [
      {
        key: "balance_sheet",
        label: "Balance Sheet",
        path: "balance_sheet",
        description: "Assets, liabilities, and equity from the derived ledger."
      },
      {
        key: "profit_and_loss",
        label: "Profit and Loss",
        path: "profit_and_loss",
        description: "Revenue and expense lines from posted sales, bills, journals, and depreciation.",
        aliases: ["profit_loss"]
      },
      {
        key: "trial_balance",
        label: "Trial Balance",
        path: "trial_balance",
        description: "Account-level debit and credit totals for the current ledger view."
      }
    ]
  },
  {
    title: "Summary Reports",
    items: [
      {
        key: "bank_summary",
        label: "Bank Summary",
        path: "bank_summary",
        description: "Opening, movement, and closing balances across active bank accounts."
      },
      {
        key: "budget_summary",
        label: "Budget Summary",
        path: "budget_summary",
        description: "Projected run-rate from active repeating invoice and bill schedules."
      },
      {
        key: "executive_summary",
        label: "Executive Summary",
        path: "executive_summary",
        description: "Headline sales, purchases, receivables, payables, and profit metrics."
      }
    ]
  },
  {
    title: "Tax Reports",
    items: [
      {
        key: "sales_tax",
        label: "Sales Tax Report",
        path: "sales_tax",
        description: "Invoice-level taxable sales and collected tax for the selected period.",
        aliases: ["sales_tax_report"]
      },
      {
        key: "zatca_tax",
        label: "ZATCA Tax Report",
        path: "zatca_tax",
        description: "Reported document progress and submission posture for the selected period."
      },
      {
        key: "reported_documents",
        label: "Reported Documents",
        path: "reported_documents",
        description: "Compliance submissions with status, response code, and message detail."
      }
    ]
  },
  {
    title: "Transactions",
    items: [
      {
        key: "contact_transactions",
        label: "Contact Transactions",
        path: "contact_transactions",
        description: "Receivable and payable balances by contact."
      },
      {
        key: "payable_receivable_detail",
        label: "Payable & Receivable Detail",
        path: "payable_receivable/detail",
        description: "Outstanding receivable and payable documents.",
        aliases: ["payable_receivable", "payables_receivables", "payables_receivables/detail"]
      }
    ]
  }
];

const chartNavSections: NavSection<ChartRouteKey>[] = [
  {
    title: "Overview",
    items: [
      {
        key: "overview",
        label: "Charts Overview",
        path: "",
        description: "Launcher for the bank, balance, profit, expense, and receivable charts."
      }
    ]
  },
  {
    title: "Charts",
    items: [
      {
        key: "bankbalance",
        label: "Bank Balance",
        path: "bankbalance",
        description: "Closing balances by bank account using recorded opening balances and posted cash movement.",
        aliases: ["bank_balance"]
      },
      {
        key: "balance_chart",
        label: "Balance Chart",
        path: "balance_chart",
        description: "Assets, liabilities, and equity comparison."
      },
      {
        key: "profit_loss",
        label: "Profit And Loss",
        path: "profit_loss",
        description: "Revenue, expenses, and profit comparison.",
        aliases: ["profit_and_loss"]
      },
      {
        key: "expenses",
        label: "Expenses",
        path: "expenses",
        description: "Expense mix across posted bills, journals, and depreciation."
      },
      {
        key: "sales_purchases",
        label: "Sales and Purchases",
        path: "sales_purchases",
        description: "Monthly sales and purchases trend.",
        aliases: ["sales_and_purchases"]
      },
      {
        key: "receivable_payable",
        label: "Receivables vs Payables",
        path: "receivable_payable",
        description: "Outstanding receivables against payables.",
        aliases: ["receivables_payables", "receivable_payables"]
      }
    ]
  }
];

export async function renderReportsSurface(
  orgSlug: string,
  segments: string[],
  searchParams: TenantSearchParams
) {
  const capabilities = await getCapabilities();

  if (!hasPermission(capabilities, "shell.reports.read")) {
    return (
      <AccessCard
        message="Your current role does not currently include reports access."
        title="Reports"
      />
    );
  }

  const routeKey = resolveRouteKey(segments.slice(1).join("/"), reportNavSections);

  if (!routeKey) {
    notFound();
  }

  const query = getPageQuery(searchParams);

  return (
    <SecondaryRouteLayout
      activeKey={routeKey}
      orgSlug={orgSlug}
      prefix="reports"
      sections={reportNavSections}
      title="Reports"
    >
      {await renderReportContent(orgSlug, routeKey, query)}
    </SecondaryRouteLayout>
  );
}

export async function renderChartsSurface(
  orgSlug: string,
  segments: string[],
  searchParams: TenantSearchParams
) {
  const capabilities = await getCapabilities();

  if (!hasPermission(capabilities, "shell.charts.read")) {
    return (
      <AccessCard
        message="Your current role does not currently include charts access."
        title="Charts"
      />
    );
  }

  const routeKey = resolveRouteKey(segments.slice(1).join("/"), chartNavSections);

  if (!routeKey) {
    notFound();
  }

  const query = getPageQuery(searchParams);

  return (
    <SecondaryRouteLayout
      activeKey={routeKey}
      orgSlug={orgSlug}
      prefix="charts"
      sections={chartNavSections}
      title="Charts"
    >
      {await renderChartContent(orgSlug, routeKey, query)}
    </SecondaryRouteLayout>
  );
}

async function renderReportContent(
  orgSlug: string,
  routeKey: ReportRouteKey,
  query: ReturnType<typeof getPageQuery>
) {
  if (routeKey === "overview") {
    const reports = await fetchReportsDashboard(query);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Reporting surfaces built from posted accounting, tax, and compliance data."
          title="Financial Overview"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <MetricGrid
          items={[
            { label: "Total Sales", value: money(reports.executiveSummary.totalSales) },
            { label: "Total Purchases", value: money(reports.executiveSummary.totalPurchases) },
            { label: "Profit", value: money(reports.profitLoss.profit) },
            {
              label: "Reported Documents",
              value: String(reports.executiveSummary.reportedDocumentsCount)
            }
          ]}
        />
        <LaunchCardGrid
          orgSlug={orgSlug}
          prefix="reports"
          sections={reportNavSections.filter((section) => section.title !== "Overview")}
        />
      </div>
    );
  }

  if (routeKey === "bank_summary") {
    const reports = await fetchReportsDashboard(query);
    const rows = reports.bankSummary.accounts.filter((account) =>
      query.search.length === 0
        ? true
        : account.accountName.toLowerCase().includes(query.search.toLowerCase())
    );
    const exportRows = rows.map((row) => [
      row.accountName,
      row.currencyCode,
      money(row.openingBalance, row.currencyCode),
      money(row.cashReceived, row.currencyCode),
      money(row.cashSpent, row.currencyCode),
      money(row.closingBalance, row.currencyCode)
    ]);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Opening balances come from bank setup and movements come from posted invoice and bill payments in the selected period."
          title="Bank Summary"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <MetricGrid
          items={[
            {
              label: "Opening Balance",
              value: money(reports.bankSummary.totalOpeningBalance)
            },
            {
              label: "Cash In",
              value: money(reports.bankSummary.totalInflow)
            },
            {
              label: "Cash Out",
              value: money(reports.bankSummary.totalOutflow)
            },
            {
              label: "Closing Balance",
              value: money(reports.bankSummary.totalClosingBalance)
            }
          ]}
        />
        <Card>
          <CardContent className="space-y-4 py-6">
            <SearchFilterCard query={query} />
            {(Number(reports.bankSummary.unassignedIncoming) > 0 ||
              Number(reports.bankSummary.unassignedOutgoing) > 0) && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Unassigned Incoming
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {money(reports.bankSummary.unassignedIncoming)}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Unassigned Outgoing
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {money(reports.bankSummary.unassignedOutgoing)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Bank Accounts</h2>
                <p className="text-sm text-slate-500">
                  Closing balances reflect each account&apos;s opening balance plus posted cash movement.
                </p>
              </div>
              <DownloadAction
                columns={[
                  "Bank Account",
                  "Currency",
                  "Opening Balance",
                  "Cash Received",
                  "Cash Spent",
                  "Closing Balance"
                ]}
                filename="bank-summary.csv"
                label="Export"
                rows={exportRows}
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                "Bank Account",
                "Currency",
                "Opening Balance",
                "Cash Received",
                "Cash Spent",
                "Closing Balance"
              ]}
              rows={exportRows}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "budget_summary") {
    const reports = await fetchReportsDashboard(query);
    const year = query.year ?? new Date().getUTCFullYear();
    const monthlyBudget = buildMonthlyBudgetRows(reports, year);
    const budgetColumns = ["Metric", ...monthLabels(year)];

    return (
      <div className="space-y-6">
        <PageIntro
          description="Projected monthly baseline from active repeating invoice and bill schedules."
          title="Budget Summary"
        />
        <DateFilterCard actionLabel="Update" includeYear query={query} />
        <MetricGrid
          items={[
            {
              label: "Projected Revenue",
              value: money(reports.budgetSummary.projectedMonthlyRevenue)
            },
            {
              label: "Projected Expenses",
              value: money(reports.budgetSummary.projectedMonthlyExpenses)
            },
            { label: "Projected Net", value: money(reports.budgetSummary.projectedMonthlyNet) },
            {
              label: "Active Schedules",
              value: `${reports.budgetSummary.activeRepeatingInvoices} invoices • ${reports.budgetSummary.activeRepeatingBills} bills`
            }
          ]}
        />
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Overall Budget</h2>
                <p className="text-sm text-slate-500">
                  Each month reflects the current repeating-document run-rate for the selected year.
                </p>
              </div>
              <DownloadAction
                columns={budgetColumns}
                filename={`budget-summary-${year}.csv`}
                label="Export"
                rows={monthlyBudget}
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable columns={budgetColumns} rows={monthlyBudget} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "executive_summary") {
    const reports = await fetchReportsDashboard(query);
    const points: ChartPointRecord[] = [
      { label: "Sales", value: reports.executiveSummary.totalSales },
      { label: "Purchases", value: reports.executiveSummary.totalPurchases },
      { label: "Profit", value: reports.profitLoss.profit }
    ];

    return (
      <div className="space-y-6">
        <PageIntro
          description="Headline financial metrics for the selected reporting window."
          title="Executive Summary"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <MetricGrid
          items={[
            { label: "Sales", value: money(reports.executiveSummary.totalSales) },
            { label: "Purchases", value: money(reports.executiveSummary.totalPurchases) },
            { label: "Receivables", value: money(reports.executiveSummary.receivables) },
            { label: "Payables", value: money(reports.executiveSummary.payables) },
            {
              label: "Reported Docs",
              value: String(reports.executiveSummary.reportedDocumentsCount)
            },
            {
              label: "Draft Quotes",
              value: String(reports.executiveSummary.draftQuotesCount)
            }
          ]}
        />
        <Card>
          <CardHeader>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Executive Snapshot</h2>
              <p className="text-sm text-slate-500">
                A compact comparison of sales, purchases, and profit.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <BarChart points={points} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "balance_sheet") {
    const reports = await fetchReportsDashboard(query);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Assets, liabilities, and equity derived from the live ledger, bank balances, receivables, payables, and fixed assets."
          title="Balance Sheet"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <MetricGrid
          items={[
            { label: "Assets", value: money(reports.balanceSheet.assets) },
            { label: "Liabilities", value: money(reports.balanceSheet.liabilities) },
            { label: "Equity", value: money(reports.balanceSheet.equity) }
          ]}
        />
        <StatementSections sections={buildBalanceSheetSections(reports)} />
      </div>
    );
  }

  if (routeKey === "profit_and_loss") {
    const reports = await fetchReportsDashboard(query);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Revenue and expense lines derived from the live ledger, including journals and depreciation."
          title="Profit and Loss"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <MetricGrid
          items={[
            { label: "Revenue", value: money(reports.profitLoss.revenue) },
            { label: "Expenses", value: money(reports.profitLoss.expenses) },
            { label: "Profit", value: money(reports.profitLoss.profit) }
          ]}
        />
        <StatementSections sections={buildProfitLossSections(reports)} />
      </div>
    );
  }

  if (routeKey === "trial_balance") {
    const reports = await fetchReportsDashboard(query);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Account-level debit and credit totals for the current ledger."
          title="Trial Balance"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <MetricGrid
          items={[
            { label: "Total Debit", value: money(reports.trialBalance.totalDebit) },
            { label: "Total Credit", value: money(reports.trialBalance.totalCredit) },
            { label: "Accounts", value: String(reports.trialBalance.lines.length) }
          ]}
        />
        <Card>
          <CardContent>
            <DataTable
              columns={["Code", "Account", "Type", "Debit", "Credit"]}
              rows={reports.trialBalance.lines.map((line) => [
                line.accountCode,
                line.accountName,
                presentAccountType(line.accountType),
                money(line.debit),
                money(line.credit)
              ])}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "sales_tax") {
    const reports = await fetchReportsDashboard(query);
    const useTaxComponent =
      query.showByTaxComponent ||
      (!query.showByTaxRate && !query.showByTaxComponent && !query.showByAccountType);
    const filteredLines = filterSalesTaxLines(reports.salesTax.lines, query.search);
    const salesTaxView = buildSalesTaxRows(filteredLines, {
      showByTaxRate: query.showByTaxRate,
      showByTaxComponent: useTaxComponent,
      showByAccountType: query.showByAccountType
    });

    return (
      <div className="space-y-6">
        <PageIntro
          description="Invoice-level taxable sales and collected tax for the selected period."
          title="Sales Tax Report"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <MetricGrid
          items={[
            { label: "Taxable Sales", value: money(reports.salesTax.taxableSales) },
            { label: "Tax Collected", value: money(reports.salesTax.taxCollected) },
            { label: "Invoices", value: String(reports.salesTax.invoiceCount) }
          ]}
        />
        <Card>
          <CardContent className="space-y-4 py-6">
            <SearchFilterCard query={query} />
            <div className="flex flex-wrap gap-2">
              <ReportFilterLink
                href={buildReportHref(orgSlug, "sales_tax", query, {
                  showByTaxRate: "false",
                  showByTaxComponent: "true",
                  showByAccountType: "false"
                })}
                isActive={useTaxComponent && !query.showByTaxRate && !query.showByAccountType}
                label="Tax Component"
              />
              <ReportFilterLink
                href={buildReportHref(orgSlug, "sales_tax", query, {
                  showByTaxRate: "true",
                  showByTaxComponent: "false",
                  showByAccountType: "false"
                })}
                isActive={query.showByTaxRate}
                label="Tax Rate"
              />
              <ReportFilterLink
                href={buildReportHref(orgSlug, "sales_tax", query, {
                  showByTaxRate: "false",
                  showByTaxComponent: "false",
                  showByAccountType: "true"
                })}
                isActive={query.showByAccountType}
                label="Account Type"
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Tax Detail</h2>
                <p className="text-sm text-slate-500">
                  Exported rows reflect the same filtered tax lines shown below.
                </p>
              </div>
              <DownloadAction
                columns={salesTaxView.columns}
                filename="sales-tax-report.csv"
                label="Export"
                rows={salesTaxView.rows}
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable columns={salesTaxView.columns} rows={salesTaxView.rows} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "zatca_tax") {
    const [reports, overview] = await Promise.all([
      fetchReportsDashboard(query),
      fetchServerJson<ComplianceOverviewRecord>("/v1/compliance/overview")
    ]);
    const rows = filterReportedDocuments(overview.recentReportedDocuments, query.search);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Compliance reporting posture for the selected period and the most recent reported documents."
          title="ZATCA Tax Report"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <MetricGrid
          items={[
            { label: "Ready to Submit", value: String(overview.totalInvoicesReady) },
            { label: "Reported", value: String(overview.totalReportedDocuments) },
            { label: "Queued", value: String(overview.queuedSubmissions) },
            { label: "Failed", value: String(overview.failedSubmissions) }
          ]}
        />
        <ActionLinkCard
          href={`/${orgSlug}/reports/reported_documents${withPageQuery(query)}`}
          label="Open Report"
          subtitle="Review the full reported-document register for the selected period."
          title="Reported Documents"
        />
        <Card>
          <CardHeader>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Recent Submissions</h2>
              <p className="text-sm text-slate-500">
                Submission results surfaced directly from the compliance reporting history.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={["Document", "Status", "Submitted", "Response Code", "Message"]}
              rows={rows.map((document) => [
                document.documentNumber,
                document.status,
                formatDate(document.submittedAt),
                document.responseCode ?? "None",
                document.responseMessage ?? "None"
              ])}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Period Totals</h2>
              <p className="text-sm text-slate-500">
                The selected reporting period contributes to the tax and executive totals shown across reports.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <MetricGrid
              items={[
                { label: "Sales Tax", value: money(reports.salesTax.taxCollected) },
                { label: "Reported Docs", value: String(reports.reportedDocuments.length) },
                { label: "Receivables", value: money(reports.payablesReceivables.totalReceivables) },
                { label: "Payables", value: money(reports.payablesReceivables.totalPayables) }
              ]}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "reported_documents") {
    const reports = await fetchReportsDashboard(query);
    const rows = filterReportedDocuments(reports.reportedDocuments, query.search);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Compliance submission history for the selected period."
          title="Reported Documents"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <Card>
          <CardContent className="py-6">
            <SearchFilterCard query={query} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Submission Register</h2>
                <p className="text-sm text-slate-500">
                  Status, response code, and message values come from the stored compliance submission history.
                </p>
              </div>
              <DownloadAction
                columns={["Document", "Status", "Submitted", "Response Code", "Message"]}
                filename="reported-documents.csv"
                label="Export"
                rows={rows.map((document) => [
                  document.documentNumber,
                  document.status,
                  formatDate(document.submittedAt),
                  document.responseCode ?? "None",
                  document.responseMessage ?? "None"
                ])}
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={["Document", "Status", "Submitted", "Response Code", "Message"]}
              rows={rows.map((document) => [
                document.documentNumber,
                document.status,
                formatDate(document.submittedAt),
                document.responseCode ?? "None",
                document.responseMessage ?? "None"
              ])}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "contact_transactions") {
    const reports = await fetchReportsDashboard(query);
    const rows = filterContactTransactions(
      reports.contactTransactions,
      query.contactId,
      query.search
    );

    return (
      <div className="space-y-6">
        <PageIntro
          description="Receivable and payable balances grouped by contact."
          title="Contact Transactions"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <Card>
          <CardContent className="space-y-4 py-6">
            <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" method="GET">
              <input name="from" type="hidden" value={query.from} />
              <input name="to" type="hidden" value={query.to} />
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Search</span>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  defaultValue={query.search}
                  name="search"
                  type="text"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Contact ID</span>
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  defaultValue={query.contactId}
                  name="contactId"
                  type="text"
                />
              </label>
              <div className="flex items-end">
                <button
                  className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                  type="submit"
                >
                  Update
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Contact Balances</h2>
                <p className="text-sm text-slate-500">
                  Receivable and payable balances reflect open sales invoices and purchase bills in the selected period.
                </p>
              </div>
              <DownloadAction
                columns={["Contact", "Sales Documents", "Bills", "Receivable Balance", "Payable Balance"]}
                filename="contact-transactions.csv"
                label="Export"
                rows={rows.map((contact) => [
                  presentContactName(contact.contactName),
                  String(contact.salesCount),
                  String(contact.billCount),
                  money(contact.receivableBalance),
                  money(contact.payableBalance)
                ])}
              />
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={["Contact", "Sales Documents", "Bills", "Receivable Balance", "Payable Balance"]}
              rows={rows.map((contact) => [
                presentContactName(contact.contactName),
                String(contact.salesCount),
                String(contact.billCount),
                money(contact.receivableBalance),
                money(contact.payableBalance)
              ])}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const reports = await fetchReportsDashboard(query);
  const rows = filterOutstandingDocuments(reports.payablesReceivables.documents, query);

  return (
    <div className="space-y-6">
      <PageIntro
        description="Outstanding receivable and payable documents for the selected period."
        title="Payable & Receivable Detail"
      />
      <DateFilterCard actionLabel="Update" query={query} />
      <MetricGrid
        items={[
          { label: "Receivables", value: money(reports.payablesReceivables.totalReceivables) },
          { label: "Payables", value: money(reports.payablesReceivables.totalPayables) },
          { label: "Overdue Receivables", value: money(reports.payablesReceivables.overdueReceivables) },
          { label: "Unpaid Bills", value: money(reports.payablesReceivables.unpaidBills) }
        ]}
      />
      <Card>
        <CardContent className="space-y-4 py-6">
          <form className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_auto]" method="GET">
            <input name="from" type="hidden" value={query.from} />
            <input name="to" type="hidden" value={query.to} />
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Document Type</span>
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                defaultValue={query.reportType}
                name="reportType"
              >
                <option value="all">All</option>
                <option value="receivables">Receivables</option>
                <option value="payables">Payables</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Search</span>
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                defaultValue={query.search}
                name="search"
                type="text"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">Statuses</span>
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                defaultValue={query.statuses.join(", ")}
                name="status"
                placeholder="e.g. ISSUED, APPROVED"
                type="text"
              />
            </label>
            <div className="flex items-end">
              <button
                className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                type="submit"
              >
                Update
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Outstanding Documents</h2>
              <p className="text-sm text-slate-500">
                Amount due reflects the current open balance on each posted document.
              </p>
            </div>
            <DownloadAction
              columns={["Type", "Document", "Contact", "Issue Date", "Due Date", "Status", "Overdue", "Amount Due"]}
              filename="payable-receivable-detail.csv"
              label="Export"
              rows={buildOutstandingDocumentRows(rows)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={["Type", "Document", "Contact", "Issue Date", "Due Date", "Status", "Overdue", "Amount Due"]}
            rows={buildOutstandingDocumentRows(rows)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

async function renderChartContent(
  orgSlug: string,
  routeKey: ChartRouteKey,
  query: ReturnType<typeof getPageQuery>
) {
  const charts = await fetchServerJson<ChartsDashboardRecord>(
    withDateQuery("/v1/charts/dashboard", query)
  );

  if (routeKey === "overview") {
    return (
      <div className="space-y-6">
        <PageIntro
          description="Charts built from the live accounting dataset."
          title="Charts Overview"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <MetricGrid
          items={[
            { label: "Bank Accounts", value: String(charts.bankBalances.length) },
            { label: "Balance Series", value: String(charts.balanceChart.length) },
            { label: "Expense Buckets", value: String(charts.expenses.length) },
            {
              label: "Monthly Trend Points",
              value: String(charts.salesPurchases.length)
            }
          ]}
        />
        <LaunchCardGrid
          orgSlug={orgSlug}
          prefix="charts"
          sections={chartNavSections.filter((section) => section.title !== "Overview")}
        />
      </div>
    );
  }

  if (routeKey === "bankbalance") {
    const exportRows = charts.bankBalances.map((point) => [point.label, money(point.value)]);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Closing balances by bank account for the selected period."
          title="Bank Balance"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <div className="flex justify-end">
          <DownloadAction
            columns={["Bank Account", "Balance"]}
            filename="bank-balance-chart.csv"
            label="Export"
            rows={exportRows}
          />
        </div>
        <ActionLinkCard
          href={`/${orgSlug}/reports/bank_summary${withPageQuery(query)}`}
          label="Open Report"
          subtitle="Jump to the bank summary report."
          title="Bank Summary"
        />
        <Card>
          <CardContent className="pt-6">
            <BarChart points={charts.bankBalances} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "balance_chart") {
    const exportRows = charts.balanceChart.map((point) => [point.label, money(point.value)]);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Assets, liabilities, and equity comparison for the selected period."
          title="Balance Chart"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <div className="flex justify-end">
          <DownloadAction
            columns={["Category", "Amount"]}
            filename="balance-chart.csv"
            label="Export"
            rows={exportRows}
          />
        </div>
        <ActionLinkCard
          href={`/${orgSlug}/reports/balance_sheet${withPageQuery(query)}`}
          label="Open Report"
          subtitle="Jump to the balance sheet report."
          title="Balance Sheet"
        />
        <Card>
          <CardContent className="pt-6">
            <BarChart points={charts.balanceChart} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "profit_loss") {
    const exportRows = charts.profitLoss.map((point) => [point.label, money(point.value)]);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Revenue, expenses, and profit comparison."
          title="Profit And Loss"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <div className="flex justify-end">
          <DownloadAction
            columns={["Series", "Amount"]}
            filename="profit-loss-chart.csv"
            label="Export"
            rows={exportRows}
          />
        </div>
        <ActionLinkCard
          href={`/${orgSlug}/reports/profit_and_loss${withPageQuery(query)}`}
          label="Open Report"
          subtitle="Jump to the profit and loss report."
          title="Profit and Loss"
        />
        <Card>
          <CardContent className="pt-6">
            <BarChart points={charts.profitLoss} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "expenses") {
    const filteredPoints = charts.expenses.filter((point) => Number(point.value) > 0);
    const exportRows = filteredPoints.map((point) => [point.label, money(point.value)]);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Expense mix across posted bills, journals, and depreciation."
          title="Expenses"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <div className="flex justify-end">
          <DownloadAction
            columns={["Expense Bucket", "Amount"]}
            filename="expense-breakdown-chart.csv"
            label="Export"
            rows={exportRows}
          />
        </div>
        <ActionLinkCard
          href={`/${orgSlug}/reports/profit_and_loss${withPageQuery(query)}`}
          label="Open Report"
          subtitle="Jump to the profit and loss report."
          title="Profit and Loss"
        />
        <Card>
          <CardContent className="pt-6">
            <DonutBreakdown points={filteredPoints} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (routeKey === "sales_purchases") {
    const exportRows = charts.salesPurchases.map((point) => [
      point.label,
      money(point.sales),
      money(point.purchases)
    ]);

    return (
      <div className="space-y-6">
        <PageIntro
          description="Monthly sales and purchase totals built from posted invoice and bill activity."
          title="Sales and Purchases"
        />
        <DateFilterCard actionLabel="Update" query={query} />
        <div className="flex justify-end">
          <DownloadAction
            columns={["Period", "Sales", "Purchases"]}
            filename="sales-purchases-chart.csv"
            label="Export"
            rows={exportRows}
          />
        </div>
        <ActionLinkCard
          href={`/${orgSlug}/reports/executive_summary${withPageQuery(query)}`}
          label="Open Report"
          subtitle="Jump to the executive summary report."
          title="Executive Summary"
        />
        <Card>
          <CardContent className="pt-6">
            <DualSeriesChart
              points={charts.salesPurchases.map((point) => ({
                label: point.label,
                primaryLabel: "Sales",
                primaryValue: point.sales,
                secondaryLabel: "Purchases",
                secondaryValue: point.purchases
              }))}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        description="Receivables and payables comparison for the selected period."
        title="Receivables vs Payables"
      />
      <DateFilterCard actionLabel="Update" query={query} />
      <div className="flex justify-end">
        <DownloadAction
          columns={["Series", "Amount"]}
          filename="receivables-payables-chart.csv"
          label="Export"
          rows={charts.receivablesPayables.map((point) => [point.label, money(point.value)])}
        />
      </div>
      <ActionLinkCard
        href={`/${orgSlug}/reports/payable_receivable/detail${withPageQuery(query)}`}
        label="Open Report"
        subtitle="Jump to the payable and receivable detail report."
        title="Payable & Receivable Detail"
      />
      <Card>
        <CardContent className="pt-6">
          <BarChart points={charts.receivablesPayables} />
        </CardContent>
      </Card>
    </div>
  );
}

async function fetchReportsDashboard(query: ReturnType<typeof getPageQuery>) {
  return fetchServerJson<ReportsDashboardRecord>(withDateQuery("/v1/reports/dashboard", query));
}

function buildMonthlyBudgetRows(reports: ReportsDashboardRecord, year: number) {
  const revenue = reports.budgetSummary.projectedMonthlyRevenue;
  const expenses = reports.budgetSummary.projectedMonthlyExpenses;
  const net = reports.budgetSummary.projectedMonthlyNet;

  return [
    ["Revenue", ...Array.from({ length: 12 }, () => money(revenue))],
    ["Expenses", ...Array.from({ length: 12 }, () => money(expenses))],
    ["Net", ...Array.from({ length: 12 }, () => money(net))],
    [
      `Schedules (${year})`,
      ...Array.from(
        { length: 12 },
        () =>
          `${reports.budgetSummary.activeRepeatingInvoices} / ${reports.budgetSummary.activeRepeatingBills}`
      )
    ]
  ];
}

function monthLabels(year: number) {
  return Array.from({ length: 12 }, (_, month) =>
    new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC"
    })
  );
}

function buildBalanceSheetSections(reports: ReportsDashboardRecord) {
  return [
    {
      title: "Assets",
      total: reports.balanceSheet.assets,
      lines: buildStatementLines(reports.trialBalance.lines, "ASSET", false)
    },
    {
      title: "Liabilities",
      total: reports.balanceSheet.liabilities,
      lines: buildStatementLines(reports.trialBalance.lines, "LIABILITY", true)
    },
    {
      title: "Equity",
      total: reports.balanceSheet.equity,
      lines: buildStatementLines(reports.trialBalance.lines, "EQUITY", true)
    }
  ];
}

function buildProfitLossSections(reports: ReportsDashboardRecord) {
  return [
    {
      title: "Revenue",
      total: reports.profitLoss.revenue,
      lines: buildStatementLines(reports.trialBalance.lines, "REVENUE", true)
    },
    {
      title: "Expenses",
      total: reports.profitLoss.expenses,
      lines: buildStatementLines(reports.trialBalance.lines, "EXPENSE", false)
    },
    {
      title: "Net Profit",
      total: reports.profitLoss.profit,
      lines: [{ label: "Revenue less expenses", value: reports.profitLoss.profit }]
    }
  ];
}

function buildStatementLines(
  lines: TrialBalanceLineRecord[],
  accountType: TrialBalanceLineRecord["accountType"],
  reverseSign: boolean
) {
  return lines
    .filter((line) => line.accountType === accountType)
    .map((line) => ({
      label: `${line.accountCode} • ${line.accountName}`,
      value: reverseSign
        ? (Number(line.credit) - Number(line.debit)).toFixed(2)
        : (Number(line.debit) - Number(line.credit)).toFixed(2)
    }));
}

function filterSalesTaxLines(lines: SalesTaxLineRecord[], search: string) {
  if (search.length === 0) {
    return lines;
  }

  const normalized = search.toLowerCase();
  return lines.filter((line) =>
    [
      line.invoiceNumber,
      presentContactName(line.contactName),
      line.status,
      line.taxRateLabel,
      line.taxComponentLabel,
      line.accountTypeLabel
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized)
  );
}

function buildSalesTaxRows(
  lines: SalesTaxLineRecord[],
  options: {
    showByTaxRate: boolean;
    showByTaxComponent: boolean;
    showByAccountType: boolean;
  }
) {
  const columns = ["Invoice", "Customer", "Issue Date", "Status"];

  if (options.showByTaxRate) {
    columns.push("Tax Rate");
  }

  if (options.showByTaxComponent) {
    columns.push("Tax Component");
  }

  if (options.showByAccountType) {
    columns.push("Account Type");
  }

  columns.push("Taxable Sales", "Tax");

  return {
    columns,
    rows: lines.map((line) => {
      const row = [
        line.invoiceNumber,
        presentContactName(line.contactName),
        formatDate(line.issueDate),
        line.status
      ];

      if (options.showByTaxRate) {
        row.push(line.taxRateLabel);
      }

      if (options.showByTaxComponent) {
        row.push(line.taxComponentLabel);
      }

      if (options.showByAccountType) {
        row.push(line.accountTypeLabel);
      }

      row.push(
        money(line.taxableSales, line.currencyCode),
        money(line.taxCollected, line.currencyCode)
      );

      return row;
    })
  };
}

function filterReportedDocuments(
  documents: ReportedDocumentRecord[],
  search: string
) {
  if (search.length === 0) {
    return documents;
  }

  const normalized = search.toLowerCase();
  return documents.filter((document) =>
    [
      document.documentNumber,
      document.status,
      document.responseCode ?? "",
      document.responseMessage ?? ""
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized)
  );
}

function filterContactTransactions(
  contacts: ContactTransactionRecord[],
  contactId: string,
  search: string
) {
  return contacts.filter((contact) =>
    (contactId.length === 0 ? true : contact.contactId === contactId) &&
    (search.length === 0
      ? true
      : presentContactName(contact.contactName).toLowerCase().includes(search.toLowerCase()))
  );
}

function filterOutstandingDocuments(
  documents: OutstandingDocumentRecord[],
  query: ReturnType<typeof getPageQuery>
) {
  return documents
    .filter((document) =>
      query.reportType === "payables"
        ? document.kind === "PAYABLE"
        : query.reportType === "receivables"
          ? document.kind === "RECEIVABLE"
          : true
    )
    .filter((document) =>
      query.statuses.length === 0 ? true : query.statuses.includes(document.status)
    )
    .filter((document) =>
      query.search.length === 0
        ? true
        : [
            document.documentNumber,
            presentContactName(document.contactName),
            document.status
          ]
            .join(" ")
            .toLowerCase()
            .includes(query.search.toLowerCase())
    )
    .sort((left, right) => left.issueDate.localeCompare(right.issueDate));
}

function buildOutstandingDocumentRows(rows: OutstandingDocumentRecord[]) {
  return rows.map((row) => [
    row.kind === "RECEIVABLE" ? "Receivable" : "Payable",
    row.documentNumber,
    presentContactName(row.contactName),
    formatDate(row.issueDate),
    formatDate(row.dueDate),
    row.status,
    row.isOverdue ? "Yes" : "No",
    money(row.amountDue, row.currencyCode)
  ]);
}

function buildReportHref(
  orgSlug: string,
  route: string,
  query: ReturnType<typeof getPageQuery>,
  overrides: Record<string, string>
) {
  const params = new URLSearchParams();
  params.set("from", query.from);
  params.set("to", query.to);

  if (query.search) {
    params.set("search", query.search);
  }

  if (query.year) {
    params.set("year", String(query.year));
  }

  if (query.contactId) {
    params.set("contactId", query.contactId);
  }

  if (query.reportType && query.reportType !== "all") {
    params.set("reportType", query.reportType);
  }

  if (query.statuses.length > 0) {
    params.set("status", query.statuses.join(","));
  }

  if (query.includePrepayments) {
    params.set("includePrepayments", "true");
  }

  if (query.showByTaxRate) {
    params.set("showByTaxRate", "true");
  }

  if (query.showByTaxComponent) {
    params.set("showByTaxComponent", "true");
  }

  if (query.showByAccountType) {
    params.set("showByAccountType", "true");
  }

  for (const [key, value] of Object.entries(overrides)) {
    params.set(key, value);
  }

  return `/${orgSlug}/reports/${route}?${params.toString()}`;
}

function ReportFilterLink({
  href,
  isActive,
  label
}: {
  href: string;
  isActive: boolean;
  label: string;
}) {
  return (
    <a
      className={
        isActive
          ? "inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          : "inline-flex items-center rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
      }
      href={href}
    >
      {label}
    </a>
  );
}

function presentAccountType(type: TrialBalanceLineRecord["accountType"]) {
  return type.charAt(0) + type.slice(1).toLowerCase();
}
