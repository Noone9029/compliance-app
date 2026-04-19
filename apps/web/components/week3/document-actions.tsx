"use client";

import React, { useMemo } from "react";

import { Button } from "@daftar/ui";

import { presentContactName } from "../presentation";
import { ActionButton } from "./action-button";

function actionLinkClass(disabled = false) {
  return [
    "inline-flex items-center justify-center rounded-2xl border px-3.5 py-2.5 text-sm font-semibold transition",
    disabled
      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
      : "border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-500"
  ].join(" ");
}

function buildEmailHref(input: {
  contactEmail: string | null;
  documentNumber: string;
  contactName: string;
  label: string;
}) {
  if (!input.contactEmail) {
    return null;
  }

  const subject = encodeURIComponent(`${input.label} ${input.documentNumber}`);
  const body = encodeURIComponent(
    `Hello ${presentContactName(input.contactName)},%0D%0A%0D%0APlease find ${input.label.toLowerCase()} ${input.documentNumber}.`
  );
  return `mailto:${input.contactEmail}?subject=${subject}&body=${body}`;
}

function buildWhatsAppHref(input: {
  documentNumber: string;
  contactName: string;
  label: string;
}) {
  const message = encodeURIComponent(
    `Hello ${presentContactName(input.contactName)}, ${input.label} ${input.documentNumber} is ready for review.`
  );
  return `https://wa.me/?text=${message}`;
}

export function DocumentActions(props: {
  kind: "sales" | "purchases" | "quotes";
  documentId: string;
  documentNumber: string;
  documentLabel: string;
  contactName: string;
  contactEmail: string | null;
  attachmentCount: number;
  canWrite: boolean;
  canReport?: boolean;
  showReportAction?: boolean;
  showPaymentAction?: boolean;
}) {
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const exportBase =
    props.kind === "sales"
      ? `${apiBaseUrl}/v1/sales/invoices/${props.documentId}/export`
      : props.kind === "purchases"
        ? `${apiBaseUrl}/v1/purchases/bills/${props.documentId}/export`
        : `${apiBaseUrl}/v1/quotes/${props.documentId}/export`;
  const emailHref = buildEmailHref({
    contactEmail: props.contactEmail,
    documentNumber: props.documentNumber,
    contactName: props.contactName,
    label: props.documentLabel
  });
  const whatsappHref = buildWhatsAppHref({
    documentNumber: props.documentNumber,
    contactName: props.contactName,
    label: props.documentLabel
  });

  return (
    <div className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {props.showReportAction && props.kind === "sales" ? (
            <ActionButton
              canWrite={props.canReport ?? false}
              endpoint={`/v1/compliance/invoices/${props.documentId}/report`}
              label="Report to ZATCA"
              pendingLabel="Reporting..."
            />
          ) : null}
          {props.kind === "sales" ? (
            <a className={actionLinkClass(false)} href={`${exportBase}?variant=packing-slip`}>
              Packing Slip
            </a>
          ) : null}
          <a className={actionLinkClass(false)} href="#attachments">
            {`Files (${props.attachmentCount})`}
          </a>
        </div>

        <div className="flex flex-wrap gap-2">
          <a className={actionLinkClass(false)} href={`${exportBase}?variant=full`}>
            Download
          </a>
          {emailHref ? (
            <a className={actionLinkClass(false)} href={emailHref}>
              Email
            </a>
          ) : (
            <span className={actionLinkClass(true)}>Email</span>
          )}
          <a className={actionLinkClass(false)} href={`${exportBase}?variant=small`}>
            Small {props.documentLabel}
          </a>
          <a
            className={actionLinkClass(false)}
            href={whatsappHref}
            rel="noreferrer"
            target="_blank"
          >
            Whatsapp
          </a>
          <details className="relative">
            <summary className={actionLinkClass(false)}>Options</summary>
            <div className="absolute right-0 z-10 mt-2 min-w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              <a
                className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                href={`${exportBase}?variant=full`}
              >
                Download PDF
              </a>
              <a
                className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                href="#attachments"
              >
                View files
              </a>
              {props.showPaymentAction ? (
                <a
                  className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  href="#payment-form"
                >
                  Jump to payment
                </a>
              ) : null}
            </div>
          </details>
          {props.showPaymentAction ? (
            <a className={actionLinkClass(!props.canWrite)} href="#payment-form">
              Add Payment
            </a>
          ) : null}
        </div>
      </div>

      {!props.contactEmail ? (
        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Contact email is not recorded, so the email action opens only after the contact is updated.
        </div>
      ) : null}
    </div>
  );
}
