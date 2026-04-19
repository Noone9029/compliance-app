import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { fetchServerJson, getCapabilities, hasPermission } = vi.hoisted(() => ({
  fetchServerJson: vi.fn(async (endpoint: string) => {
    if (endpoint === "/v1/accounting/dashboard") {
      return {
        organizationName: "Nomad Events Arabia Limited",
        bankBalances: [{ label: "STC Wallet", value: "1200.00" }],
        profitLossSeries: [
          {
            label: "Apr 26",
            revenue: "3000.00",
            expenses: "1200.00",
            grossProfit: "2200.00",
            netProfit: "1800.00"
          }
        ],
        balanceSheet: [{ label: "Assets", value: "12000.00" }],
        expenseBreakdown: [{ label: "Travel", value: "450.00" }],
        cashFlow: [
          {
            label: "STC Wallet",
            cashIn: "900.00",
            cashOut: "300.00",
            cashRemaining: "1800.00"
          }
        ],
        salesPurchases: [
          { label: "Receivables", total: "1400.00", due: "1100.00" },
          { label: "Payables", total: "900.00", due: "500.00" }
        ]
      };
    }

    return {
      organizationName: "Nomad Events Arabia Limited",
      selectedYear: 2026,
      selectedMonth: 4,
      availableYears: [2025, 2026],
      usersByRole: [{ label: "OWNER", value: "1" }],
      membershipStatus: [{ label: "Active", value: "1" }],
      totalUsers: 1,
      activeUsers: 1,
      invitedUsers: 0,
      disabledUsers: 0,
      joinedThisPeriod: 0,
      activeUsersThisPeriod: 1
    };
  }),
  getCapabilities: vi.fn(async () => ({
    roleKey: "OWNER",
    permissions: [
      "shell.accounting.read",
      "shell.hr_payroll.read",
      "shell.e_invoice.read",
      "shell.subscription.read",
      "shell.task_management.read",
      "shell.applications.read",
      "shell.list_tracking.read",
      "shell.settings.read"
    ]
  })),
  hasPermission: vi.fn(() => true)
}));

vi.mock("../api", () => ({
  fetchServerJson
}));

vi.mock("../week2/route-utils", () => ({
  getCapabilities,
  hasPermission
}));

import {
  renderAccountingOverviewPage,
  renderAccountingDashboardPage,
  renderHomePage,
  renderOrganisationStatsPage
} from "./shell-pages";

describe("shell pages", () => {
  it("renders the home service launcher", async () => {
    render(await renderHomePage("nomad-events"));

    expect(screen.getByText("What services do you need?")).toBeTruthy();
    expect(screen.getByText("Accounting")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("renders the accounting overview launcher", async () => {
    render(await renderAccountingOverviewPage("nomad-events"));

    expect(screen.getByText("Accounting Overview")).toBeTruthy();
    expect(screen.getByText("Sales")).toBeTruthy();
    expect(screen.getByText("Manual Journals")).toBeTruthy();
  });

  it("renders the accounting dashboard widgets", async () => {
    render(await renderAccountingDashboardPage());

    expect(fetchServerJson).toHaveBeenCalledWith("/v1/accounting/dashboard");
    expect(screen.getByText("Accounting performance at a glance")).toBeTruthy();
    expect(screen.getByText("Bank Balance")).toBeTruthy();
    expect(screen.getByText("Sales and Purchases")).toBeTruthy();
  });

  it("renders organisation stats filters and quiet dashboard panels", async () => {
    render(
      await renderOrganisationStatsPage("nomad-events", {
        year: "2026",
        month: "4"
      })
    );

    expect(fetchServerJson).toHaveBeenCalledWith(
      "/v1/accounting/organisation-stats?year=2026&month=4"
    );
    expect(screen.getByText("Organisation Users")).toBeTruthy();
    expect(screen.getByText("Organisation Time-off")).toBeTruthy();
    expect(
      screen.getByText("No time-off activity has been recorded for the selected period.")
    ).toBeTruthy();
    expect(
      screen.getByText("No pay-run activity has been recorded for the selected period.")
    ).toBeTruthy();
    expect(screen.getByDisplayValue("2026")).toBeTruthy();
    expect(screen.getByDisplayValue("April")).toBeTruthy();
  });
});
