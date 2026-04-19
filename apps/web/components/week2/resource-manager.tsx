"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

type FormValue = string | boolean;
type FormState = Record<string, FormValue>;

type ResourceField =
  | {
      name: string;
      label: string;
      type: "text" | "number";
      placeholder?: string;
    }
  | {
      name: string;
      label: string;
      type: "textarea";
      placeholder?: string;
      rows?: number;
    }
  | {
      name: string;
      label: string;
      type: "checkbox";
    }
  | {
      name: string;
      label: string;
      type: "select";
      options: { label: string; value: string }[];
    };

type BadgeConfig = {
  field: string;
  trueLabel: string;
  falseLabel?: string;
  trueTone?: "neutral" | "success" | "warning";
  falseTone?: "neutral" | "success" | "warning";
};

type ResourceColumn =
  | {
      label: string;
      kind?: "text";
      field: string;
      empty?: string;
    }
  | {
      label: string;
      kind: "join-array";
      field: string;
      empty?: string;
    }
  | {
      label: string;
      kind: "join-array-field";
      field: string;
      nestedField: string;
      empty?: string;
    }
  | {
      label: string;
      kind: "badges";
      badges: BadgeConfig[];
    };

type ResourcePreset =
  | "tax-rates"
  | "tracking-categories"
  | "currencies"
  | "email-templates"
  | "connector-accounts"
  | "bank-accounts"
  | "chart-of-accounts"
  | "contact-groups";

export function ResourceManager<T extends { id: string }>({
  title,
  description,
  items,
  columns,
  fields,
  emptyState,
  createPath,
  updatePathBase,
  canWrite,
  createLabel = "Create",
  updateLabel = "Save changes",
  newItem,
  formsById,
  payloadPreset
}: {
  title: string;
  description: string;
  items: T[];
  columns: ResourceColumn[];
  fields: ResourceField[];
  emptyState: string;
  createPath: string;
  updatePathBase: string;
  canWrite: boolean;
  createLabel?: string;
  updateLabel?: string;
  newItem: FormState;
  formsById: Record<string, FormState>;
  payloadPreset: ResourcePreset;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(newItem);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const fieldClass =
    "w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900";

  const selectedItem = selectedId
    ? items.find((item) => item.id === selectedId) ?? null
    : null;

  function selectItem(item: T | null) {
    if (!item) {
      setSelectedId(null);
      setForm(newItem);
      return;
    }

    setSelectedId(item.id);
    setForm(formsById[item.id] ?? newItem);
  }

  function updateField(name: string, value: FormValue) {
    setForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const endpoint = selectedItem ? `${updatePathBase}/${selectedItem.id}` : createPath;
      const method = selectedItem ? "PATCH" : "POST";
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method,
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(buildPayload(payloadPreset, form))
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Request failed.");
        return;
      }

      setSelectedId(null);
      setForm(newItem);
      router.refresh();
    });
  }

  function renderColumn(item: T, column: ResourceColumn) {
    const record = item as Record<string, unknown>;

    if (column.kind === "join-array") {
      const value = record[column.field];
      return Array.isArray(value) && value.length > 0
        ? value.map(String).join(", ")
        : column.empty ?? "None";
    }

    if (column.kind === "join-array-field") {
      const value = record[column.field];
      if (!Array.isArray(value) || value.length === 0) {
        return column.empty ?? "None";
      }

      return value
        .map((entry) => {
          if (entry && typeof entry === "object") {
            return String((entry as Record<string, unknown>)[column.nestedField] ?? "");
          }

          return "";
        })
        .filter(Boolean)
        .join(", ");
    }

    if (column.kind === "badges") {
      return (
        <div className="flex gap-2">
          {column.badges.flatMap((badge) => {
            const rawValue = record[badge.field];
            const isTruthy = Boolean(rawValue);

            if (!isTruthy && !badge.falseLabel) {
              return [];
            }

            return [
              <StatusBadge
                key={`${badge.field}-${isTruthy ? "true" : "false"}`}
                label={isTruthy ? badge.trueLabel : badge.falseLabel ?? ""}
                tone={
                  isTruthy ? badge.trueTone ?? "neutral" : badge.falseTone ?? "neutral"
                }
              />
            ];
          })}
        </div>
      );
    }

    const value = record[column.field];
    return value == null || value === "" ? column.empty ?? "None" : String(value);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
      <Card className="border-slate-100">
        <CardHeader>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-sm text-slate-500">
              {emptyState}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-slate-200">
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    {columns.map((column) => (
                      <th className="px-4 py-3 font-medium" key={column.label}>
                        {column.label}
                      </th>
                    ))}
                    {canWrite ? <th className="px-4 py-3 font-medium">Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr className="transition hover:bg-slate-50/80" key={item.id}>
                      {columns.map((column) => (
                        <td className="px-4 py-3 align-top" key={column.label}>
                          {renderColumn(item, column)}
                        </td>
                      ))}
                      {canWrite ? (
                        <td className="px-4 py-3 align-top">
                          <button
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                            onClick={() => selectItem(item)}
                            type="button"
                          >
                            Edit
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-100">
        <CardHeader>
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
              {selectedItem ? "Edit record" : "New record"}
            </h3>
            <p className="text-sm leading-6 text-slate-500">
              {canWrite
                ? "Create and update records directly from the settings workspace."
                : "Your current role has read-only access."}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map((field) => (
            <label className="block space-y-2 text-sm" key={field.name}>
              <span className="font-medium text-slate-700">{field.label}</span>
              {field.type === "textarea" ? (
                <textarea
                  className={`${fieldClass} min-h-28`}
                  disabled={!canWrite || isPending}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  rows={field.rows ?? 4}
                  value={String(form[field.name] ?? "")}
                />
              ) : null}
              {field.type === "text" || field.type === "number" ? (
                <input
                  className={fieldClass}
                  disabled={!canWrite || isPending}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  type={field.type}
                  value={String(form[field.name] ?? "")}
                />
              ) : null}
              {field.type === "select" ? (
                <select
                  className={fieldClass}
                  disabled={!canWrite || isPending}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  value={String(form[field.name] ?? "")}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : null}
              {field.type === "checkbox" ? (
                <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    checked={Boolean(form[field.name])}
                    className="h-4 w-4 rounded border-slate-300"
                    disabled={!canWrite || isPending}
                    onChange={(event) => updateField(field.name, event.target.checked)}
                    type="checkbox"
                  />
                  <span className="text-sm text-slate-700">Enable this flag for the current record.</span>
                </span>
              ) : null}
            </label>
          ))}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button disabled={!canWrite || isPending} onClick={submit} type="button">
              {selectedItem ? updateLabel : createLabel}
            </Button>
            {selectedItem ? (
              <button
                className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
                disabled={!canWrite || isPending}
                onClick={() => selectItem(null)}
                type="button"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function buildPayload(
  preset: ResourcePreset,
  form: FormState
): Record<string, unknown> {
  switch (preset) {
    case "tax-rates":
      return {
        name: form.name,
        code: form.code || null,
        rate: form.rate,
        scope: form.scope,
        isDefault: Boolean(form.isDefault),
        isActive: Boolean(form.isActive)
      };
    case "tracking-categories":
      return {
        name: form.name,
        description: form.description || null,
        isActive: Boolean(form.isActive),
        options: String(form.optionsCsv || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, color] = line.split("|").map((value) => value.trim());
            return {
              name,
              color: color || null,
              isActive: true
            };
          })
      };
    case "currencies":
      return {
        code: String(form.code || "").toUpperCase(),
        name: form.name,
        symbol: form.symbol,
        exchangeRate: form.exchangeRate,
        isBase: Boolean(form.isBase),
        isActive: Boolean(form.isActive)
      };
    case "email-templates":
      return {
        key: form.key,
        name: form.name,
        subject: form.subject,
        body: form.body,
        isDefault: Boolean(form.isDefault),
        isActive: Boolean(form.isActive)
      };
    case "connector-accounts":
      return {
        provider: form.provider,
        displayName: form.displayName,
        status: form.status,
        externalTenantId: form.externalTenantId || null,
        scopes: String(form.scopesCsv || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        metadata: {}
      };
    case "bank-accounts":
      return {
        name: form.name,
        bankName: form.bankName,
        accountName: form.accountName,
        accountNumberMasked: form.accountNumberMasked,
        iban: form.iban || null,
        currencyCode: form.currencyCode,
        openingBalance: form.openingBalance,
        isPrimary: Boolean(form.isPrimary),
        isActive: Boolean(form.isActive)
      };
    case "chart-of-accounts":
      return {
        code: form.code,
        name: form.name,
        type: form.type,
        description: form.description || null,
        isSystem: Boolean(form.isSystem),
        isActive: Boolean(form.isActive)
      };
    case "contact-groups":
      return {
        name: form.name,
        description: form.description || null
      };
    default:
      return {};
  }
}
