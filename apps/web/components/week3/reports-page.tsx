import React from "react";
import type { ReportsDashboardRecord } from "@daftar/types";
import { Card, CardContent, CardHeader } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { presentContactName } from "../presentation";
import { formatDate, money } from "./shared";

export async function renderReportsPage() {
  const reports = await fetchServerJson<ReportsDashboardRecord>("/v1/reports/dashboard");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <ReportMetricCard
          label="Total Sales"
          value={money(reports.executiveSummary.totalSales)}
          subtitle="Live sales invoice totals"
        />
        <ReportMetricCard
          label="Total Purchases"
          value={money(reports.executiveSummary.totalPurchases)}
          subtitle="Live purchase bill totals"
        />
        <ReportMetricCard
          label="Profit"
          value={money(reports.profitLoss.profit)}
          subtitle="Revenue minus expenses"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SummaryCard
          rows={[
            ["Receivables", money(reports.payablesReceivables.totalReceivables)],
            ["Payables", money(reports.payablesReceivables.totalPayables)],
            ["Overdue Receivables", money(reports.payablesReceivables.overdueReceivables)],
            ["Unpaid Bills", money(reports.payablesReceivables.unpaidBills)]
          ]}
          subtitle="Live payables and receivables balances from current records."
          title="Payables & Receivables"
        />
        <SummaryCard
          rows={[
            ["Taxable Sales", money(reports.salesTax.taxableSales)],
            ["Tax Collected", money(reports.salesTax.taxCollected)],
            ["Invoice Count", String(reports.salesTax.invoiceCount)],
            [
              "Reported Documents",
              String(reports.executiveSummary.reportedDocumentsCount)
            ]
          ]}
          subtitle="Current tax reporting figures from the live accounting data."
          title="Sales Tax"
        />
        <SummaryCard
          rows={[
            ["Revenue", money(reports.profitLoss.revenue)],
            ["Expenses", money(reports.profitLoss.expenses)],
            ["Profit", money(reports.profitLoss.profit)]
          ]}
          subtitle="Profit and loss using posted revenue and expense activity."
          title="Profit and Loss"
        />
        <SummaryCard
          rows={[
            ["Opening Balance", money(reports.bankSummary.totalOpeningBalance)],
            ["Cash In", money(reports.bankSummary.totalInflow)],
            ["Cash Out", money(reports.bankSummary.totalOutflow)],
            ["Closing Balance", money(reports.bankSummary.totalClosingBalance)],
            ["Account Count", String(reports.bankSummary.accountCount)]
          ]}
          subtitle="Bank overview combining recorded opening balances and assigned payment activity."
          title="Bank Summary"
        />
        <SummaryCard
          rows={[
            ["Projected Revenue", money(reports.budgetSummary.projectedMonthlyRevenue)],
            ["Projected Expenses", money(reports.budgetSummary.projectedMonthlyExpenses)],
            ["Projected Net", money(reports.budgetSummary.projectedMonthlyNet)],
            [
              "Active Repeating Schedules",
              `${reports.budgetSummary.activeRepeatingInvoices} invoices • ${reports.budgetSummary.activeRepeatingBills} bills`
            ]
          ]}
          subtitle="Budget view driven by repeating invoice and bill schedules."
          title="Budget Summary"
        />
        <SummaryCard
          rows={[
            ["Bills Expense", money(reports.expenseBreakdown.billsExpense)],
            ["Journal Expense", money(reports.expenseBreakdown.journalExpense)],
            [
              "Depreciation Expense",
              money(reports.expenseBreakdown.depreciationExpense)
            ],
            ["Total Expenses", money(reports.expenseBreakdown.totalExpenses)]
          ]}
          subtitle="Expense split including fixed-asset depreciation."
          title="Expenses"
        />
        <SummaryCard
          rows={[
            ["Assets", money(reports.balanceSheet.assets)],
            ["Liabilities", money(reports.balanceSheet.liabilities)],
            ["Equity", money(reports.balanceSheet.equity)]
          ]}
          subtitle="Extended balance sheet derived from live balances and asset book values."
          title="Balance Sheet"
        />
      </div>

      <TableCard
        columns={["Period", "Sales", "Purchases", "Quotes"]}
        rows={reports.salesPurchasesSeries.map((point) => [
          point.label,
          money(point.salesTotal),
          money(point.purchasesTotal),
          money(point.quotesTotal)
        ])}
        subtitle="Monthly trend derived directly from invoice, bill, and quote records."
        title="Sales and Purchases"
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <TableCard
          columns={["Contact", "Receivable", "Payable", "Sales Docs", "Bills"]}
          rows={reports.contactTransactions.map((contact) => [
            presentContactName(contact.contactName),
            money(contact.receivableBalance),
            money(contact.payableBalance),
            String(contact.salesCount),
            String(contact.billCount)
          ])}
          subtitle="Contact balances and transaction counts from current records."
          title="Contact Transactions"
        />
        <TableCard
          columns={["Document", "Status", "Response", "Submitted"]}
          rows={reports.reportedDocuments.map((document) => [
            document.documentNumber,
            document.status,
            document.responseCode ?? "No code",
            formatDate(document.submittedAt)
          ])}
          subtitle="Reported document log surfaced directly in reports."
          title="Reported Documents"
        />
      </div>

      <TableCard
        columns={["Account", "Name", "Debit", "Credit"]}
        rows={reports.trialBalance.lines.map((line) => [
          line.accountCode,
          line.accountName,
          money(line.debit),
          money(line.credit)
        ])}
        subtitle={`Trial balance totals: debit ${money(reports.trialBalance.totalDebit)} / credit ${money(reports.trialBalance.totalCredit)}.`}
        title="Trial Balance"
      />
    </div>
  );
}

function ReportMetricCard({
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
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          {label}
        </p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  title,
  subtitle,
  rows
}: {
  title: string;
  subtitle: string;
  rows: [string, string][];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(([label, value]) => (
          <div className="flex items-center justify-between gap-3" key={label}>
            <p className="text-sm text-slate-600">{label}</p>
            <p className="font-medium text-slate-900">{value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TableCard({
  title,
  subtitle,
  columns,
  rows
}: {
  title: string;
  subtitle: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                {columns.map((column) => (
                  <th className="px-3 py-2 font-medium" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`}>
                  {row.map((value, cellIndex) => (
                    <td className="px-3 py-3" key={`${title}-${rowIndex}-${cellIndex}`}>
                      {value}
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
