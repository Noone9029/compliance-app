import { Inject, Injectable } from "@nestjs/common";
import type {
  BalanceSheetRecord,
  BankSummaryLineRecord,
  BankSummaryRecord,
  BudgetSummaryRecord,
  ContactTransactionRecord,
  ExpenseBreakdownRecord,
  ExecutiveSummaryRecord,
  OutstandingDocumentRecord,
  PayablesReceivablesRecord,
  ProfitLossRecord,
  ReportsDashboardRecord,
  ReportedDocumentRecord,
  SalesPurchasesSeriesPoint,
  SalesTaxLineRecord,
  SalesTaxReportRecord,
  TrialBalanceLineRecord,
  TrialBalanceRecord
} from "@daftar/types";

import {
  buildDateRangeInput,
  type DateRangeFilter
} from "../../common/utils/date-range";
import { PrismaService } from "../../common/prisma/prisma.service";
import { buildDerivedLedger } from "./derived-ledger";

function money(value: { toString(): string } | string | number | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

function isPositive(value: string) {
  return Number(value) > 0;
}

function isOverdue(dueDate: Date, amountDue: string) {
  return Number(amountDue) > 0 && dueDate < new Date();
}

@Injectable()
export class ReportsService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async getDashboard(
    organizationId: string,
    dateRange: DateRangeFilter = {}
  ): Promise<ReportsDashboardRecord> {
    const [
      bankSummary,
      payablesReceivables,
      executiveSummary,
      salesTax,
      budgetSummary,
      contactTransactions,
      reportedDocuments,
      salesPurchasesSeries,
      expenseBreakdown,
      derivedLedger
    ] = await Promise.all([
      this.getBankSummary(organizationId, dateRange),
      this.getPayablesReceivables(organizationId, dateRange),
      this.getExecutiveSummary(organizationId, dateRange),
      this.getSalesTax(organizationId, dateRange),
      this.getBudgetSummary(organizationId, dateRange),
      this.getContactTransactions(organizationId, dateRange),
      this.getReportedDocuments(organizationId, dateRange),
      this.getSalesPurchasesSeries(organizationId, dateRange),
      this.getExpenseBreakdown(organizationId, dateRange),
      this.getDerivedLedger(organizationId, dateRange)
    ]);

    return {
      executiveSummary: {
        ...executiveSummary,
        receivables: payablesReceivables.totalReceivables,
        payables: payablesReceivables.totalPayables,
        reportedDocumentsCount: reportedDocuments.length
      },
      salesTax,
      payablesReceivables,
      profitLoss: this.buildProfitLoss(derivedLedger.trialBalance.lines),
      bankSummary,
      budgetSummary,
      expenseBreakdown,
      balanceSheet: derivedLedger.balanceSheet,
      trialBalance: derivedLedger.trialBalance,
      salesPurchasesSeries,
      contactTransactions,
      reportedDocuments
    };
  }

  private async getExecutiveSummary(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<ExecutiveSummaryRecord> {
    const [sales, purchases, quotes] = await Promise.all([
      this.prisma.salesInvoice.aggregate({
        where: {
          organizationId,
          status: { notIn: ["DRAFT", "VOID"] },
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        _sum: { total: true }
      }),
      this.prisma.purchaseBill.aggregate({
        where: {
          organizationId,
          status: { notIn: ["DRAFT", "VOID"] },
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        _sum: { total: true }
      }),
      this.prisma.quote.count({
        where: {
          organizationId,
          status: "DRAFT",
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        }
      })
    ]);

    return {
      totalSales: money(sales._sum.total),
      totalPurchases: money(purchases._sum.total),
      receivables: "0.00",
      payables: "0.00",
      reportedDocumentsCount: 0,
      draftQuotesCount: quotes
    };
  }

  private async getSalesTax(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<SalesTaxReportRecord> {
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        organizationId,
        status: { notIn: ["DRAFT", "VOID"] },
        ...(this.buildIssueDateFilter(dateRange)
          ? { issueDate: this.buildIssueDateFilter(dateRange) }
          : {})
      },
      include: {
        contact: true
      },
      orderBy: [{ issueDate: "asc" }, { createdAt: "asc" }]
    });

    const lines: SalesTaxLineRecord[] = invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      contactId: invoice.contactId,
      contactName: invoice.contact.displayName,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      status: invoice.status,
      currencyCode: invoice.currencyCode,
      taxableSales: money(invoice.subtotal),
      taxCollected: money(invoice.taxTotal),
      taxRateLabel: Number(invoice.taxTotal) > 0 ? "VAT 15%" : "Zero-rated / exempt",
      taxComponentLabel: "Output VAT",
      accountTypeLabel: "Sales"
    }));

    return {
      taxableSales: money(
        lines.reduce((sum, line) => sum + Number(line.taxableSales), 0)
      ),
      taxCollected: money(
        lines.reduce((sum, line) => sum + Number(line.taxCollected), 0)
      ),
      invoiceCount: lines.length,
      lines
    };
  }

  private async getPayablesReceivables(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<PayablesReceivablesRecord> {
    const [invoices, bills] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: {
          organizationId,
          status: { notIn: ["DRAFT", "VOID"] },
          amountDue: { gt: 0 },
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        include: { contact: true },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.purchaseBill.findMany({
        where: {
          organizationId,
          status: { notIn: ["DRAFT", "VOID"] },
          amountDue: { gt: 0 },
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        include: { contact: true },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }]
      })
    ]);

    const documents: OutstandingDocumentRecord[] = [
      ...invoices.map((invoice) => ({
        kind: "RECEIVABLE" as const,
        documentId: invoice.id,
        documentNumber: invoice.invoiceNumber,
        contactId: invoice.contactId,
        contactName: invoice.contact.displayName,
        issueDate: invoice.issueDate.toISOString(),
        dueDate: invoice.dueDate.toISOString(),
        status: invoice.status,
        currencyCode: invoice.currencyCode,
        amountDue: money(invoice.amountDue),
        isOverdue: isOverdue(invoice.dueDate, money(invoice.amountDue))
      })),
      ...bills.map((bill) => ({
        kind: "PAYABLE" as const,
        documentId: bill.id,
        documentNumber: bill.billNumber,
        contactId: bill.contactId,
        contactName: bill.contact.displayName,
        issueDate: bill.issueDate.toISOString(),
        dueDate: bill.dueDate.toISOString(),
        status: bill.status,
        currencyCode: bill.currencyCode,
        amountDue: money(bill.amountDue),
        isOverdue: isOverdue(bill.dueDate, money(bill.amountDue))
      }))
    ].sort((left, right) => left.dueDate.localeCompare(right.dueDate));

    const receivableDocuments = documents.filter(
      (document) => document.kind === "RECEIVABLE"
    );
    const payableDocuments = documents.filter(
      (document) => document.kind === "PAYABLE"
    );

    return {
      totalReceivables: money(
        receivableDocuments.reduce((sum, document) => sum + Number(document.amountDue), 0)
      ),
      totalPayables: money(
        payableDocuments.reduce((sum, document) => sum + Number(document.amountDue), 0)
      ),
      overdueReceivables: money(
        receivableDocuments
          .filter((document) => document.isOverdue)
          .reduce((sum, document) => sum + Number(document.amountDue), 0)
      ),
      unpaidBills: money(
        payableDocuments
          .filter((document) => document.isOverdue)
          .reduce((sum, document) => sum + Number(document.amountDue), 0)
      ),
      documents
    };
  }

  private buildProfitLoss(lines: TrialBalanceLineRecord[]): ProfitLossRecord {
    const revenue = lines
      .filter((line) => line.accountType === "REVENUE")
      .reduce((sum, line) => sum + Number(line.credit) - Number(line.debit), 0);
    const expenses = lines
      .filter((line) => line.accountType === "EXPENSE")
      .reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0);

    return {
      revenue: money(revenue),
      expenses: money(expenses),
      profit: money(revenue - expenses)
    };
  }

  private async getBankSummary(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<BankSummaryRecord> {
    const [bankAccounts, invoicePayments, billPayments] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where: { organizationId, isActive: true },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }]
      }),
      this.prisma.invoicePayment.findMany({
        where: {
          salesInvoice: { organizationId },
          ...(this.buildPaymentDateFilter(dateRange)
            ? { paymentDate: this.buildPaymentDateFilter(dateRange) }
            : {})
        },
        select: {
          amount: true,
          bankAccountId: true
        }
      }),
      this.prisma.billPayment.findMany({
        where: {
          purchaseBill: { organizationId },
          ...(this.buildPaymentDateFilter(dateRange)
            ? { paymentDate: this.buildPaymentDateFilter(dateRange) }
            : {})
        },
        select: {
          amount: true,
          bankAccountId: true
        }
      })
    ]);

    const cashInByBank = new Map<string, number>();
    const cashOutByBank = new Map<string, number>();
    let unassignedIncoming = 0;
    let unassignedOutgoing = 0;

    for (const payment of invoicePayments) {
      if (!payment.bankAccountId) {
        unassignedIncoming += Number(payment.amount);
        continue;
      }

      cashInByBank.set(
        payment.bankAccountId,
        (cashInByBank.get(payment.bankAccountId) ?? 0) + Number(payment.amount)
      );
    }

    for (const payment of billPayments) {
      if (!payment.bankAccountId) {
        unassignedOutgoing += Number(payment.amount);
        continue;
      }

      cashOutByBank.set(
        payment.bankAccountId,
        (cashOutByBank.get(payment.bankAccountId) ?? 0) + Number(payment.amount)
      );
    }

    const accounts: BankSummaryLineRecord[] = bankAccounts.map((account) => {
      const openingBalance = Number(account.openingBalance);
      const cashReceived = cashInByBank.get(account.id) ?? 0;
      const cashSpent = cashOutByBank.get(account.id) ?? 0;
      const closingBalance = openingBalance + cashReceived - cashSpent;

      return {
        bankAccountId: account.id,
        accountName: account.name,
        currencyCode: account.currencyCode,
        isPrimary: account.isPrimary,
        openingBalance: money(openingBalance),
        cashReceived: money(cashReceived),
        cashSpent: money(cashSpent),
        closingBalance: money(closingBalance)
      };
    });

    return {
      totalOpeningBalance: money(
        accounts.reduce((sum, account) => sum + Number(account.openingBalance), 0)
      ),
      totalInflow: money(
        accounts.reduce((sum, account) => sum + Number(account.cashReceived), 0)
      ),
      totalOutflow: money(
        accounts.reduce((sum, account) => sum + Number(account.cashSpent), 0)
      ),
      totalClosingBalance: money(
        accounts.reduce((sum, account) => sum + Number(account.closingBalance), 0)
      ),
      accountCount: accounts.length,
      unassignedIncoming: money(unassignedIncoming),
      unassignedOutgoing: money(unassignedOutgoing),
      accounts
    };
  }

  private async getBudgetSummary(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<BudgetSummaryRecord> {
    const [repeatingInvoices, repeatingBills] = await Promise.all([
      this.prisma.repeatingInvoice.aggregate({
        where: {
          organizationId,
          status: "ACTIVE",
          ...(this.buildNextRunFilter(dateRange)
            ? { nextRunAt: this.buildNextRunFilter(dateRange) }
            : {})
        },
        _sum: { total: true },
        _count: { id: true }
      }),
      this.prisma.repeatingBill.aggregate({
        where: {
          organizationId,
          status: "ACTIVE",
          ...(this.buildNextRunFilter(dateRange)
            ? { nextRunAt: this.buildNextRunFilter(dateRange) }
            : {})
        },
        _sum: { total: true },
        _count: { id: true }
      })
    ]);

    const projectedRevenue = Number(repeatingInvoices._sum.total ?? 0);
    const projectedExpenses = Number(repeatingBills._sum.total ?? 0);

    return {
      projectedMonthlyRevenue: money(projectedRevenue),
      projectedMonthlyExpenses: money(projectedExpenses),
      projectedMonthlyNet: money(projectedRevenue - projectedExpenses),
      activeRepeatingInvoices: repeatingInvoices._count.id,
      activeRepeatingBills: repeatingBills._count.id
    };
  }

  private async getExpenseBreakdown(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<ExpenseBreakdownRecord> {
    const [bills, depreciation, journalLines] = await Promise.all([
      this.prisma.purchaseBill.aggregate({
        where: {
          organizationId,
          status: { notIn: ["DRAFT", "VOID"] },
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        _sum: { total: true }
      }),
      this.prisma.depreciationRun.aggregate({
        where: {
          organizationId,
          ...(this.buildRunDateFilter(dateRange)
            ? { runDate: this.buildRunDateFilter(dateRange) }
            : {})
        },
        _sum: { depreciationAmount: true }
      }),
      this.prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            organizationId,
            ...(this.buildEntryDateFilter(dateRange)
              ? { entryDate: this.buildEntryDateFilter(dateRange) }
              : {})
          },
          account: {
            type: "EXPENSE"
          }
        },
        include: {
          account: true
        }
      })
    ]);

    const billsExpense = Number(bills._sum.total ?? 0);
    const depreciationExpense = Number(depreciation._sum.depreciationAmount ?? 0);
    const journalExpense = journalLines.reduce(
      (sum, line) => sum + Number(line.debit) - Number(line.credit),
      0
    );
    const categoryBucket = new Map<string, number>();

    if (billsExpense > 0) {
      categoryBucket.set("Purchase Bills", billsExpense);
    }

    for (const line of journalLines) {
      const net = Number(line.debit) - Number(line.credit);

      if (net <= 0) {
        continue;
      }

      categoryBucket.set(
        line.account.name,
        (categoryBucket.get(line.account.name) ?? 0) + net
      );
    }

    if (depreciationExpense > 0) {
      categoryBucket.set(
        "Depreciation",
        (categoryBucket.get("Depreciation") ?? 0) + depreciationExpense
      );
    }

    return {
      billsExpense: money(billsExpense),
      journalExpense: money(journalExpense),
      depreciationExpense: money(depreciationExpense),
      totalExpenses: money(billsExpense + journalExpense + depreciationExpense),
      categories: Array.from(categoryBucket.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([label, value]) => ({
          label,
          value: money(value)
        }))
    };
  }

  private async getSalesPurchasesSeries(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<SalesPurchasesSeriesPoint[]> {
    const [sales, purchases, quotes] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: {
          organizationId,
          status: { not: "VOID" },
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        select: { issueDate: true, total: true }
      }),
      this.prisma.purchaseBill.findMany({
        where: {
          organizationId,
          status: { not: "VOID" },
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        select: { issueDate: true, total: true }
      }),
      this.prisma.quote.findMany({
        where: {
          organizationId,
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        select: { issueDate: true, total: true }
      })
    ]);

    const bucket = new Map<string, SalesPurchasesSeriesPoint>();

    function ensure(label: string) {
      if (!bucket.has(label)) {
        bucket.set(label, {
          label,
          salesTotal: "0.00",
          purchasesTotal: "0.00",
          quotesTotal: "0.00"
        });
      }

      return bucket.get(label)!;
    }

    for (const invoice of sales) {
      const label = invoice.issueDate.toISOString().slice(0, 7);
      const point = ensure(label);
      point.salesTotal = money(Number(point.salesTotal) + Number(invoice.total));
    }

    for (const bill of purchases) {
      const label = bill.issueDate.toISOString().slice(0, 7);
      const point = ensure(label);
      point.purchasesTotal = money(
        Number(point.purchasesTotal) + Number(bill.total)
      );
    }

    for (const quote of quotes) {
      const label = quote.issueDate.toISOString().slice(0, 7);
      const point = ensure(label);
      point.quotesTotal = money(Number(point.quotesTotal) + Number(quote.total));
    }

    return Array.from(bucket.values()).sort((left, right) =>
      left.label.localeCompare(right.label)
    );
  }

  private async getContactTransactions(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<ContactTransactionRecord[]> {
    const [contacts, invoices, bills] = await Promise.all([
      this.prisma.contact.findMany({
        where: {
          organizationId,
          OR: [{ isCustomer: true }, { isSupplier: true }]
        },
        orderBy: { displayName: "asc" }
      }),
      this.prisma.salesInvoice.findMany({
        where: {
          organizationId,
          status: { not: "VOID" },
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        select: {
          contactId: true,
          amountDue: true
        }
      }),
      this.prisma.purchaseBill.findMany({
        where: {
          organizationId,
          status: { not: "VOID" },
          ...(this.buildIssueDateFilter(dateRange)
            ? { issueDate: this.buildIssueDateFilter(dateRange) }
            : {})
        },
        select: {
          contactId: true,
          amountDue: true
        }
      })
    ]);

    const invoiceCounts = new Map<string, number>();
    const billCounts = new Map<string, number>();
    const receivableBalances = new Map<string, number>();
    const payableBalances = new Map<string, number>();

    for (const invoice of invoices) {
      invoiceCounts.set(
        invoice.contactId,
        (invoiceCounts.get(invoice.contactId) ?? 0) + 1
      );
      receivableBalances.set(
        invoice.contactId,
        (receivableBalances.get(invoice.contactId) ?? 0) + Number(invoice.amountDue)
      );
    }

    for (const bill of bills) {
      billCounts.set(bill.contactId, (billCounts.get(bill.contactId) ?? 0) + 1);
      payableBalances.set(
        bill.contactId,
        (payableBalances.get(bill.contactId) ?? 0) + Number(bill.amountDue)
      );
    }

    return contacts
      .map((contact) => ({
        contactId: contact.id,
        contactName: contact.displayName,
        receivableBalance: money(receivableBalances.get(contact.id) ?? 0),
        payableBalance: money(payableBalances.get(contact.id) ?? 0),
        salesCount: invoiceCounts.get(contact.id) ?? 0,
        billCount: billCounts.get(contact.id) ?? 0
      }))
      .filter(
        (contact) =>
          contact.salesCount > 0 ||
          contact.billCount > 0 ||
          isPositive(contact.receivableBalance) ||
          isPositive(contact.payableBalance)
      );
  }

  private async getReportedDocuments(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<ReportedDocumentRecord[]> {
    const documents = await this.prisma.reportedDocument.findMany({
      where: {
        organizationId,
        ...(this.buildSubmittedAtFilter(dateRange)
          ? { submittedAt: this.buildSubmittedAtFilter(dateRange) }
          : {})
      },
      orderBy: { submittedAt: "desc" }
    });

    return documents.map((document) => ({
      id: document.id,
      organizationId: document.organizationId,
      salesInvoiceId: document.salesInvoiceId,
      complianceDocumentId: document.complianceDocumentId,
      documentNumber: document.documentNumber,
      status: document.status,
      submissionFlow: document.submissionFlow,
      lastSubmissionStatus: document.lastSubmissionStatus,
      failureCategory: document.failureCategory,
      externalSubmissionId: document.externalSubmissionId,
      responseCode: document.responseCode,
      responseMessage: document.responseMessage,
      submittedAt: document.submittedAt.toISOString(),
      createdAt: document.createdAt.toISOString()
    }));
  }

  private async getDerivedLedger(
    organizationId: string,
    dateRange: DateRangeFilter
  ): Promise<{
    balanceSheet: BalanceSheetRecord;
    trialBalance: TrialBalanceRecord;
  }> {
    const [bankSummary, payablesReceivables, sales, bills, fixedAssets, depreciation, journalLines] =
      await Promise.all([
        this.getBankSummary(organizationId, dateRange),
        this.getPayablesReceivables(organizationId, dateRange),
        this.prisma.salesInvoice.aggregate({
          where: {
            organizationId,
            status: { notIn: ["DRAFT", "VOID"] },
            ...(this.buildIssueDateFilter(dateRange)
              ? { issueDate: this.buildIssueDateFilter(dateRange) }
              : {})
          },
          _sum: { total: true }
        }),
        this.prisma.purchaseBill.aggregate({
          where: {
            organizationId,
            status: { notIn: ["DRAFT", "VOID"] },
            ...(this.buildIssueDateFilter(dateRange)
              ? { issueDate: this.buildIssueDateFilter(dateRange) }
              : {})
          },
          _sum: { total: true }
        }),
        this.prisma.fixedAsset.aggregate({
          where: {
            organizationId,
            status: { not: "DISPOSED" },
            ...(dateRange.to
              ? {
                  purchaseDate: {
                    lte: dateRange.to
                  }
                }
              : {})
          },
          _sum: {
            cost: true,
            accumulatedDepreciation: true
          }
        }),
        this.prisma.depreciationRun.aggregate({
          where: {
            organizationId,
            ...(this.buildRunDateFilter(dateRange)
              ? { runDate: this.buildRunDateFilter(dateRange) }
              : {})
          },
          _sum: { depreciationAmount: true }
        }),
        this.prisma.journalEntryLine.findMany({
          where: {
            journalEntry: {
              organizationId,
              ...(this.buildEntryDateFilter(dateRange)
                ? { entryDate: this.buildEntryDateFilter(dateRange) }
                : {})
            }
          },
          include: {
            account: true
          }
        })
      ]);

    const entries: Array<{
      accountCode: string;
      accountName: string;
      accountType: TrialBalanceLineRecord["accountType"];
      debit: number;
      credit: number;
    }> = [];

    const pushEntry = (
      accountCode: string,
      accountName: string,
      accountType: TrialBalanceLineRecord["accountType"],
      debit: number,
      credit: number
    ) => {
      if (Math.abs(debit) < 0.0001 && Math.abs(credit) < 0.0001) {
        return;
      }

      entries.push({ accountCode, accountName, accountType, debit, credit });
    };

    pushEntry(
      "1000",
      "Cash at Bank",
      "ASSET",
      Number(bankSummary.totalClosingBalance),
      0
    );
    pushEntry(
      "1100",
      "Accounts Receivable",
      "ASSET",
      Number(payablesReceivables.totalReceivables),
      0
    );
    pushEntry(
      "1200",
      "Fixed Assets",
      "ASSET",
      Number(fixedAssets._sum.cost ?? 0),
      0
    );
    pushEntry(
      "1700",
      "Accumulated Depreciation",
      "ASSET",
      0,
      Number(fixedAssets._sum.accumulatedDepreciation ?? 0)
    );
    pushEntry(
      "2000",
      "Accounts Payable",
      "LIABILITY",
      0,
      Number(payablesReceivables.totalPayables)
    );
    pushEntry(
      "4000",
      "Sales Revenue",
      "REVENUE",
      0,
      Number(sales._sum.total ?? 0)
    );
    pushEntry(
      "5100",
      "Purchase Bills Expense",
      "EXPENSE",
      Number(bills._sum.total ?? 0),
      0
    );
    pushEntry(
      "5200",
      "Depreciation Expense",
      "EXPENSE",
      Number(depreciation._sum.depreciationAmount ?? 0),
      0
    );

    for (const line of journalLines) {
      pushEntry(
        line.account.code,
        line.account.name,
        line.account.type,
        Number(line.debit),
        Number(line.credit)
      );
    }

    const ledger = buildDerivedLedger({ entries });

    return {
      balanceSheet: ledger.balanceSheet,
      trialBalance: ledger.trialBalance
    };
  }

  private buildIssueDateFilter(dateRange: DateRangeFilter) {
    return buildDateRangeInput(dateRange);
  }

  private buildPaymentDateFilter(dateRange: DateRangeFilter) {
    return buildDateRangeInput(dateRange);
  }

  private buildSubmittedAtFilter(dateRange: DateRangeFilter) {
    return buildDateRangeInput(dateRange);
  }

  private buildNextRunFilter(dateRange: DateRangeFilter) {
    return buildDateRangeInput(dateRange);
  }

  private buildRunDateFilter(dateRange: DateRangeFilter) {
    return buildDateRangeInput(dateRange);
  }

  private buildEntryDateFilter(dateRange: DateRangeFilter) {
    return buildDateRangeInput(dateRange);
  }
}
