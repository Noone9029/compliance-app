import React from "react";
import type { AccountRecord, BankAccountRecord } from "@daftar/types";
import { StatusBadge } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { hasPermission, getCapabilities } from "./route-utils";
import { ResourceManager } from "./resource-manager";

export async function renderAccountingSetupPage(
  routeKey: "accounting-bank-accounts" | "accounting-chart-of-accounts"
) {
  if (routeKey === "accounting-bank-accounts") {
    const capabilities = await getCapabilities();
    const bankAccounts = await fetchServerJson<BankAccountRecord[]>(
      "/v1/setup/bank-accounts"
    );

    return (
      <ResourceManager
        canWrite={hasPermission(capabilities, "setup.write")}
        columns={[
          { label: "Name", field: "name" },
          { label: "Bank", field: "bankName" },
          { label: "Currency", field: "currencyCode" },
          { label: "Opening Balance", field: "openingBalance" },
          {
            label: "Flags",
            kind: "badges",
            badges: [
              { field: "isPrimary", trueLabel: "Primary", trueTone: "success" },
              {
                field: "isActive",
                trueLabel: "Active",
                falseLabel: "Inactive",
                trueTone: "success",
                falseTone: "warning"
              }
            ]
          }
        ]}
        createPath="/v1/setup/bank-accounts"
        description="Maintain organization bank accounts used by downstream accounting modules."
        emptyState="No bank accounts configured."
        fields={[
          { name: "name", label: "Name", type: "text" },
          { name: "bankName", label: "Bank Name", type: "text" },
          { name: "accountName", label: "Account Name", type: "text" },
          { name: "accountNumberMasked", label: "Account Number", type: "text" },
          { name: "iban", label: "IBAN", type: "text" },
          { name: "currencyCode", label: "Currency Code", type: "text" },
          { name: "openingBalance", label: "Opening Balance", type: "number" },
          { name: "isPrimary", label: "Primary", type: "checkbox" },
          { name: "isActive", label: "Active", type: "checkbox" }
        ]}
        items={bankAccounts}
        formsById={Object.fromEntries(
          bankAccounts.map((item) => [
            item.id,
            {
              name: item.name,
              bankName: item.bankName,
              accountName: item.accountName,
              accountNumberMasked: item.accountNumberMasked,
              iban: item.iban ?? "",
              currencyCode: item.currencyCode,
              openingBalance: item.openingBalance,
              isPrimary: item.isPrimary,
              isActive: item.isActive
            }
          ])
        )}
        newItem={{
          name: "",
          bankName: "",
          accountName: "",
          accountNumberMasked: "",
          iban: "",
          currencyCode: "SAR",
          openingBalance: "0.00",
          isPrimary: false,
          isActive: true
        }}
        payloadPreset="bank-accounts"
        title="Bank Accounts"
        updatePathBase="/v1/setup/bank-accounts"
      />
    );
  }

  const capabilities = await getCapabilities();
  const accounts = await fetchServerJson<AccountRecord[]>("/v1/setup/chart-of-accounts");

  return (
    <ResourceManager
      canWrite={hasPermission(capabilities, "setup.write")}
      columns={[
        { label: "Code", field: "code" },
        { label: "Name", field: "name" },
        { label: "Type", field: "type" },
        { label: "Description", field: "description", empty: "None" },
        {
          label: "Flags",
          kind: "badges",
          badges: [
            { field: "isSystem", trueLabel: "System", trueTone: "warning" },
            {
              field: "isActive",
              trueLabel: "Active",
              falseLabel: "Inactive",
              trueTone: "success",
              falseTone: "warning"
            }
          ]
        }
      ]}
      createPath="/v1/setup/chart-of-accounts"
      description="Maintain the chart of accounts used across your accounting workflows."
      emptyState="No accounts configured."
      fields={[
        { name: "code", label: "Code", type: "text" },
        { name: "name", label: "Name", type: "text" },
        {
          name: "type",
          label: "Type",
          type: "select",
          options: [
            { label: "Asset", value: "ASSET" },
            { label: "Liability", value: "LIABILITY" },
            { label: "Equity", value: "EQUITY" },
            { label: "Revenue", value: "REVENUE" },
            { label: "Expense", value: "EXPENSE" }
          ]
        },
        { name: "description", label: "Description", type: "textarea", rows: 4 },
        { name: "isSystem", label: "System", type: "checkbox" },
        { name: "isActive", label: "Active", type: "checkbox" }
      ]}
      items={accounts}
      formsById={Object.fromEntries(
        accounts.map((item) => [
          item.id,
          {
            code: item.code,
            name: item.name,
            type: item.type,
            description: item.description ?? "",
            isSystem: item.isSystem,
            isActive: item.isActive
          }
        ])
      )}
      newItem={{
        code: "",
        name: "",
        type: "ASSET",
        description: "",
        isSystem: false,
        isActive: true
      }}
      payloadPreset="chart-of-accounts"
      title="Chart of Accounts"
      updatePathBase="/v1/setup/chart-of-accounts"
    />
  );
}
