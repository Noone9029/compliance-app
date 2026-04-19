import { Inject, Injectable } from "@nestjs/common";
import {
  roleKeys,
  type AccountingDashboardRecord,
  type ChartPointRecord,
  type OrganizationStatsRecord,
  type ProfitLossSeriesRecord
} from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";
import { ReportsService } from "../reports/reports.service";

type RoleKey = (typeof roleKeys)[number];

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

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

const ROLE_ORDER: RoleKey[] = [
  "OWNER",
  "ADMIN",
  "ACCOUNTANT",
  "COMPLIANCE_OFFICER",
  "VIEWER"
];

function monthLabel(date: Date) {
  return `${MONTH_NAMES[date.getUTCMonth()].slice(0, 3)} ${String(
    date.getUTCFullYear()
  ).slice(-2)}`;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthWindow(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function lastSixMonths() {
  const months: Date[] = [];
  const current = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    months.push(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - offset, 1)));
  }

  return months;
}

function topChartPoints(bucket: Map<string, number>, limit = 5): ChartPointRecord[] {
  return Array.from(bucket.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, value]) => ({
      label,
      value: value.toFixed(2)
    }));
}

@Injectable()
export class AccountingShellService {
  private readonly prisma: PrismaService;
  private readonly reportsService: ReportsService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(ReportsService) reportsService: ReportsService
  ) {
    this.prisma = prisma;
    this.reportsService = reportsService;
  }

  async getDashboard(organizationId: string): Promise<AccountingDashboardRecord> {
    const [organization, reports, purchaseBillLines, monthlyProfitLossSeries] =
      await Promise.all([
        this.prisma.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { name: true }
        }),
        this.reportsService.getDashboard(organizationId),
        this.prisma.purchaseBillLine.findMany({
          where: {
            purchaseBill: {
              organizationId,
              status: { not: "VOID" }
            }
          },
          select: {
            description: true,
            lineTotal: true
          }
        }),
        this.buildMonthlyProfitLossSeries(organizationId)
      ]);

    const expenseBucket = new Map<string, number>();

    for (const point of reports.expenseBreakdown.categories) {
      expenseBucket.set(point.label, Number(point.value));
    }

    for (const line of purchaseBillLines) {
      const key = line.description.trim() || "Uncategorised";
      expenseBucket.set(key, (expenseBucket.get(key) ?? 0) + Number(line.lineTotal ?? 0));
    }

    return {
      organizationName: organization.name,
      bankBalances: reports.bankSummary.accounts.map((account) => ({
        label: account.accountName,
        value: account.closingBalance
      })),
      profitLossSeries: monthlyProfitLossSeries,
      balanceSheet: [
        { label: "Assets", value: reports.balanceSheet.assets },
        { label: "Equity", value: reports.balanceSheet.equity },
        { label: "Liabilities", value: reports.balanceSheet.liabilities }
      ],
      expenseBreakdown:
        expenseBucket.size > 0
          ? topChartPoints(expenseBucket)
          : [{ label: "No posted expenses yet", value: "0.00" }],
      cashFlow: reports.bankSummary.accounts.map((account) => ({
        label: account.accountName,
        cashIn: account.cashReceived,
        cashOut: account.cashSpent,
        cashRemaining: account.closingBalance
      })),
      salesPurchases: [
        {
          label: "Receivables",
          total: money(reports.payablesReceivables.totalReceivables),
          due: money(reports.payablesReceivables.overdueReceivables)
        },
        {
          label: "Payables",
          total: money(reports.payablesReceivables.totalPayables),
          due: money(reports.payablesReceivables.unpaidBills)
        }
      ]
    };
  }

  async getOrganisationStats(
    organizationId: string,
    filters: { year?: number; month?: number }
  ): Promise<OrganizationStatsRecord> {
    const now = new Date();
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        name: true,
        createdAt: true
      }
    });

    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;
    const availableYears = Array.from(
      { length: currentYear - organization.createdAt.getUTCFullYear() + 1 },
      (_, index) => organization.createdAt.getUTCFullYear() + index
    );

    const selectedYear = availableYears.includes(filters.year ?? currentYear)
      ? (filters.year ?? currentYear)
      : currentYear;
    const selectedMonth =
      filters.month && filters.month >= 1 && filters.month <= 12 ? filters.month : currentMonth;
    const { start, end } = monthWindow(selectedYear, selectedMonth);

    const [memberships, activeActors] = await Promise.all([
      this.prisma.membership.findMany({
        where: { organizationId },
        include: {
          role: {
            select: { key: true }
          }
        }
      }),
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          actorUserId: { not: null },
          createdAt: {
            gte: start,
            lt: end
          }
        },
        select: {
          actorUserId: true
        },
        distinct: ["actorUserId"]
      })
    ]);

    const roleCounts = new Map<RoleKey, number>(ROLE_ORDER.map((roleKey) => [roleKey, 0]));

    for (const membership of memberships) {
      const roleKey = membership.role.key as RoleKey;
      roleCounts.set(roleKey, (roleCounts.get(roleKey) ?? 0) + 1);
    }

    const activeUsers = memberships.filter((membership) => membership.status === "ACTIVE").length;
    const invitedUsers = memberships.filter((membership) => membership.status === "INVITED").length;
    const disabledUsers = memberships.filter((membership) => membership.status === "DISABLED").length;
    const joinedThisPeriod = memberships.filter(
      (membership) => membership.createdAt >= start && membership.createdAt < end
    ).length;

    return {
      organizationName: organization.name,
      selectedYear,
      selectedMonth,
      availableYears,
      usersByRole: ROLE_ORDER.map((roleKey) => ({
        label: roleKey.replaceAll("_", " "),
        value: String(roleCounts.get(roleKey) ?? 0)
      })),
      membershipStatus: [
        { label: "Active", value: String(activeUsers) },
        { label: "Invited", value: String(invitedUsers) },
        { label: "Disabled", value: String(disabledUsers) }
      ],
      totalUsers: memberships.length,
      activeUsers,
      invitedUsers,
      disabledUsers,
      joinedThisPeriod,
      activeUsersThisPeriod: activeActors.length
    };
  }

  private async buildMonthlyProfitLossSeries(
    organizationId: string
  ): Promise<ProfitLossSeriesRecord[]> {
    const [salesInvoices, purchaseBills, depreciationRuns, journalLines] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: {
          organizationId,
          status: { notIn: ["DRAFT", "VOID"] }
        },
        select: {
          issueDate: true,
          total: true
        }
      }),
      this.prisma.purchaseBill.findMany({
        where: {
          organizationId,
          status: { notIn: ["DRAFT", "VOID"] }
        },
        select: {
          issueDate: true,
          total: true
        }
      }),
      this.prisma.depreciationRun.findMany({
        where: { organizationId },
        select: {
          depreciationAmount: true,
          runDate: true
        }
      }),
      this.prisma.journalEntryLine.findMany({
        where: {
          journalEntry: { organizationId }
        },
        select: {
          debit: true,
          credit: true,
          account: {
            select: {
              type: true
            }
          },
          journalEntry: {
            select: {
              entryDate: true
            }
          }
        }
      })
    ]);

    const monthlyRevenue = new Map<string, number>();
    const monthlyBillExpense = new Map<string, number>();
    const monthlyDepreciation = new Map<string, number>();
    const monthlyJournalRevenue = new Map<string, number>();
    const monthlyJournalExpense = new Map<string, number>();

    for (const invoice of salesInvoices) {
      const key = monthKey(invoice.issueDate);
      monthlyRevenue.set(key, (monthlyRevenue.get(key) ?? 0) + Number(invoice.total));
    }

    for (const bill of purchaseBills) {
      const key = monthKey(bill.issueDate);
      monthlyBillExpense.set(key, (monthlyBillExpense.get(key) ?? 0) + Number(bill.total));
    }

    for (const run of depreciationRuns) {
      const key = monthKey(run.runDate);
      monthlyDepreciation.set(
        key,
        (monthlyDepreciation.get(key) ?? 0) + Number(run.depreciationAmount)
      );
    }

    for (const line of journalLines) {
      const key = monthKey(line.journalEntry.entryDate);
      const net = Number(line.credit) - Number(line.debit);

      if (line.account.type === "REVENUE") {
        monthlyJournalRevenue.set(
          key,
          (monthlyJournalRevenue.get(key) ?? 0) + net
        );
      }

      if (line.account.type === "EXPENSE") {
        monthlyJournalExpense.set(
          key,
          (monthlyJournalExpense.get(key) ?? 0) + (Number(line.debit) - Number(line.credit))
        );
      }
    }

    return lastSixMonths().map((monthStart) => {
      const key = monthKey(monthStart);
      const revenue =
        (monthlyRevenue.get(key) ?? 0) + (monthlyJournalRevenue.get(key) ?? 0);
      const billExpense =
        (monthlyBillExpense.get(key) ?? 0) + (monthlyJournalExpense.get(key) ?? 0);
      const depreciationExpense = monthlyDepreciation.get(key) ?? 0;
      const totalExpenses = billExpense + depreciationExpense;

      return {
        label: monthLabel(monthStart),
        revenue: money(revenue),
        expenses: money(totalExpenses),
        grossProfit: money(revenue - billExpense),
        netProfit: money(revenue - totalExpenses)
      };
    });
  }
}
