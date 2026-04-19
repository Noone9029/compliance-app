"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { OrganizationSummary } from "@daftar/types";
import { presentOrganizationName } from "./presentation";

export function OrgSwitcher({
  currentOrgSlug,
  organizations
}: {
  currentOrgSlug: string;
  organizations: OrganizationSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nextOrgSlug, setNextOrgSlug] = useState(currentOrgSlug);
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );

  if (organizations.length <= 1) {
    return null;
  }

  function onChange(orgSlug: string) {
    setNextOrgSlug(orgSlug);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}/v1/organizations/switch`, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ orgSlug })
      });

      if (!response.ok) {
        setNextOrgSlug(currentOrgSlug);
        return;
      }

      router.push(`/${orgSlug}`);
      router.refresh();
    });
  }

  return (
    <label className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="hidden whitespace-nowrap text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 sm:inline">
        Organization
      </span>
      <select
        className="min-w-36 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 sm:min-w-44"
        disabled={isPending}
        onChange={(event) => onChange(event.target.value)}
        value={nextOrgSlug}
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.slug}>
            {presentOrganizationName(organization.name)}
          </option>
        ))}
      </select>
    </label>
  );
}
