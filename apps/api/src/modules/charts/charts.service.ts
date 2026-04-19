import { Inject, Injectable } from "@nestjs/common";
import type { ChartsDashboardRecord } from "@daftar/types";

import { type DateRangeFilter } from "../../common/utils/date-range";
import { ReportsService } from "../reports/reports.service";

@Injectable()
export class ChartsService {
  private readonly reportsService: ReportsService;

  constructor(@Inject(ReportsService) reportsService: ReportsService) {
    this.reportsService = reportsService;
  }

  async getDashboard(
    organizationId: string,
    dateRange: DateRangeFilter = {}
  ): Promise<ChartsDashboardRecord> {
    const reports = await this.reportsService.getDashboard(organizationId, dateRange);

    return {
      bankBalances: reports.bankSummary.accounts.map((account) => ({
        label: account.accountName,
        value: account.closingBalance
      })),
      balanceChart: [
        { label: "Assets", value: reports.balanceSheet.assets },
        { label: "Liabilities", value: reports.balanceSheet.liabilities },
        { label: "Equity", value: reports.balanceSheet.equity }
      ],
      profitLoss: [
        { label: "Revenue", value: reports.profitLoss.revenue },
        { label: "Expenses", value: reports.profitLoss.expenses },
        { label: "Profit", value: reports.profitLoss.profit }
      ],
      expenses: reports.expenseBreakdown.categories,
      receivablesPayables: [
        { label: "Receivables", value: reports.payablesReceivables.totalReceivables },
        { label: "Payables", value: reports.payablesReceivables.totalPayables }
      ],
      salesPurchases: reports.salesPurchasesSeries.map((point) => ({
        label: point.label,
        sales: point.salesTotal,
        purchases: point.purchasesTotal
      }))
    };
  }
}
