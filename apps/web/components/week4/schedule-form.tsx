"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";

import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

import { type LineState, LinesEditor } from "./lines-editor";

export function ScheduleForm({
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
    templateName: string;
    status: string;
    frequencyLabel: string;
    intervalCount: string;
    nextRunAt: string;
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
  const [templateName, setTemplateName] = useState(initialValues.templateName);
  const [status, setStatus] = useState(initialValues.status);
  const [frequencyLabel, setFrequencyLabel] = useState(initialValues.frequencyLabel);
  const [intervalCount, setIntervalCount] = useState(initialValues.intervalCount);
  const [nextRunAt, setNextRunAt] = useState(initialValues.nextRunAt);
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
          templateName,
          status,
          frequencyLabel,
          intervalCount: Number(intervalCount || 1),
          nextRunAt: new Date(`${nextRunAt}T09:00:00.000Z`).toISOString(),
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
        setError((await response.text()) || "Unable to save schedule.");
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
            <span className="font-medium text-slate-700">Contact</span>
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
            <span className="font-medium text-slate-700">Template Name</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setTemplateName(event.target.value)}
              type="text"
              value={templateName}
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
              <option value="ACTIVE">ACTIVE</option>
              <option value="PAUSED">PAUSED</option>
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Frequency</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setFrequencyLabel(event.target.value)}
              type="text"
              value={frequencyLabel}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Interval Count</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setIntervalCount(event.target.value)}
              type="number"
              value={intervalCount}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Next Run</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setNextRunAt(event.target.value)}
              type="date"
              value={nextRunAt}
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
