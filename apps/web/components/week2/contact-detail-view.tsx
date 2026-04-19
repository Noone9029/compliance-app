import React from "react";

import type { ContactDetail } from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { presentCompanyName, presentContactName, presentEmail } from "../presentation";

function DetailRow({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <div className="text-sm text-slate-800">{value || "Not set"}</div>
    </div>
  );
}

export function ContactDetailView({ contact }: { contact: ContactDetail }) {
  const billing = contact.addresses.find((address) => address.type === "BILLING");
  const delivery = contact.addresses.find((address) => address.type === "DELIVERY");

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">
                {presentContactName(contact.displayName)}
              </h2>
              <p className="text-sm text-slate-500">
                {presentCompanyName(contact.companyName) ?? "No company name recorded"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {contact.isCustomer ? <StatusBadge label="Customer" tone="success" /> : null}
              {contact.isSupplier ? <StatusBadge label="Supplier" tone="warning" /> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <DetailRow label="Email" value={presentEmail(contact.email)} />
          <DetailRow label="Tax Number" value={contact.taxNumber} />
          <DetailRow label="Customer Code" value={contact.customerCode} />
          <DetailRow label="Supplier Code" value={contact.supplierCode} />
          <DetailRow label="Currency" value={contact.currencyCode} />
          <DetailRow label="Payment Terms" value={contact.paymentTermsDays ?? "Not set"} />
          <DetailRow label="Receivable Balance" value={contact.receivableBalance} />
          <DetailRow label="Payable Balance" value={contact.payableBalance} />
          <DetailRow
            label="Groups"
            value={
              contact.groups.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {contact.groups.map((group) => (
                    <StatusBadge key={group.id} label={group.name} tone="neutral" />
                  ))}
                </div>
              ) : null
            }
          />
          <DetailRow label="Notes" value={contact.notes} />
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Billing Address</h3>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>{billing?.line1 ?? "Not set"}</p>
            <p>{billing?.line2}</p>
            <p>
              {[billing?.city, billing?.state, billing?.postalCode]
                .filter(Boolean)
                .join(", ")}
            </p>
            <p>{billing?.countryCode}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Delivery Address</h3>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>{delivery?.line1 ?? "Not set"}</p>
            <p>{delivery?.line2}</p>
            <p>
              {[delivery?.city, delivery?.state, delivery?.postalCode]
                .filter(Boolean)
                .join(", ")}
            </p>
            <p>{delivery?.countryCode}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Contact Numbers</h3>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            {contact.numbers.length > 0 ? (
              contact.numbers.map((number) => (
                <div key={number.id}>
                  <p className="font-medium">{number.label}</p>
                  <p>{number.phoneNumber}</p>
                </div>
              ))
            ) : (
              <p>No numbers recorded.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Files</h3>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            {contact.files.length > 0 ? (
              contact.files.map((file) => (
                <div key={file.id}>
                  <p className="font-medium">{file.originalFileName}</p>
                  <p>{file.mimeType}</p>
                  <p>{file.objectKey}</p>
                </div>
              ))
            ) : (
              <p>No related files recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
