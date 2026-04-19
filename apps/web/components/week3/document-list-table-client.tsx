"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { StatusBadge } from "@daftar/ui";

import { presentContactName } from "../presentation";
import { formatDate } from "./shared";

type StatusTone = React.ComponentProps<typeof StatusBadge>["tone"];

type DocumentListRow = {
  id: string;
  href: string;
  number: string;
  contactName: string;
  contactEmail: string | null;
  issueDate: string;
  amountDue: string;
  statusBadges: { label: string; tone: StatusTone }[];
  downloadHref: string;
};

function actionPill(disabled = false) {
  return [
    "inline-flex items-center rounded-2xl border px-3 py-2 text-xs font-semibold transition",
    disabled
      ? "border-slate-200 bg-slate-100 text-slate-400"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
  ].join(" ");
}

function buildEmailHref(
  contactEmail: string | null,
  documentLabel: string,
  number: string
) {
  if (!contactEmail) {
    return null;
  }

  const subject = encodeURIComponent(`${documentLabel} ${number}`);
  const body = encodeURIComponent(`Please review ${documentLabel.toLowerCase()} ${number}.`);
  return `mailto:${contactEmail}?subject=${subject}&body=${body}`;
}

function buildBulkEmailHref(documentLabel: string, rows: DocumentListRow[]) {
  const recipients = Array.from(
    new Set(
      rows
        .map((row) => row.contactEmail?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

  if (recipients.length === 0) {
    return null;
  }

  const subject = encodeURIComponent(`${documentLabel}s ready for review`);
  const body = encodeURIComponent(
    `Please review the following ${documentLabel.toLowerCase()}s:\n${rows
      .map((row) => `- ${row.number} (${presentContactName(row.contactName)})`)
      .join("\n")}`
  );
  return `mailto:${recipients.join(",")}?subject=${subject}&body=${body}`;
}

export function DocumentListTableClient({
  documentLabel,
  rows
}: {
  documentLabel: string;
  rows: DocumentListRow[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const bulkEmailHref = buildBulkEmailHref(documentLabel, selectedRows);

  function toggleSelected(rowId: string) {
    setSelectedIds((current) =>
      current.includes(rowId)
        ? current.filter((selectedId) => selectedId !== rowId)
        : [...current, rowId]
    );
  }

  function toggleAll(nextChecked: boolean) {
    setSelectedIds(nextChecked ? rows.map((row) => row.id) : []);
  }

  function downloadSelected() {
    for (const row of selectedRows) {
      window.open(row.downloadHref, "_blank", "noopener,noreferrer");
    }
  }

  function emailSelected() {
    if (!bulkEmailHref) {
      return;
    }

    window.location.href = bulkEmailHref;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-12 text-center">
        <p className="text-sm font-medium text-slate-900">
          No documents match the current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4">
        <p className="text-sm text-slate-600">
          {selectedRows.length > 0
            ? `${selectedRows.length} ${documentLabel.toLowerCase()}${
                selectedRows.length === 1 ? "" : "s"
              } selected`
            : `Select ${documentLabel.toLowerCase()}s for bulk actions`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={actionPill(selectedRows.length === 0)}
            disabled={selectedRows.length === 0}
            onClick={downloadSelected}
            type="button"
          >
            Download selected
          </button>
          <button
            className={actionPill(!bulkEmailHref)}
            disabled={!bulkEmailHref}
            onClick={emailSelected}
            type="button"
          >
            Email selected
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">
                <input
                  aria-label={`Select all ${documentLabel.toLowerCase()}s`}
                  checked={allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  type="checkbox"
                />
              </th>
              <th className="px-4 py-3 font-medium">Document</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Amount Due</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const emailHref = buildEmailHref(row.contactEmail, documentLabel, row.number);

              return (
                <tr className="transition hover:bg-slate-50/80" key={row.id}>
                  <td className="px-4 py-3 align-top">
                    <input
                      aria-label={`Select ${row.number}`}
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleSelected(row.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-slate-800 underline underline-offset-4"
                      href={row.href}
                    >
                      {row.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{presentContactName(row.contactName)}</td>
                  <td className="px-4 py-3">{formatDate(row.issueDate)}</td>
                  <td className="px-4 py-3">{row.amountDue}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {row.statusBadges.map((badge) => (
                        <StatusBadge
                          key={`${row.id}-${badge.label}`}
                          label={badge.label}
                          tone={badge.tone}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <a className={actionPill(false)} href={row.downloadHref}>
                        Download
                      </a>
                      {emailHref ? (
                        <a className={actionPill(false)} href={emailHref}>
                          Email
                        </a>
                      ) : (
                        <span className={actionPill(true)}>Email</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
