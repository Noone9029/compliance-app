"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";

import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

import { type LineState, LinesEditor } from "./lines-editor";

export function CreditNoteForm({
  title,
  description,
  endpoint,
  method,
  canWrite,
  submitLabel,
  contacts,
  linkedDocuments,
  linkedDocumentKey,
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
  linkedDocuments: { id: string; label: string }[];
  linkedDocumentKey: "salesInvoiceId" | "purchaseBillId";
  taxRates: { id: string; label: string }[];
  initialValues: {
    contactId: string;
    linkedDocumentId: string;
    creditNoteNumber: string;
    status: string;
    issueDate: string;
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
  const [linkedDocumentId, setLinkedDocumentId] = useState(initialValues.linkedDocumentId);
  const [creditNoteNumber, setCreditNoteNumber] = useState(initialValues.creditNoteNumber);
  const [status, setStatus] = useState(initialValues.status);
  const [issueDate, setIssueDate] = useState(initialValues.issueDate);
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
          creditNoteNumber: creditNoteNumber || null,
          status,
          issueDate: new Date(`${issueDate}T09:00:00.000Z`).toISOString(),
          currencyCode: currencyCode.toUpperCase(),
          notes: notes || null,
          [linkedDocumentKey]: linkedDocumentId || null,
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
        setError((await response.text()) || "Unable to save credit note.");
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
            <span className="font-medium text-slate-700">Linked Document</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setLinkedDocumentId(event.target.value)}
              value={linkedDocumentId}
            >
              <option value="">None</option>
              {linkedDocuments.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Credit Note Number</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setCreditNoteNumber(event.target.value)}
              type="text"
              value={creditNoteNumber}
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
              <option value="ISSUED">ISSUED</option>
              <option value="APPLIED">APPLIED</option>
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
