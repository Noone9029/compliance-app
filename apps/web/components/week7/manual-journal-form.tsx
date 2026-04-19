"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";

import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

type JournalLineState = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
};

export function ManualJournalForm({
  title,
  description,
  endpoint,
  method,
  canWrite,
  accounts,
  initialValues,
  submitLabel,
  redirectTo,
  appendResultId = false,
}: {
  title: string;
  description: string;
  endpoint: string;
  method: "POST" | "PATCH";
  canWrite: boolean;
  accounts: { id: string; label: string }[];
  initialValues: {
    journalNumber: string;
    reference: string;
    entryDate: string;
    memo: string;
    lines: JournalLineState[];
  };
  submitLabel: string;
  redirectTo: string;
  appendResultId?: boolean;
}) {
  const router = useRouter();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    [],
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [journalNumber, setJournalNumber] = useState(
    initialValues.journalNumber,
  );
  const [reference, setReference] = useState(initialValues.reference);
  const [entryDate, setEntryDate] = useState(initialValues.entryDate);
  const [memo, setMemo] = useState(initialValues.memo);
  const [lines, setLines] = useState<JournalLineState[]>(
    initialValues.lines.length > 0
      ? initialValues.lines
      : [
          { accountId: "", description: "", debit: "0.00", credit: "0.00" },
          { accountId: "", description: "", debit: "0.00", credit: "0.00" },
        ],
  );

  const totalDebit = lines
    .reduce((sum, line) => sum + Number(line.debit || 0), 0)
    .toFixed(2);
  const totalCredit = lines
    .reduce((sum, line) => sum + Number(line.credit || 0), 0)
    .toFixed(2);

  function updateLine(
    index: number,
    key: keyof JournalLineState,
    value: string,
  ) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [key]: value,
            }
          : line,
      ),
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      {
        accountId: "",
        description: "",
        debit: "0.00",
        credit: "0.00",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) =>
      current.filter((_, lineIndex) => lineIndex !== index),
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          journalNumber: journalNumber || null,
          reference: reference || null,
          entryDate: new Date(`${entryDate}T00:00:00.000Z`).toISOString(),
          memo: memo || null,
          lines: lines.map((line) => ({
            accountId: line.accountId,
            description: line.description || null,
            debit: line.debit || "0.00",
            credit: line.credit || "0.00",
          })),
        }),
      });

      if (!response.ok) {
        setError((await response.text()) || "Unable to save manual journal.");
        return;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const nextPath =
        appendResultId && typeof payload.id === "string"
          ? `${redirectTo}/${payload.id}`
          : redirectTo;
      router.push(nextPath);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Journal Number</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setJournalNumber(event.target.value)}
              placeholder="Auto-generated if blank"
              type="text"
              value={journalNumber}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Entry Date</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setEntryDate(event.target.value)}
              type="date"
              value={entryDate}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Reference</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setReference(event.target.value)}
              type="text"
              value={reference}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Memo</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setMemo(event.target.value)}
              type="text"
              value={memo}
            />
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">
                Journal Lines
              </h4>
              <p className="text-xs text-slate-500">
                Enter balanced debit and credit lines against the chart of
                accounts.
              </p>
            </div>
            <button
              className="text-sm font-medium text-slate-700 underline underline-offset-4"
              disabled={!canWrite || isPending}
              onClick={addLine}
              type="button"
            >
              Add line
            </button>
          </div>

          {lines.map((line, index) => (
            <div
              className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1.4fr_1.5fr_0.8fr_0.8fr_auto]"
              key={`${index}-${line.accountId}-${line.description}`}
            >
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={!canWrite || isPending}
                onChange={(event) =>
                  updateLine(index, "accountId", event.target.value)
                }
                value={line.accountId}
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </select>
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={!canWrite || isPending}
                onChange={(event) =>
                  updateLine(index, "description", event.target.value)
                }
                placeholder="Line description"
                type="text"
                value={line.description}
              />
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={!canWrite || isPending}
                onChange={(event) =>
                  updateLine(index, "debit", event.target.value)
                }
                min="0"
                step="0.01"
                type="number"
                value={line.debit}
              />
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={!canWrite || isPending}
                onChange={(event) =>
                  updateLine(index, "credit", event.target.value)
                }
                min="0"
                step="0.01"
                type="number"
                value={line.credit}
              />
              <button
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                disabled={!canWrite || isPending || lines.length <= 2}
                onClick={() => removeLine(index)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="font-medium text-slate-700">Total Debit</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {totalDebit}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="font-medium text-slate-700">Total Credit</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {totalCredit}
            </p>
          </div>
        </div>

        {Number(totalDebit) !== Number(totalCredit) ? (
          <p className="text-sm text-amber-700">
            Debit and credit totals must balance before the journal can be
            saved.
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <Button
          disabled={!canWrite || isPending}
          onClick={submit}
          type="button"
        >
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
