import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const reportsDashboard = {
  executiveSummary: {
    totalSales: "15000.00",
    totalPurchases: "9200.00",
    receivables: "3100.00",
    payables: "1900.00",
    reportedDocumentsCount: 4,
    draftQuotesCount: 2
  },
  salesTax: {
    taxableSales: "13000.00",
    taxCollected: "1950.00",
    invoiceCount: 3,
    lines: [
      {
        invoiceId: "inv-1",
        invoiceNumber: "INV-001",
        contactId: "contact-1",
        contactName: "Nomad Events LLC",
        issueDate: "2026-04-05T00:00:00.000Z",
        dueDate: "2026-04-20T00:00:00.000Z",
        status: "ISSUED",
        currencyCode: "SAR",
        taxableSales: "1000.00",
        taxCollected: "150.00",
        taxRateLabel: "VAT 15%",
        taxComponentLabel: "Output VAT",
        accountTypeLabel: "Sales"
      }
    ]
  },
  payablesReceivables: {
    totalReceivables: "3100.00",
    totalPayables: "1900.00",
    overdueReceivables: "700.00",
    unpaidBills: "1200.00",
    documents: [
      {
        kind: "RECEIVABLE",
        documentId: "inv-1",
        documentNumber: "INV-001",
        contactId: "contact-1",
        contactName: "Nomad Events LLC",
        issueDate: "2026-04-05T00:00:00.000Z",
        dueDate: "2026-04-20T00:00:00.000Z",
        status: "ISSUED",
        currencyCode: "SAR",
        amountDue: "1150.00",
        isOverdue: false
      }
    ]
  },
  profitLoss: {
    revenue: "15000.00",
    expenses: "9200.00",
    profit: "5800.00"
  },
  bankSummary: {
    totalOpeningBalance: "10000.00",
    totalInflow: "2400.00",
    totalOutflow: "1200.00",
    totalClosingBalance: "11200.00",
    accountCount: 2,
    unassignedIncoming: "0.00",
    unassignedOutgoing: "0.00",
    accounts: [
      {
        bankAccountId: "bank-1",
        accountName: "STC Wallet",
        currencyCode: "SAR",
        isPrimary: true,
        openingBalance: "5000.00",
        cashReceived: "1200.00",
        cashSpent: "0.00",
        closingBalance: "6200.00"
      },
      {
        bankAccountId: "bank-2",
        accountName: "WIO Card",
        currencyCode: "SAR",
        isPrimary: false,
        openingBalance: "5000.00",
        cashReceived: "1200.00",
        cashSpent: "1200.00",
        closingBalance: "5000.00"
      }
    ]
  },
  budgetSummary: {
    projectedMonthlyRevenue: "5000.00",
    projectedMonthlyExpenses: "2800.00",
    projectedMonthlyNet: "2200.00",
    activeRepeatingInvoices: 2,
    activeRepeatingBills: 1
  },
  expenseBreakdown: {
    billsExpense: "8400.00",
    journalExpense: "0.00",
    depreciationExpense: "800.00",
    totalExpenses: "9200.00",
    categories: [
      { label: "Operations", value: "8400.00" },
      { label: "Depreciation", value: "800.00" }
    ]
  },
  balanceSheet: {
    assets: "28000.00",
    liabilities: "6000.00",
    equity: "22000.00"
  },
  trialBalance: {
    totalDebit: "28000.00",
    totalCredit: "28000.00",
    lines: [
      {
        accountCode: "1000",
        accountName: "Cash",
        accountType: "ASSET",
        debit: "11200.00",
        credit: "0.00"
      },
      {
        accountCode: "2000",
        accountName: "Payables",
        accountType: "LIABILITY",
        debit: "0.00",
        credit: "6000.00"
      },
      {
        accountCode: "3000",
        accountName: "Owner Equity",
        accountType: "EQUITY",
        debit: "0.00",
        credit: "22000.00"
      },
      {
        accountCode: "4000",
        accountName: "Consulting Revenue",
        accountType: "REVENUE",
        debit: "0.00",
        credit: "15000.00"
      },
      {
        accountCode: "5000",
        accountName: "Operating Expense",
        accountType: "EXPENSE",
        debit: "9200.00",
        credit: "0.00"
      }
    ]
  },
  salesPurchasesSeries: [
    {
      label: "2026-04",
      salesTotal: "15000.00",
      purchasesTotal: "9200.00",
      quotesTotal: "4000.00"
    }
  ],
  contactTransactions: [
    {
      contactId: "contact-1",
      contactName: "Nomad Events LLC",
      receivableBalance: "3100.00",
      payableBalance: "0.00",
      salesCount: 2,
      billCount: 0
    }
  ],
  reportedDocuments: [
    {
      id: "doc-1",
      organizationId: "org-1",
      salesInvoiceId: "inv-2",
      complianceDocumentId: "cd-1",
      documentNumber: "INV-002",
      status: "REPORTED",
      responseCode: "200",
      responseMessage: "Accepted",
      submittedAt: "2026-04-10T00:00:00.000Z",
      createdAt: "2026-04-10T00:00:00.000Z"
    }
  ]
};

const chartsDashboard = {
  bankBalances: [
    { label: "STC Wallet", value: "6200.00" },
    { label: "WIO Card", value: "5000.00" }
  ],
  balanceChart: [
    { label: "Assets", value: "28000.00" },
    { label: "Liabilities", value: "6000.00" },
    { label: "Equity", value: "22000.00" }
  ],
  profitLoss: [
    { label: "Revenue", value: "15000.00" },
    { label: "Expenses", value: "9200.00" },
    { label: "Profit", value: "5800.00" }
  ],
  expenses: [
    { label: "Operations", value: "8400.00" },
    { label: "Depreciation", value: "800.00" }
  ],
  receivablesPayables: [
    { label: "Receivables", value: "3100.00" },
    { label: "Payables", value: "1900.00" }
  ],
  salesPurchases: [
    { label: "2026-04", sales: "15000.00", purchases: "9200.00" }
  ]
};

const { fetchServerJson, getCapabilities, hasPermission } = vi.hoisted(() => ({
  fetchServerJson: vi.fn(async (endpoint: string) => {
    if (endpoint.startsWith("/v1/reports/dashboard")) {
      return reportsDashboard;
    }

    if (endpoint.startsWith("/v1/charts/dashboard")) {
      return chartsDashboard;
    }

    if (endpoint === "/v1/compliance/overview") {
      return {
        totalInvoicesReady: 1,
        totalReportedDocuments: 4,
        queuedSubmissions: 0,
        failedSubmissions: 0,
        recentReportedDocuments: reportsDashboard.reportedDocuments
      };
    }

    return [];
  }),
  getCapabilities: vi.fn(async () => ({
    roleKey: "ACCOUNTANT",
    permissions: ["shell.reports.read", "shell.charts.read"]
  })),
  hasPermission: vi.fn(
    (capabilities: { permissions: string[] }, permission: string) =>
      capabilities.permissions.includes(permission)
  )
}));

vi.mock("../api", () => ({
  fetchServerJson
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  })
}));

vi.mock("../week2/route-utils", () => ({
  getCapabilities,
  hasPermission
}));

import { renderChartsSurface, renderReportsSurface } from "./reporting-pages";

describe("week 9 reporting pages", () => {
  it("renders the reports overview launcher", async () => {
    render(
      await renderReportsSurface("nomad-events", ["reports"], {
        from: "2026-04-01",
        to: "2026-04-30"
      })
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Financial Overview" })
    ).toBeTruthy();
    expect(screen.getAllByText("Bank Summary").length).toBeGreaterThanOrEqual(1);
    expect(fetchServerJson).toHaveBeenCalledWith(
      "/v1/reports/dashboard?from=2026-04-01&to=2026-04-30"
    );
  });

  it("renders the bank summary route from the unified report payload", async () => {
    render(
      await renderReportsSurface("nomad-events", ["reports", "bank_summary"], {
        from: "2026-04-01",
        to: "2026-04-30"
      })
    );

    expect(screen.getAllByText("Bank Summary").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("STC Wallet")).toBeTruthy();
    expect(screen.getAllByText("Closing Balance").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the sales tax route with real filtered tax lines", async () => {
    render(
      await renderReportsSurface("nomad-events", ["reports", "sales_tax"], {
        from: "2026-04-01",
        to: "2026-04-30",
        showByTaxRate: "true"
      })
    );

    expect(screen.getByRole("heading", { level: 1, name: "Sales Tax Report" })).toBeTruthy();
    expect(screen.getByText("INV-001")).toBeTruthy();
    expect(screen.getByText("VAT 15%")).toBeTruthy();
  });

  it("renders the sales and purchases chart route", async () => {
    render(
      await renderChartsSurface("nomad-events", ["charts", "sales_purchases"], {
        from: "2026-04-01",
        to: "2026-04-30"
      })
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Sales and Purchases" })
    ).toBeTruthy();
    expect(screen.getByText("Open Report")).toBeTruthy();
    expect(screen.getAllByText("Sales").length).toBeGreaterThanOrEqual(1);
  });

  it("renders an access message when reports permission is missing", async () => {
    getCapabilities.mockResolvedValueOnce({
      roleKey: "VIEWER",
      permissions: ["shell.charts.read"]
    });

    render(await renderReportsSurface("nomad-events", ["reports"], {}));

    expect(screen.getByText(/does not currently include reports access/i)).toBeTruthy();
  });
});
