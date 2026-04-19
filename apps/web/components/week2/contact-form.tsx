"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ContactDetail, ContactGroupRecord } from "@daftar/types";
import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

type ContactFormValues = {
  displayName: string;
  companyName: string;
  email: string;
  taxNumber: string;
  customerCode: string;
  supplierCode: string;
  currencyCode: string;
  paymentTermsDays: string;
  notes: string;
  receivableBalance: string;
  payableBalance: string;
  isCustomer: boolean;
  isSupplier: boolean;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  billingCountryCode: string;
  deliveryLine1: string;
  deliveryLine2: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPostalCode: string;
  deliveryCountryCode: string;
  primaryPhone: string;
  financePhone: string;
  groupIds: string[];
};

function getAddress(contact: ContactDetail | null, type: "BILLING" | "DELIVERY") {
  return contact?.addresses.find((address) => address.type === type) ?? null;
}

function getNumber(contact: ContactDetail | null, label: string) {
  return (
    contact?.numbers.find((number) => number.label.toLowerCase() === label.toLowerCase())
      ?.phoneNumber ?? ""
  );
}

export function buildContactFormValues(contact: ContactDetail | null): ContactFormValues {
  const billing = getAddress(contact, "BILLING");
  const delivery = getAddress(contact, "DELIVERY");

  return {
    displayName: contact?.displayName ?? "",
    companyName: contact?.companyName ?? "",
    email: contact?.email ?? "",
    taxNumber: contact?.taxNumber ?? "",
    customerCode: contact?.customerCode ?? "",
    supplierCode: contact?.supplierCode ?? "",
    currencyCode: contact?.currencyCode ?? "SAR",
    paymentTermsDays: contact?.paymentTermsDays?.toString() ?? "",
    notes: contact?.notes ?? "",
    receivableBalance: contact?.receivableBalance ?? "0.00",
    payableBalance: contact?.payableBalance ?? "0.00",
    isCustomer: contact?.isCustomer ?? true,
    isSupplier: contact?.isSupplier ?? false,
    billingLine1: billing?.line1 ?? "",
    billingLine2: billing?.line2 ?? "",
    billingCity: billing?.city ?? "",
    billingState: billing?.state ?? "",
    billingPostalCode: billing?.postalCode ?? "",
    billingCountryCode: billing?.countryCode ?? "SA",
    deliveryLine1: delivery?.line1 ?? "",
    deliveryLine2: delivery?.line2 ?? "",
    deliveryCity: delivery?.city ?? "",
    deliveryState: delivery?.state ?? "",
    deliveryPostalCode: delivery?.postalCode ?? "",
    deliveryCountryCode: delivery?.countryCode ?? "SA",
    primaryPhone: getNumber(contact, "Main"),
    financePhone: getNumber(contact, "Finance"),
    groupIds: contact?.groups.map((group) => group.id) ?? []
  };
}

function normalizePayload(values: ContactFormValues) {
  const addresses = [
    values.billingLine1
      ? {
          type: "BILLING" as const,
          line1: values.billingLine1,
          line2: values.billingLine2 || null,
          city: values.billingCity || null,
          state: values.billingState || null,
          postalCode: values.billingPostalCode || null,
          countryCode: values.billingCountryCode || "SA"
        }
      : null,
    values.deliveryLine1
      ? {
          type: "DELIVERY" as const,
          line1: values.deliveryLine1,
          line2: values.deliveryLine2 || null,
          city: values.deliveryCity || null,
          state: values.deliveryState || null,
          postalCode: values.deliveryPostalCode || null,
          countryCode: values.deliveryCountryCode || "SA"
        }
      : null
  ].filter(Boolean);

  const numbers = [
    values.primaryPhone
      ? {
          label: "Main",
          phoneNumber: values.primaryPhone
        }
      : null,
    values.financePhone
      ? {
          label: "Finance",
          phoneNumber: values.financePhone
        }
      : null
  ].filter(Boolean);

  return {
    displayName: values.displayName,
    companyName: values.companyName || null,
    email: values.email || null,
    taxNumber: values.taxNumber || null,
    customerCode: values.customerCode || null,
    supplierCode: values.supplierCode || null,
    currencyCode: values.currencyCode || null,
    paymentTermsDays: values.paymentTermsDays ? Number(values.paymentTermsDays) : null,
    notes: values.notes || null,
    receivableBalance: values.receivableBalance || "0.00",
    payableBalance: values.payableBalance || "0.00",
    isCustomer: values.isCustomer,
    isSupplier: values.isSupplier,
    addresses,
    numbers,
    groupIds: values.groupIds
  };
}

export function ContactForm({
  title,
  description,
  endpoint,
  method,
  canWrite,
  groups,
  initialContact = null,
  submitLabel
}: {
  title: string;
  description: string;
  endpoint: string;
  method: "POST" | "PATCH";
  canWrite: boolean;
  groups: ContactGroupRecord[];
  initialContact?: ContactDetail | null;
  submitLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<ContactFormValues>(
    buildContactFormValues(initialContact)
  );
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const fieldClass =
    "w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900";

  function updateValue(name: keyof ContactFormValues, value: string | boolean | string[]) {
    setValues((current) => ({
      ...current,
      [name]: value
    }));
  }

  function toggleGroup(groupId: string) {
    setValues((current) => ({
      ...current,
      groupIds: current.groupIds.includes(groupId)
        ? current.groupIds.filter((id) => id !== groupId)
        : [...current.groupIds, groupId]
    }));
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method,
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(normalizePayload(values))
      });

      if (!response.ok) {
        setError((await response.text()) || "Request failed.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card className="border-slate-100">
      <CardHeader>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Display Name</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("displayName", event.target.value)}
              value={values.displayName}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Company Name</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("companyName", event.target.value)}
              value={values.companyName}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Email</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("email", event.target.value)}
              type="email"
              value={values.email}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Tax Number</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("taxNumber", event.target.value)}
              value={values.taxNumber}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Customer Code</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("customerCode", event.target.value)}
              value={values.customerCode}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Supplier Code</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("supplierCode", event.target.value)}
              value={values.supplierCode}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Currency</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("currencyCode", event.target.value.toUpperCase())}
              value={values.currencyCode}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Payment Terms (days)</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("paymentTermsDays", event.target.value)}
              type="number"
              value={values.paymentTermsDays}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Receivable Balance</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("receivableBalance", event.target.value)}
              value={values.receivableBalance}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Payable Balance</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("payableBalance", event.target.value)}
              value={values.payableBalance}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={values.isCustomer}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("isCustomer", event.target.checked)}
              type="checkbox"
            />
            <span className="font-medium text-slate-700">Customer</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={values.isSupplier}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("isSupplier", event.target.checked)}
              type="checkbox"
            />
            <span className="font-medium text-slate-700">Supplier</span>
          </label>
        </div>

        <label className="block space-y-2 text-sm">
          <span className="font-medium text-slate-700">Notes</span>
          <textarea
            className={`${fieldClass} min-h-32`}
            disabled={!canWrite || isPending}
            onChange={(event) => updateValue("notes", event.target.value)}
            value={values.notes}
          />
        </label>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-lg font-semibold text-slate-900">Billing Address</h3>
            {[
              ["billingLine1", "Line 1"],
              ["billingLine2", "Line 2"],
              ["billingCity", "City"],
              ["billingState", "State"],
              ["billingPostalCode", "Postal Code"],
              ["billingCountryCode", "Country Code"]
            ].map(([key, label]) => (
              <label className="block space-y-2 text-sm" key={key}>
                <span>{label}</span>
                <input
                  className={fieldClass}
                  disabled={!canWrite || isPending}
                  onChange={(event) =>
                    updateValue(key as keyof ContactFormValues, event.target.value)
                  }
                  value={String(values[key as keyof ContactFormValues] ?? "")}
                />
              </label>
            ))}
          </div>
          <div className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-lg font-semibold text-slate-900">Delivery Address</h3>
            {[
              ["deliveryLine1", "Line 1"],
              ["deliveryLine2", "Line 2"],
              ["deliveryCity", "City"],
              ["deliveryState", "State"],
              ["deliveryPostalCode", "Postal Code"],
              ["deliveryCountryCode", "Country Code"]
            ].map(([key, label]) => (
              <label className="block space-y-2 text-sm" key={key}>
                <span>{label}</span>
                <input
                  className={fieldClass}
                  disabled={!canWrite || isPending}
                  onChange={(event) =>
                    updateValue(key as keyof ContactFormValues, event.target.value)
                  }
                  value={String(values[key as keyof ContactFormValues] ?? "")}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Main Phone</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("primaryPhone", event.target.value)}
              value={values.primaryPhone}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-700">Finance Phone</span>
            <input
              className={fieldClass}
              disabled={!canWrite || isPending}
              onChange={(event) => updateValue("financePhone", event.target.value)}
              value={values.financePhone}
            />
          </label>
        </div>

        <div className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-lg font-semibold text-slate-900">Groups</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {groups.map((group) => (
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm" key={group.id}>
                <input
                  checked={values.groupIds.includes(group.id)}
                  disabled={!canWrite || isPending}
                  onChange={() => toggleGroup(group.id)}
                  type="checkbox"
                />
                <span>{group.name}</span>
              </label>
            ))}
          </div>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button disabled={!canWrite || isPending} onClick={submit} type="button">
            {isPending ? "Saving..." : submitLabel}
          </Button>
          {!canWrite ? <span className="text-sm text-slate-500">Read-only access</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
