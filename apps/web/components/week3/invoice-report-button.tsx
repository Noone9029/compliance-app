"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";
import type { SalesInvoiceDetail } from "@daftar/types";

function summaryClass(disabled = false) {
  return [
    "inline-flex min-h-10 list-none items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition",
    disabled
      ? "cursor-not-allowed bg-slate-200 text-slate-400"
      : "cursor-pointer bg-slate-600 text-white hover:bg-slate-500",
    "[&::-webkit-details-marker]:hidden",
  ].join(" ");
}

function menuItemClass(disabled = false) {
  return [
    "block rounded-md px-3 py-2 text-sm",
    disabled
      ? "cursor-not-allowed text-slate-400"
      : "text-slate-700 transition hover:bg-slate-50 hover:text-slate-950",
  ].join(" ");
}

function labelForStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function InvoiceReportButton(props: {
  invoiceId: string;
  canReport: boolean;
  compliance: SalesInvoiceDetail["compliance"];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    [],
  );
  const compliance = props.compliance;

  function submit(path: string) {
    if (!props.canReport) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Unable to submit invoice.");
        return;
      }

      router.refresh();
    });
  }

  if (compliance) {
    const isProcessing = ["QUEUED", "PROCESSING", "RETRY_SCHEDULED"].includes(
      compliance.status,
    );
    const actionLabel = compliance.retryAllowed
      ? "Retry ZATCA Submission"
      : `ZATCA ${labelForStatus(compliance.status)}`;

    if (compliance.retryAllowed) {
      return (
        <div className="space-y-2">
          <button
            className={[
              "inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition",
              props.canReport
                ? "bg-slate-600 text-white hover:bg-slate-500"
                : "cursor-not-allowed bg-slate-200 text-slate-400",
            ].join(" ")}
            disabled={!props.canReport || isPending}
            onClick={() => submit(`/v1/compliance/invoices/${props.invoiceId}/retry`)}
            type="button"
          >
            {isPending ? "Retrying..." : actionLabel}
          </button>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
      );
    }

    return (
      <details className="relative">
        <summary className={summaryClass(isProcessing)}>
          {isProcessing ? actionLabel : `ZATCA ${labelForStatus(compliance.status)}`}
        </summary>
        <div className="absolute left-0 top-full z-20 mt-2 min-w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_22px_50px_-30px_rgba(15,23,42,0.35)]">
          <a className={menuItemClass(false)} href="#compliance-response">
            View Timeline
          </a>
          {compliance.xmlAvailable ? (
            <a
              className={menuItemClass(false)}
              href={`${apiBaseUrl}/v1/compliance/invoices/${props.invoiceId}/xml`}
            >
              Download XML
            </a>
          ) : (
            <span className={menuItemClass(true)}>Download XML</span>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-2">
      <button
        className={[
          "inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition",
          props.canReport
            ? "bg-slate-600 text-white hover:bg-slate-500"
            : "cursor-not-allowed bg-slate-200 text-slate-400",
        ].join(" ")}
        disabled={!props.canReport || isPending}
        onClick={() => submit(`/v1/compliance/invoices/${props.invoiceId}/report`)}
        type="button"
      >
        {isPending ? "Submitting..." : "Submit to ZATCA"}
      </button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
