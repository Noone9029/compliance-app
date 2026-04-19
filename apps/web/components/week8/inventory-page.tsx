import React from "react";
import type { InventoryItemDetail, InventoryItemSummary } from "@daftar/types";
import { Card, CardContent } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { SectionNav } from "../week2/section-nav";
import { getCapabilities, hasPermission } from "../week2/route-utils";
import { InventoryPageClient } from "./inventory-page-client";

function inventoryNav(orgSlug: string) {
  return [
    {
      href: `/${orgSlug}/accounting/inventory`,
      label: "Inventory",
      active: true,
    },
  ];
}

function getFirstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function buildInventoryListEndpoint(search: string) {
  const params = new URLSearchParams();

  if (search.trim()) {
    params.set("search", search.trim());
  }

  return params.size
    ? `/v1/inventory/items?${params.toString()}`
    : "/v1/inventory/items";
}

function NoAccessCard() {
  return (
    <Card>
      <CardContent className="py-8">
        <p className="text-sm font-medium text-slate-900">
          Your role does not currently include inventory access.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Ask an administrator for the inventory permission if this workflow is
          required.
        </p>
      </CardContent>
    </Card>
  );
}

export async function renderInventoryPage(
  orgSlug: string,
  segments: string[],
  searchParams: Record<string, string | string[] | undefined>,
) {
  const capabilities = await getCapabilities();
  const canRead = hasPermission(capabilities, "inventory.read");
  const canWrite = hasPermission(capabilities, "inventory.write");

  if (!canRead) {
    return (
      <div className="space-y-6">
        <SectionNav items={inventoryNav(orgSlug)} title="Accounting" />
        <NoAccessCard />
      </div>
    );
  }

  const selectedId = segments[2] ?? null;
  const search = getFirstQueryValue(searchParams.search) ?? "";
  const [items, selected] = await Promise.all([
    fetchServerJson<InventoryItemSummary[]>(buildInventoryListEndpoint(search)),
    selectedId
      ? fetchServerJson<InventoryItemDetail>(`/v1/inventory/items/${selectedId}`)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <SectionNav items={inventoryNav(orgSlug)} title="Accounting" />
      <InventoryPageClient
        canWrite={canWrite}
        initialSearch={search}
        items={items}
        orgSlug={orgSlug}
        selected={selected}
      />
    </div>
  );
}
