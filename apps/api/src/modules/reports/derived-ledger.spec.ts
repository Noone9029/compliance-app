import { describe, expect, it } from "vitest";

import { buildDerivedLedger } from "./derived-ledger";

describe("derived-ledger", () => {
  it("keeps trial balance debits and credits aligned", () => {
    const ledger = buildDerivedLedger({
      entries: [
        {
          accountCode: "1000",
          accountName: "Cash at Bank",
          accountType: "ASSET",
          debit: 5000,
          credit: 0
        },
        {
          accountCode: "1100",
          accountName: "Accounts Receivable",
          accountType: "ASSET",
          debit: 1200,
          credit: 0
        },
        {
          accountCode: "1200",
          accountName: "Fixed Assets",
          accountType: "ASSET",
          debit: 8000,
          credit: 0
        },
        {
          accountCode: "1700",
          accountName: "Accumulated Depreciation",
          accountType: "ASSET",
          debit: 0,
          credit: 500
        },
        {
          accountCode: "2000",
          accountName: "Accounts Payable",
          accountType: "LIABILITY",
          debit: 0,
          credit: 1500
        },
        {
          accountCode: "4000",
          accountName: "Sales Revenue",
          accountType: "REVENUE",
          debit: 0,
          credit: 6200
        },
        {
          accountCode: "5100",
          accountName: "Bills Expense",
          accountType: "EXPENSE",
          debit: 1800,
          credit: 0
        },
        {
          accountCode: "5200",
          accountName: "Depreciation Expense",
          accountType: "EXPENSE",
          debit: 500,
          credit: 0
        }
      ]
    });

    expect(ledger.trialBalance.totalDebit).toBe(ledger.trialBalance.totalCredit);
  });

  it("keeps balance sheet assets equal to liabilities plus equity", () => {
    const ledger = buildDerivedLedger({
      entries: [
        {
          accountCode: "1000",
          accountName: "Cash at Bank",
          accountType: "ASSET",
          debit: 4000,
          credit: 0
        },
        {
          accountCode: "1100",
          accountName: "Accounts Receivable",
          accountType: "ASSET",
          debit: 900,
          credit: 0
        },
        {
          accountCode: "1200",
          accountName: "Fixed Assets",
          accountType: "ASSET",
          debit: 6000,
          credit: 0
        },
        {
          accountCode: "1700",
          accountName: "Accumulated Depreciation",
          accountType: "ASSET",
          debit: 0,
          credit: 600
        },
        {
          accountCode: "2000",
          accountName: "Accounts Payable",
          accountType: "LIABILITY",
          debit: 0,
          credit: 1100
        },
        {
          accountCode: "4000",
          accountName: "Sales Revenue",
          accountType: "REVENUE",
          debit: 0,
          credit: 5100
        },
        {
          accountCode: "5100",
          accountName: "Bills Expense",
          accountType: "EXPENSE",
          debit: 1700,
          credit: 0
        },
        {
          accountCode: "5200",
          accountName: "Depreciation Expense",
          accountType: "EXPENSE",
          debit: 600,
          credit: 0
        }
      ]
    });

    expect(Number(ledger.balanceSheet.assets)).toBeCloseTo(
      Number(ledger.balanceSheet.liabilities) + Number(ledger.balanceSheet.equity),
      2
    );
  });

  it("includes revenue, expense, and balancing equity lines for extended report validation", () => {
    const ledger = buildDerivedLedger({
      entries: [
        {
          accountCode: "1000",
          accountName: "Cash at Bank",
          accountType: "ASSET",
          debit: 3200,
          credit: 0
        },
        {
          accountCode: "1100",
          accountName: "Accounts Receivable",
          accountType: "ASSET",
          debit: 400,
          credit: 0
        },
        {
          accountCode: "1200",
          accountName: "Fixed Assets",
          accountType: "ASSET",
          debit: 2500,
          credit: 0
        },
        {
          accountCode: "1700",
          accountName: "Accumulated Depreciation",
          accountType: "ASSET",
          debit: 0,
          credit: 200
        },
        {
          accountCode: "2000",
          accountName: "Accounts Payable",
          accountType: "LIABILITY",
          debit: 0,
          credit: 300
        },
        {
          accountCode: "4000",
          accountName: "Sales Revenue",
          accountType: "REVENUE",
          debit: 0,
          credit: 4100
        },
        {
          accountCode: "5100",
          accountName: "Bills Expense",
          accountType: "EXPENSE",
          debit: 900,
          credit: 0
        },
        {
          accountCode: "5200",
          accountName: "Depreciation Expense",
          accountType: "EXPENSE",
          debit: 200,
          credit: 0
        }
      ]
    });

    expect(ledger.trialBalance.lines.some((line) => line.accountCode === "4000")).toBe(true);
    expect(ledger.trialBalance.lines.some((line) => line.accountCode === "5100")).toBe(true);
    expect(ledger.trialBalance.lines.some((line) => line.accountCode === "3000")).toBe(true);
  });
});
