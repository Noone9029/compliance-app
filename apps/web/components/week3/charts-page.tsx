import React from "react";
import type { ChartPointRecord, ChartsDashboardRecord } from "@daftar/types";
import { Card, CardContent, CardHeader } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { money } from "./shared";

export async function renderChartsPage() {
  const charts = await fetchServerJson<ChartsDashboardRecord>("/v1/charts/dashboard");

  return (
    <div className="space-y-6">
      <ChartCard
        points={charts.bankBalances}
        subtitle="Closing balances using opening balances plus posted cash movement."
        title="Bank Balance"
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          points={charts.balanceChart}
          subtitle="Assets, liabilities, and equity derived from live receivable/payable positions."
          title="Balance Chart"
        />
        <ChartCard
          points={charts.profitLoss}
          subtitle="Revenue, expenses, and profit sourced from live documents."
          title="Profit and Loss"
        />
        <ChartCard
          points={charts.receivablesPayables}
          subtitle="Overview cards for receivables versus payables."
          title="Receivables vs Payables"
        />
        <ChartCard
          points={charts.expenses}
          subtitle="Expense breakdown combining bills and depreciation."
          title="Expenses"
        />
      </div>
      <Card>
        <CardHeader>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Sales and Purchases</h2>
            <p className="text-sm text-slate-500">
              Monthly chart points based on live sales and purchase activity.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {charts.salesPurchases.map((point) => (
              <div className="rounded-lg border border-slate-200 p-4" key={point.label}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-800">{point.label}</p>
                  <div className="text-sm text-slate-500">
                    <span>Sales {money(point.sales)}</span>
                    <span className="mx-2">•</span>
                    <span>Purchases {money(point.purchases)}</span>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  <Bar label="Sales" points={charts.salesPurchases.map((entry) => ({
                    label: entry.label,
                    value: entry.sales
                  }))} currentLabel={point.label} />
                  <Bar
                    label="Purchases"
                    points={charts.salesPurchases.map((entry) => ({
                      label: entry.label,
                      value: entry.purchases
                    }))}
                    currentLabel={point.label}
                    tone="amber"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  points
}: {
  title: string;
  subtitle: string;
  points: ChartPointRecord[];
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
        {points.map((point) => (
          <Bar currentLabel={point.label} key={point.label} label={point.label} points={points} />
        ))}
      </CardContent>
    </Card>
  );
}

function Bar({
  label,
  currentLabel,
  points,
  tone = "slate"
}: {
  label: string;
  currentLabel: string;
  points: ChartPointRecord[];
  tone?: "slate" | "amber";
}) {
  const current = points.find((point) => point.label === currentLabel)!;
  const max = Math.max(...points.map((point) => Number(point.value)), 1);
  const width = `${Math.max((Number(current.value) / max) * 100, 6)}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{money(current.value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={tone === "amber" ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-slate-900"}
          style={{ width }}
        />
      </div>
    </div>
  );
}
