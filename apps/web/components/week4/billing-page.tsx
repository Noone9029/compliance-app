import React from "react";
import type {
  BillingInvoiceRecord,
  BillingPlanRecord,
  BillingSummaryRecord,
  OrganizationTaxDetailRecord
} from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";
import { notFound } from "next/navigation";

import { fetchServerJson } from "../api";
import { presentEmail, presentOrganizationName } from "../presentation";
import { getCapabilities, hasPermission } from "../week2/route-utils";
import { formatDate, money } from "../week3/shared";

type SubscriptionSection = "summary" | "billing" | "add-ons" | "invoices";

const subscriptionSections: Array<{
  key: SubscriptionSection;
  label: string;
}> = [
  { key: "summary", label: "Subscription Plan Details" },
  { key: "billing", label: "Billing Account" },
  { key: "add-ons", label: "Add-Ons" },
  { key: "invoices", label: "Invoices" }
];

export async function renderBillingPage(orgSlug: string, segments: string[]) {
  const section = normalizeSection(segments[1]);

  if (!section) {
    notFound();
  }

  const capabilities = await getCapabilities();

  if (!hasPermission(capabilities, "billing.read")) {
    return (
      <Card>
        <CardHeader>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-slate-900">Subscription</h2>
            <p className="text-sm text-slate-500">
              Your current role does not include billing access for this workspace.
            </p>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const [summary, invoices, plans, taxDetail] = await Promise.all([
    fetchServerJson<BillingSummaryRecord>("/v1/billing/summary"),
    fetchServerJson<BillingInvoiceRecord[]>("/v1/billing/invoices"),
    fetchServerJson<BillingPlanRecord[]>("/v1/billing/plans"),
    fetchServerJson<OrganizationTaxDetailRecord | null>("/v1/setup/organisation-tax-details").catch(
      () => null
    )
  ]);
  const activePlan = plans.find((plan) => plan.code === summary.planCode) ?? null;
  const billingCycle = describeBillingCycle(summary);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-gradient-to-b from-white via-white to-slate-50 shadow-sm">
        <CardContent className="space-y-8 px-6 py-8 sm:px-10">
          <div className="space-y-6">
            <a
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition hover:text-emerald-700"
              href={`/${orgSlug}`}
            >
              <span aria-hidden="true">←</span>
              Back to workspace
            </a>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
                  Billing Overview
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  Subscription and invoice history
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-500">
                  This workspace shows the current billing state and recorded invoice history.
                  Self-service subscription changes are not enabled here.
                </p>
              </div>
            </div>

            <nav aria-label="Subscription sections" className="border-b border-slate-200">
              <div className="flex flex-wrap gap-2">
                {subscriptionSections.map((item) => (
                  <a
                    className={[
                      "rounded-t-xl border border-b-0 px-4 py-3 text-sm transition",
                      item.key === section
                        ? "border-slate-300 bg-white font-semibold text-slate-900"
                        : "border-transparent text-slate-500 hover:text-slate-900"
                    ].join(" ")}
                    href={buildSectionHref(orgSlug, item.key)}
                    key={item.key}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </nav>
          </div>

          {section === "summary" ? (
            <SubscriptionPlanDetails
              activePlan={activePlan}
              billingCycle={billingCycle}
              orgSlug={orgSlug}
              summary={summary}
            />
          ) : null}

          {section === "billing" ? (
            <BillingAccountSection orgSlug={orgSlug} summary={summary} taxDetail={taxDetail} />
          ) : null}

          {section === "add-ons" ? (
            <AddOnsSection activePlan={activePlan} summary={summary} />
          ) : null}

          {section === "invoices" ? <InvoicesSection invoices={invoices} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SubscriptionPlanDetails({
  activePlan,
  billingCycle,
  orgSlug,
  summary
}: {
  activePlan: BillingPlanRecord | null;
  billingCycle: string;
  orgSlug: string;
  summary: BillingSummaryRecord;
}) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardContent className="space-y-8 px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Subscription Plan Details
              </h2>
              <StatusBadge
                label={summary.status ?? "NOT_CONFIGURED"}
                tone={resolveSubscriptionTone(summary.status)}
              />
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Review the current billing plan, seat allocation, renewal timing,
              and stored subscription state.
            </p>
          </div>
          <a
            className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            href={`/${orgSlug}/subscription/invoices`}
          >
            Review Invoices
          </a>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <DetailRow
            label="Current Plan"
            value={activePlan ? `${activePlan.name} Plan` : summary.planCode ?? "Not configured"}
          />
          <DetailRow label="Billing Cycle" value={billingCycle} />
          <DetailRow
            label="Plan Price"
            value={
              activePlan
                ? `${money(activePlan.monthlyPrice, activePlan.currencyCode)} / month`
                : "Not configured"
            }
          />
          <DetailRow label="Seats" value={String(summary.seats)} />
          <DetailRow
            label="Included Seats"
            value={activePlan ? String(activePlan.includedSeats) : "Not configured"}
          />
          <DetailRow
            label="Next Renewal Date"
            value={
              summary.currentPeriodEnd ? formatDate(summary.currentPeriodEnd) : "Not scheduled"
            }
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
          <p className="text-sm leading-6 text-slate-600">
            Plan changes and cancellation requests are not initiated from this workspace.
            The values above reflect the recorded billing state only.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function BillingAccountSection({
  orgSlug,
  summary,
  taxDetail
}: {
  orgSlug: string;
  summary: BillingSummaryRecord;
  taxDetail: OrganizationTaxDetailRecord | null;
}) {
  const address = buildOrganisationAddress(taxDetail);
  const organisationName =
    presentOrganizationName(taxDetail?.legalName) ??
    summary.billingEmail?.split("@")[0]?.replace(/[._-]+/g, " ") ??
    "Organisation";

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
            Billing Account
          </h2>
          <p className="text-sm text-slate-500">
            Billing contact and account references currently stored for this workspace.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-5 xl:grid-cols-2">
          <InfoPanel title="Billing Contact">
            <InfoLine label="Name" value={organisationName} />
            <InfoLine
              label="Email"
              value={presentEmail(summary.billingEmail) ?? "Not recorded"}
            />
            <InfoLine
              label="Subscription ID"
              value={summary.subscriptionId ?? "Not recorded"}
            />
            <InfoLine label="Address" value={address} />
          </InfoPanel>

          <InfoPanel title="Billing References">
            <InfoLine
              label="Stripe Customer ID"
              value={summary.stripeCustomerId ?? "Not recorded"}
            />
            <InfoLine label="Plan Code" value={summary.planCode ?? "Not recorded"} />
            <InfoLine label="Status" value={summary.status ?? "Not recorded"} />
            <InfoLine
              label="Current Period End"
              value={summary.currentPeriodEnd ? formatDate(summary.currentPeriodEnd) : "Not recorded"}
            />
          </InfoPanel>
        </div>

        <p className="text-sm text-slate-500">
          Need to update the legal billing address? Review the organisation tax profile in{" "}
          <a
            className="font-medium text-emerald-700 underline underline-offset-4"
            href={`/${orgSlug}/settings/organisation-tax-details`}
          >
            Organisation Tax Details
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function AddOnsSection({
  activePlan,
  summary
}: {
  activePlan: BillingPlanRecord | null;
  summary: BillingSummaryRecord;
}) {
  const includedSeats = activePlan?.includedSeats ?? 0;
  const extraSeats = Math.max(summary.seats - includedSeats, 0);
  const entitlements = activePlan?.addOns ?? [];

  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
            Plan Entitlements
          </h2>
          <p className="text-sm text-slate-500">
            Stored add-ons and seat posture for the current subscription plan.
          </p>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-3">
        <SummaryPanel title="Included Features">
          <AddonList
            emptyState="No plan entitlements are recorded for the current subscription."
            items={entitlements}
          />
        </SummaryPanel>

        <SummaryPanel title="Seat Allocation">
          <div className="space-y-4">
            <InfoLine label="Configured Seats" value={String(summary.seats)} />
            <InfoLine label="Included Seats" value={String(includedSeats)} />
            <InfoLine label="Additional Seats" value={String(extraSeats)} />
          </div>
        </SummaryPanel>

        <SummaryPanel title="Additional Add-Ons">
          <p className="text-sm leading-6 text-slate-500">
            No separately recorded add-ons are stored for this workspace.
          </p>
        </SummaryPanel>
      </CardContent>
    </Card>
  );
}

function InvoicesSection({ invoices }: { invoices: BillingInvoiceRecord[] }) {
  return (
    <Card className="border-slate-100 shadow-sm">
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
            Billing Invoices
          </h2>
          <p className="text-sm text-slate-500">
            Invoice history recorded for the subscription account.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-3 py-3 font-medium text-slate-800">{invoice.invoiceNumber}</td>
                  <td className="px-3 py-3">
                    <StatusBadge
                      label={invoice.status}
                      tone={invoice.status === "paid" ? "success" : "warning"}
                    />
                  </td>
                  <td className="px-3 py-3 text-slate-600">{formatDate(invoice.issuedAt)}</td>
                  <td className="px-3 py-3 text-slate-600">
                    {invoice.dueAt ? formatDate(invoice.dueAt) : "N/A"}
                  </td>
                  <td className="px-3 py-3 text-slate-800">
                    {money(invoice.total, invoice.currencyCode)}
                  </td>
                  <td className="px-3 py-3">
                    {invoice.hostedInvoiceUrl ? (
                      <a
                        className="font-medium text-emerald-700 underline underline-offset-4"
                        href={invoice.hostedInvoiceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open hosted invoice
                      </a>
                    ) : (
                      <span className="text-slate-400">Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-slate-500" colSpan={6}>
                    No billing invoices recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryPanel({
  children,
  title
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
      <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h3>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function AddonList({
  emptyState,
  items
}: {
  emptyState: string;
  items: string[];
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-slate-500">{emptyState}</p>;
  }

  return (
    <ul className="space-y-3 text-sm text-slate-700">
      {items.map((item) => (
        <li className="flex gap-3" key={item}>
          <span className="mt-1 text-emerald-600">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function InfoPanel({
  children,
  title
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
      <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h3>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function InfoLine({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <p className="text-sm leading-6 text-slate-700">
      <span className="font-semibold text-slate-900">{label}:</span> {value}
    </p>
  );
}

function DetailRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function buildSectionHref(orgSlug: string, section: SubscriptionSection) {
  return section === "summary"
    ? `/${orgSlug}/subscription`
    : `/${orgSlug}/subscription/${section}`;
}

function normalizeSection(value: string | undefined): SubscriptionSection | null {
  if (!value) {
    return "summary";
  }

  return subscriptionSections.some((section) => section.key === value)
    ? (value as SubscriptionSection)
    : null;
}

function resolveSubscriptionTone(status: BillingSummaryRecord["status"]) {
  if (status === "ACTIVE" || status === "TRIALING") {
    return "success";
  }

  if (status === "PAST_DUE") {
    return "warning";
  }

  return "neutral";
}

function describeBillingCycle(summary: BillingSummaryRecord) {
  if (!summary.currentPeriodStart || !summary.currentPeriodEnd) {
    return "Not configured";
  }

  const start = new Date(summary.currentPeriodStart);
  const end = new Date(summary.currentPeriodEnd);
  const durationDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);

  if (durationDays >= 300) {
    return "Yearly";
  }

  if (durationDays >= 27) {
    return "Monthly";
  }

  return `${Math.max(durationDays, 1)} day cycle`;
}

function buildOrganisationAddress(taxDetail: OrganizationTaxDetailRecord | null) {
  const lines = [
    taxDetail?.addressLine1,
    taxDetail?.addressLine2,
    taxDetail?.city,
    taxDetail?.postalCode,
    taxDetail?.countryCode
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  return lines.length > 0 ? lines.join(", ") : "Not recorded";
}
