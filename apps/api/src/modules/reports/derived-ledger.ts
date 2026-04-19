import type {
  AccountType,
  BalanceSheetRecord,
  TrialBalanceLineRecord,
  TrialBalanceRecord
} from "@daftar/types";

export type DerivedLedgerEntryInput = {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debit: number;
  credit: number;
};

export type DerivedLedgerInput = {
  entries: DerivedLedgerEntryInput[];
};

function money(value: number) {
  return value.toFixed(2);
}

function balanceForLine(line: TrialBalanceLineRecord) {
  switch (line.accountType) {
    case "ASSET":
    case "EXPENSE":
      return Number(line.debit) - Number(line.credit);
    case "LIABILITY":
    case "EQUITY":
    case "REVENUE":
      return Number(line.credit) - Number(line.debit);
  }
}

export function buildDerivedLedger(input: DerivedLedgerInput): {
  lines: TrialBalanceLineRecord[];
  balanceSheet: BalanceSheetRecord;
  trialBalance: TrialBalanceRecord;
} {
  const aggregated = new Map<string, TrialBalanceLineRecord>();

  for (const entry of input.entries) {
    const key = `${entry.accountCode}::${entry.accountType}`;
    const existing = aggregated.get(key);

    if (existing) {
      existing.debit = money(Number(existing.debit) + entry.debit);
      existing.credit = money(Number(existing.credit) + entry.credit);
      continue;
    }

    aggregated.set(key, {
      accountCode: entry.accountCode,
      accountName: entry.accountName,
      accountType: entry.accountType,
      debit: money(entry.debit),
      credit: money(entry.credit)
    });
  }

  const lines = Array.from(aggregated.values()).sort((left, right) =>
    left.accountCode.localeCompare(right.accountCode)
  );

  let totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
  let totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
  const difference = Number((totalDebit - totalCredit).toFixed(2));

  if (difference > 0) {
    lines.push({
      accountCode: "3000",
      accountName: "Retained Earnings",
      accountType: "EQUITY",
      debit: "0.00",
      credit: money(difference)
    });
    totalCredit += difference;
  } else if (difference < 0) {
    lines.push({
      accountCode: "3000",
      accountName: "Retained Earnings",
      accountType: "EQUITY",
      debit: money(Math.abs(difference)),
      credit: "0.00"
    });
    totalDebit += Math.abs(difference);
  }

  const assets = lines
    .filter((line) => line.accountType === "ASSET")
    .reduce((sum, line) => sum + balanceForLine(line), 0);
  const liabilities = lines
    .filter((line) => line.accountType === "LIABILITY")
    .reduce((sum, line) => sum + balanceForLine(line), 0);
  const equity = lines
    .filter((line) => line.accountType !== "ASSET" && line.accountType !== "LIABILITY")
    .reduce((sum, line) => sum + (Number(line.credit) - Number(line.debit)), 0);

  return {
    lines,
    balanceSheet: {
      assets: money(assets),
      liabilities: money(liabilities),
      equity: money(equity)
    },
    trialBalance: {
      lines,
      totalDebit: money(totalDebit),
      totalCredit: money(totalCredit)
    }
  };
}
