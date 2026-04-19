"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";

import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

import { type LineState, LinesEditor } from "./lines-editor";

export function PurchaseOrderForm({
  title,
  description,
  endpoint,
  method,
  canWrite,
  submitLabel,
  contacts,
  taxRates,
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
  contacts: { id: string; label: string }[];
  taxRates: { id: string; label: string }[];
  initialValues: {
    contactId: string;
    orderNumber: string;
    status: string;
    issueDate: string;
    expectedDate: string;
    currencyCode: string;
    notes: string;
    lines: LineState[];
  };
  redirectTo?: string;
  appendResultId?: boolean;
}) {
  const router = useRouter();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState(initialValues.contactId);
  const [orderNumber, setOrderNumber] = useState(initialValues.orderNumber);
  const [status, setStatus] = useState(initialValues.status);
  const [issueDate, setIssueDate] = useState(initialValues.issueDate);
  const [expectedDate, setExpectedDate] = useState(initialValues.expectedDate);
  const [currencyCode, setCurrencyCode] = useState(initialValues.currencyCode);
  const [notes, setNotes] = useState(initialValues.notes);
  const [lines, setLines] = useState<LineState[]>(
    initialValues.lines.length > 0
      ? initialValues.lines
      : [{ description: "", quantity: "1", unitPrice: "0.00", taxRateId: "" }]
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId,
          orderNumber: orderNumber || null,
          status,
          issueDate: new Date(`${issueDate}T09:00:00.000Z`).toISOString(),
          expectedDate: new Date(`${expectedDate}T09:00:00.000Z`).toISOString(),
          currencyCode: currencyCode.toUpperCase(),
          notes: notes || null,
          lines: lines
            .filter((line) => line.description.trim().length > 0)
            .map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              taxRateId: line.taxRateId || null
            }))
        })
      });

      if (!response.ok) {
        setError((await response.text()) || "Unable to save order.");
        return;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      if (redirectTo) {
        const target =
          appendResultId && typeof payload.id === "string"
            ? `${redirectTo}/${payload.id}`
            : redirectTo;
        router.push(target);
        return;
      }

      router.refresh();
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
            <span className="font-medium text-slate-700">Supplier</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2"
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
            <span className="font-medium text-slate-700">Order Number</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setOrderNumber(event.target.value)}
              type="text"
              value={orderNumber}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Status</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="DRAFT">DRAFT</option>
              <option value="SENT">SENT</option>
              <option value="RECEIVED">RECEIVED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Issue Date</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setIssueDate(event.target.value)}
              type="date"
              value={issueDate}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Expected Date</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setExpectedDate(event.target.value)}
              type="date"
              value={expectedDate}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Currency</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
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
            className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2"
            disabled={!canWrite || isPending}
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </label>
        <LinesEditor
          canWrite={canWrite}
          isPending={isPending}
          lines={lines}
          setLines={setLines}
          taxRates={taxRates}
        />
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <Button disabled={!canWrite || isPending} onClick={submit} type="button">
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
