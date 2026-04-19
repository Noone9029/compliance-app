import type {
  ComplianceDocumentStatus,
  PurchaseBillStatus,
  QuoteStatus,
  SalesInvoiceStatus
} from "@daftar/types";

export function money(value: string | number | null | undefined, currencyCode = "") {
  const normalized = Number(value ?? 0).toFixed(2);
  return currencyCode ? `${currencyCode} ${normalized}` : normalized;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export function toneForInvoiceStatus(status: SalesInvoiceStatus) {
  if (status === "PAID" || status === "REPORTED") {
    return "success" as const;
  }

  if (status === "PARTIALLY_PAID" || status === "ISSUED") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function toneForBillStatus(status: PurchaseBillStatus) {
  if (status === "PAID") {
    return "success" as const;
  }

  if (status === "PARTIALLY_PAID" || status === "APPROVED") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function toneForQuoteStatus(status: QuoteStatus) {
  if (status === "ACCEPTED" || status === "CONVERTED") {
    return "success" as const;
  }

  if (status === "SENT") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function toneForComplianceStatus(status: ComplianceDocumentStatus | null) {
  if (
    status === "CLEARED" ||
    status === "CLEARED_WITH_WARNINGS" ||
    status === "REPORTED" ||
    status === "REPORTED_WITH_WARNINGS"
  ) {
    return "success" as const;
  }

  if (
    status === "QUEUED" ||
    status === "READY" ||
    status === "PROCESSING" ||
    status === "RETRY_SCHEDULED"
  ) {
    return "warning" as const;
  }

  return "neutral" as const;
}
