import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { fetchServerJson, getCapabilities, hasPermission } = vi.hoisted(() => ({
  fetchServerJson: vi.fn(async (endpoint: string) => {
    if (endpoint === "/v1/journals") {
      return [
        {
          id: "journal-1",
          organizationId: "org-1",
          journalNumber: "MJ-0001",
          reference: "APR-ACCRUAL",
          entryDate: "2026-04-03T00:00:00.000Z",
          memo: "Accrued venue costs",
          totalDebit: "2400.00",
          totalCredit: "2400.00",
          lineCount: 2,
          createdAt: "2026-04-03T00:00:00.000Z",
          updatedAt: "2026-04-03T00:00:00.000Z",
        },
      ];
    }

    if (endpoint === "/v1/journals/journal-1") {
      return {
        id: "journal-1",
        organizationId: "org-1",
        journalNumber: "MJ-0001",
        reference: "APR-ACCRUAL",
        entryDate: "2026-04-03T00:00:00.000Z",
        memo: "Accrued venue costs",
        totalDebit: "2400.00",
        totalCredit: "2400.00",
        lineCount: 2,
        createdAt: "2026-04-03T00:00:00.000Z",
        updatedAt: "2026-04-03T00:00:00.000Z",
        lines: [
          {
            id: "line-1",
            journalEntryId: "journal-1",
            accountId: "account-1",
            accountCode: "5100",
            accountName: "Office Operations",
            accountType: "EXPENSE",
            description: "Operations expense accrual",
            debit: "2400.00",
            credit: "0.00",
            sortOrder: 0,
            createdAt: "2026-04-03T00:00:00.000Z",
            updatedAt: "2026-04-03T00:00:00.000Z",
          },
          {
            id: "line-2",
            journalEntryId: "journal-1",
            accountId: "account-2",
            accountCode: "2000",
            accountName: "Accounts Payable",
            accountType: "LIABILITY",
            description: "Supplier payable accrual",
            debit: "0.00",
            credit: "2400.00",
            sortOrder: 1,
            createdAt: "2026-04-03T00:00:00.000Z",
            updatedAt: "2026-04-03T00:00:00.000Z",
          },
        ],
      };
    }

    return [
      {
        id: "account-1",
        organizationId: "org-1",
        code: "5100",
        name: "Office Operations",
        type: "EXPENSE",
        description: "General operating expenses.",
        isSystem: false,
        isActive: true,
        createdAt: "2026-04-03T00:00:00.000Z",
        updatedAt: "2026-04-03T00:00:00.000Z",
      },
    ];
  }),
  getCapabilities: vi.fn(async () => ({
    roleKey: "ACCOUNTANT",
    permissions: [
      "journals.read",
      "journals.write",
      "setup.read",
      "shell.accounting.read",
    ],
  })),
  hasPermission: vi.fn((capabilities, permission) =>
    capabilities.permissions.includes(permission),
  ),
}));

vi.mock("../api", () => ({
  fetchServerJson,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../week2/route-utils", () => ({
  getCapabilities,
  hasPermission,
}));

import { renderManualJournalsPage } from "./manual-journals-page";

describe("manual journals page", () => {
  it("renders the journal list and create form", async () => {
    render(
      await renderManualJournalsPage("nomad-events", [
        "accounting",
        "manual-journals",
      ]),
    );

    expect(fetchServerJson).toHaveBeenCalledWith("/v1/journals");
    expect(fetchServerJson).toHaveBeenCalledWith("/v1/setup/chart-of-accounts");
    expect(
      screen.getByRole("heading", { level: 2, name: "Manual Journals" }),
    ).toBeTruthy();
    expect(screen.getByText("MJ-0001")).toBeTruthy();
    expect(screen.getByText("New Manual Journal")).toBeTruthy();
  });

  it("renders the selected journal detail and edit form", async () => {
    render(
      await renderManualJournalsPage("nomad-events", [
        "accounting",
        "manual-journals",
        "journal-1",
      ]),
    );

    expect(fetchServerJson).toHaveBeenCalledWith("/v1/journals/journal-1");
    expect(screen.getByText("Journal Detail")).toBeTruthy();
    expect(screen.getByText("Edit Manual Journal")).toBeTruthy();
    expect(screen.getAllByText(/5100 .*Office Operations/).length).toBeGreaterThan(0);
  });

  it("renders a permission message when journal access is missing", async () => {
    getCapabilities.mockResolvedValueOnce({
      roleKey: "VIEWER",
      permissions: ["shell.accounting.read"],
    });

    render(
      await renderManualJournalsPage("nomad-events", [
        "accounting",
        "manual-journals",
      ]),
    );

    expect(
      screen.getByText(/does not currently include manual journal access/i),
    ).toBeTruthy();
  });
});
