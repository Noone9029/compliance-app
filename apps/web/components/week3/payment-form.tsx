"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";

import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

export function PaymentForm({
  title,
  endpoint,
  canWrite,
  defaultAmount,
  bankAccounts,
  readOnlyMessage
}: {
  title: string;
  endpoint: string;
  canWrite: boolean;
  defaultAmount: string;
  bankAccounts: {
    id: string;
    name: string;
    currencyCode: string;
  }[];
  readOnlyMessage?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [paymentDate, setPaymentDate] = useState("2026-04-12");
  const [amount, setAmount] = useState(defaultAmount);
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [method, setMethod] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const fieldClass =
    "w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900";
  const canSubmit = canWrite && bankAccounts.length > 0;

  function submit() {
    setError(null);

    if (!bankAccountId) {
      setError("Select a bank account before recording payment.");
      return;
    }

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          bankAccountId,
          paymentDate: new Date(`${paymentDate}T10:00:00.000Z`).toISOString(),
          amount,
          method,
          reference: reference || null,
          notes: notes || null
        })
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Unable to record payment.");
        return;
      }

      router.refresh();
      setAmount(defaultAmount);
      setReference("");
      setNotes("");
    });
  }

  return (
    <Card className="border-slate-100">
      <CardHeader>
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h3>
          <p className="text-sm leading-6 text-slate-500">
            Post a payment and recalculate the remaining balance.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700">Bank Account</span>
          <select
            className={fieldClass}
            disabled={!canSubmit || isPending}
            onChange={(event) => setBankAccountId(event.target.value)}
            value={bankAccountId}
          >
            {bankAccounts.length === 0 ? (
              <option value="">No active bank accounts available</option>
            ) : null}
            {bankAccounts.map((bankAccount) => (
              <option key={bankAccount.id} value={bankAccount.id}>
                {bankAccount.name} ({bankAccount.currencyCode})
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700">Payment Date</span>
          <input
            className={fieldClass}
            disabled={!canSubmit || isPending}
            onChange={(event) => setPaymentDate(event.target.value)}
            type="date"
            value={paymentDate}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700">Amount</span>
          <input
            className={fieldClass}
            disabled={!canSubmit || isPending}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            value={amount}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700">Method</span>
          <input
            className={fieldClass}
            disabled={!canSubmit || isPending}
            onChange={(event) => setMethod(event.target.value)}
            type="text"
            value={method}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700">Reference</span>
          <input
            className={fieldClass}
            disabled={!canSubmit || isPending}
            onChange={(event) => setReference(event.target.value)}
            type="text"
            value={reference}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700">Notes</span>
          <textarea
            className={`${fieldClass} min-h-24`}
            disabled={!canSubmit || isPending}
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </label>
        {!canWrite && readOnlyMessage ? (
          <p className="text-sm text-slate-500">{readOnlyMessage}</p>
        ) : null}
        {canWrite && bankAccounts.length === 0 ? (
          <p className="text-sm text-amber-700">
            Add an active bank account in settings before recording payments.
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <Button disabled={!canSubmit || isPending} onClick={submit} type="button">
          {isPending ? "Recording..." : "Record Payment"}
        </Button>
      </CardContent>
    </Card>
  );
}
