"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";

import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

function useApiBaseUrl() {
  return useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
}

export function BillingSummaryForm({
  endpoint,
  canWrite,
  initialValues
}: {
  endpoint: string;
  canWrite: boolean;
  initialValues: {
    stripeCustomerId: string;
    billingEmail: string;
    subscriptionId: string;
    planCode: string;
    status: string;
    seats: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
}) {
  const router = useRouter();
  const apiBaseUrl = useApiBaseUrl();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialValues);

  function setValue(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stripeCustomerId: form.stripeCustomerId || null,
          billingEmail: form.billingEmail || null,
          subscriptionId: form.subscriptionId || null,
          planCode: form.planCode,
          status: form.status,
          seats: Number(form.seats),
          currentPeriodStart: form.currentPeriodStart
            ? new Date(`${form.currentPeriodStart}T00:00:00.000Z`).toISOString()
            : null,
          currentPeriodEnd: form.currentPeriodEnd
            ? new Date(`${form.currentPeriodEnd}T00:00:00.000Z`).toISOString()
            : null,
          cancelAtPeriodEnd: form.cancelAtPeriodEnd
        })
      });

      if (!response.ok) {
        setError((await response.text()) || "Unable to update billing.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">Stripe Billing Summary</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["stripeCustomerId", "Stripe Customer ID", "text"],
            ["billingEmail", "Billing Email", "email"],
            ["subscriptionId", "Stripe Subscription ID", "text"],
            ["planCode", "Plan Code", "text"],
            ["status", "Status", "text"],
            ["seats", "Seats", "number"],
            ["currentPeriodStart", "Current Period Start", "date"],
            ["currentPeriodEnd", "Current Period End", "date"]
          ].map(([key, label, type]) => (
            <label className="block space-y-2 text-sm" key={key}>
              <span className="font-medium text-slate-700">{label}</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                disabled={!canWrite || isPending}
                onChange={(event) =>
                  setValue(key as keyof typeof form, event.target.value)
                }
                type={type}
                value={String(form[key as keyof typeof form])}
              />
            </label>
          ))}
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Cancel At Period End</span>
            <input
              checked={form.cancelAtPeriodEnd}
              disabled={!canWrite || isPending}
              onChange={(event) => setValue("cancelAtPeriodEnd", event.target.checked)}
              type="checkbox"
            />
          </label>
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <Button disabled={!canWrite || isPending} onClick={submit} type="button">
          {isPending ? "Saving..." : "Update Billing"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function BillingInvoiceForm({
  endpoint,
  canWrite
}: {
  endpoint: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const apiBaseUrl = useApiBaseUrl();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    stripeInvoiceId: "",
    invoiceNumber: "",
    status: "open",
    total: "0.00",
    currencyCode: "USD",
    issuedAt: "2026-05-01",
    dueAt: "2026-05-05",
    hostedInvoiceUrl: ""
  });

  function setValue(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          issuedAt: new Date(`${form.issuedAt}T00:00:00.000Z`).toISOString(),
          dueAt: form.dueAt
            ? new Date(`${form.dueAt}T00:00:00.000Z`).toISOString()
            : null,
          hostedInvoiceUrl: form.hostedInvoiceUrl || null
        })
      });

      if (!response.ok) {
        setError((await response.text()) || "Unable to create billing invoice.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">Add Billing Invoice</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["stripeInvoiceId", "Stripe Invoice ID", "text"],
            ["invoiceNumber", "Invoice Number", "text"],
            ["status", "Status", "text"],
            ["total", "Total", "number"],
            ["currencyCode", "Currency", "text"],
            ["issuedAt", "Issued At", "date"],
            ["dueAt", "Due At", "date"],
            ["hostedInvoiceUrl", "Hosted Invoice URL", "text"]
          ].map(([key, label, type]) => (
            <label className="block space-y-2 text-sm" key={key}>
              <span className="font-medium text-slate-700">{label}</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                disabled={!canWrite || isPending}
                onChange={(event) =>
                  setValue(key as keyof typeof form, event.target.value)
                }
                type={type}
                value={form[key as keyof typeof form]}
              />
            </label>
          ))}
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <Button disabled={!canWrite || isPending} onClick={submit} type="button">
          {isPending ? "Saving..." : "Create Invoice"}
        </Button>
      </CardContent>
    </Card>
  );
}
