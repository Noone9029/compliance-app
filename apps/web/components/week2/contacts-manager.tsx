"use client";

import React, { useMemo, useState } from "react";

import type { ContactGroupRecord, ContactSummary } from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { presentCompanyName, presentContactName, presentEmail } from "../presentation";
import { ContactForm } from "./contact-form";

export function ContactsManager({
  orgSlug,
  title,
  description,
  contacts,
  groups,
  canWrite
}: {
  orgSlug: string;
  title: string;
  description: string;
  contacts: ContactSummary[];
  groups: ContactGroupRecord[];
  canWrite: boolean;
}) {
  const [search, setSearch] = useState("");

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return contacts;
    }

    return contacts.filter((contact) =>
      [
        contact.displayName,
        contact.companyName,
        contact.email,
        ...contact.groupNames
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [contacts, search]);

  return (
    <div className="space-y-6">
      <Card className="border-slate-100">
        <CardHeader>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.3fr_auto_auto]">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Search</span>
              <input
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contacts, companies, emails, or groups"
                value={search}
              />
            </label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Total Contacts
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{contacts.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Showing
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{filteredContacts.length}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Financials</th>
                  <th className="px-4 py-3 font-medium">Groups</th>
                  <th className="px-4 py-3 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContacts.map((contact) => (
                  <tr className="transition hover:bg-slate-50/80" key={contact.id}>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">
                          {presentContactName(contact.displayName)}
                        </p>
                        <p className="text-slate-500">
                          {presentCompanyName(contact.companyName) ??
                            presentEmail(contact.email) ??
                            "No company or email recorded"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {contact.isCustomer ? (
                          <StatusBadge label="Customer" tone="success" />
                        ) : null}
                        {contact.isSupplier ? (
                          <StatusBadge label="Supplier" tone="warning" />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <p>AR: {contact.receivableBalance}</p>
                      <p>AP: {contact.payableBalance}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {contact.groupNames.length > 0 ? contact.groupNames.join(", ") : "None"}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                        href={`/${orgSlug}/contacts/${contact.id}`}
                      >
                        Detail
                      </a>
                    </td>
                  </tr>
                ))}
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-slate-500" colSpan={5}>
                      No contacts match the current filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <ContactForm
        canWrite={canWrite}
        description="Create customer, supplier, and contact records for day-to-day operations."
        endpoint="/v1/contacts"
        groups={groups}
        method="POST"
        submitLabel="Create contact"
        title="New Contact"
      />
    </div>
  );
}
