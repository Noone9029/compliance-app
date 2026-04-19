"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";

import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

type LineState = {
  inventoryItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateId: string;
};

type InventoryItemOption = {
  id: string;
  label: string;
  itemName: string;
  costPrice: string;
  salePrice: string;
};

export function DocumentForm({
  title,
  description,
  endpoint,
  method,
  canWrite,
  submitLabel,
  numberField,
  dateFields,
  statusOptions,
  contacts,
  taxRates,
  inventoryItems,
  inventoryPriceField = "salePrice",
  includeComplianceKind = false,
  initialValues,
  redirectTo,
  appendResultId = false
}: {
  title: string;
  description: string;
  endpoint: string;
  method: "POST" | "PATCH";
  canWrite: boolean;
  submitLabel: string;
  numberField: {
    name: "invoiceNumber" | "billNumber" | "quoteNumber";
    label: string;
  };
  dateFields: [
    { name: "issueDate"; label: string },
    { name: "dueDate" | "expiryDate"; label: string }
  ];
  statusOptions: { label: string; value: string }[];
  contacts: { id: string; label: string }[];
  taxRates: { id: string; label: string }[];
  inventoryItems: InventoryItemOption[];
  inventoryPriceField?: "costPrice" | "salePrice";
  includeComplianceKind?: boolean;
  initialValues: {
    contactId: string;
    numberValue: string;
    status: string;
    issueDate: string;
    dueOrExpiryDate: string;
    currencyCode: string;
    notes: string;
    complianceInvoiceKind?: string;
    lines: LineState[];
  };
  redirectTo?: string;
  appendResultId?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState(initialValues.contactId);
  const [numberValue, setNumberValue] = useState(initialValues.numberValue);
  const [status, setStatus] = useState(initialValues.status);
  const [issueDate, setIssueDate] = useState(initialValues.issueDate);
  const [dueOrExpiryDate, setDueOrExpiryDate] = useState(initialValues.dueOrExpiryDate);
  const [currencyCode, setCurrencyCode] = useState(initialValues.currencyCode);
  const [notes, setNotes] = useState(initialValues.notes);
  const [complianceInvoiceKind, setComplianceInvoiceKind] = useState(
    initialValues.complianceInvoiceKind ?? "STANDARD"
  );
  const inventoryItemMap = useMemo(
    () => new Map(inventoryItems.map((item) => [item.id, item])),
    [inventoryItems]
  );
  const [lines, setLines] = useState<LineState[]>(
    initialValues.lines.length > 0
      ? initialValues.lines
      : [
          {
            inventoryItemId: "",
            description: "",
            quantity: "1",
            unitPrice: "0.00",
            taxRateId: ""
          }
        ]
  );
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const fieldClass =
    "w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900";

  function updateLine(index: number, key: keyof LineState, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [key]: value
            }
          : line
      )
    );
  }

  function updateInventoryItem(index: number, inventoryItemId: string) {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }

        const inventoryItem = inventoryItemMap.get(inventoryItemId);
        if (!inventoryItem) {
          return {
            ...line,
            inventoryItemId: ""
          };
        }

        return {
          ...line,
          inventoryItemId,
          description: inventoryItem.itemName,
          unitPrice: inventoryItem[inventoryPriceField]
        };
      })
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      {
        inventoryItemId: "",
        description: "",
        quantity: "1",
        unitPrice: "0.00",
        taxRateId: ""
      }
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const payload: Record<string, unknown> = {
        contactId,
        [numberField.name]: numberValue || null,
        status,
        issueDate: new Date(`${issueDate}T09:00:00.000Z`).toISOString(),
        [dateFields[1].name]: new Date(`${dueOrExpiryDate}T09:00:00.000Z`).toISOString(),
        currencyCode: currencyCode.toUpperCase(),
        notes: notes || null,
        lines: lines
          .filter((line) => line.description.trim().length > 0 || line.inventoryItemId)
          .map((line) => ({
            description: line.description,
            inventoryItemId: line.inventoryItemId || null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRateId: line.taxRateId || null
          }))
      };

      if (includeComplianceKind) {
        payload.complianceInvoiceKind = complianceInvoiceKind;
      }

      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method,
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Unable to save document.");
        return;
      }

      const result = (await response.json()) as Record<string, unknown>;

      if (redirectTo) {
        const target =
          appendResultId && typeof result.id === "string"
            ? `${redirectTo}/${result.id}`
            : redirectTo;
        router.push(target);
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card className="border-slate-100">
      <CardHeader>
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h3>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Contact</span>
            <select
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => setContactId(event.target.value)}
              value={contactId}
            >
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">{numberField.label}</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => setNumberValue(event.target.value)}
              type="text"
              value={numberValue}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Status</span>
            <select
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {includeComplianceKind ? (
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Compliance Kind</span>
              <select
                className={fieldClass}
                disabled={!canWrite || isPending}
                onChange={(event) => setComplianceInvoiceKind(event.target.value)}
                value={complianceInvoiceKind}
              >
                <option value="STANDARD">Standard</option>
                <option value="SIMPLIFIED">Simplified</option>
              </select>
            </label>
          ) : null}
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">{dateFields[0].label}</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => setIssueDate(event.target.value)}
              type="date"
              value={issueDate}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">{dateFields[1].label}</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => setDueOrExpiryDate(event.target.value)}
              type="date"
              value={dueOrExpiryDate}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Currency</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => setCurrencyCode(event.target.value)}
              type="text"
              value={currencyCode}
            />
          </label>
        </div>

        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700">Notes</span>
          <textarea
            className={`${fieldClass} min-h-28`}
            disabled={!canWrite || isPending}
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Line Items</h4>
            <button
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
              disabled={!canWrite || isPending}
              onClick={addLine}
              type="button"
            >
              Add line
            </button>
          </div>
          {lines.map((line, index) => (
            <div
              className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.2fr_1.8fr_0.8fr_0.9fr_1fr_auto]"
              key={`${index}-${line.description}`}
            >
              <select
                className={fieldClass}
                disabled={!canWrite || isPending}
                onChange={(event) => updateInventoryItem(index, event.target.value)}
                value={line.inventoryItemId}
              >
                <option value="">Custom line item</option>
                {inventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                className={fieldClass}
                disabled={!canWrite || isPending}
                onChange={(event) => updateLine(index, "description", event.target.value)}
                placeholder="Description"
                type="text"
                value={line.description}
              />
              <input
                className={fieldClass}
                disabled={!canWrite || isPending}
                onChange={(event) => updateLine(index, "quantity", event.target.value)}
                placeholder="Qty"
                type="number"
                value={line.quantity}
              />
              <input
                className={fieldClass}
                disabled={!canWrite || isPending}
                onChange={(event) => updateLine(index, "unitPrice", event.target.value)}
                placeholder="Unit price"
                type="number"
                value={line.unitPrice}
              />
              <select
                className={fieldClass}
                disabled={!canWrite || isPending}
                onChange={(event) => updateLine(index, "taxRateId", event.target.value)}
                value={line.taxRateId}
              >
                <option value="">No tax</option>
                {taxRates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.label}
                  </option>
                ))}
              </select>
              <button
                className="rounded-2xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700"
                disabled={!canWrite || isPending || lines.length === 1}
                onClick={() => removeLine(index)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button disabled={!canWrite || isPending} onClick={submit} type="button">
            {isPending ? "Saving..." : submitLabel}
          </Button>
          {!canWrite ? <span className="text-sm text-slate-500">Read-only access</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
