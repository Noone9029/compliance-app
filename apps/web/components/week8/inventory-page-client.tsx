"use client";

import { useRouter } from "next/navigation";
import React, { useRef, useState, useTransition } from "react";
import type {
  InventoryImportResult,
  InventoryItemDetail,
  InventoryItemSummary,
} from "@daftar/types";
import { Button, Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { formatDate, money } from "../week3/shared";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type InventoryItemFormValues = {
  itemCode: string;
  itemName: string;
  description: string;
  costPrice: string;
  salePrice: string;
  quantityOnHand: string;
};

type StockAdjustmentValues = {
  movementType: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
  quantity: string;
  reference: string;
  notes: string;
};

function buildInventoryPath(
  orgSlug: string,
  search: string,
  itemId?: string | null,
) {
  const params = new URLSearchParams();

  if (search.trim()) {
    params.set("search", search.trim());
  }

  const basePath = itemId
    ? `/${orgSlug}/accounting/inventory/${itemId}`
    : `/${orgSlug}/accounting/inventory`;

  return params.size ? `${basePath}?${params.toString()}` : basePath;
}

function movementLabel(movementType: InventoryItemDetail["movements"][number]["movementType"]) {
  return movementType
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function movementTone(movementType: InventoryItemDetail["movements"][number]["movementType"]) {
  if (
    movementType === "OPENING" ||
    movementType === "IMPORT" ||
    movementType === "PURCHASE_BILL" ||
    movementType === "ADJUSTMENT_IN"
  ) {
    return "success" as const;
  }

  if (movementType === "SALES_INVOICE" || movementType === "ADJUSTMENT_OUT") {
    return "warning" as const;
  }

  return "neutral" as const;
}

function formatQuantity(value: string) {
  return Number(value).toFixed(2);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }

  return window.btoa(binary);
}

function SelectHint({ canWrite }: { canWrite: boolean }) {
  return (
    <Card>
      <CardContent className="py-10">
        <p className="text-sm font-medium text-slate-900">
          {canWrite
            ? "Select an item to review stock movement history or create a new item."
            : "Select an item from the inventory list to review its stock movement history."}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Import items from CSV, review movement history, or create a new item.
        </p>
      </CardContent>
    </Card>
  );
}

function InventoryDetailCard({ item }: { item: InventoryItemDetail }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Item Detail</h3>
            <p className="text-sm text-slate-500">
              {item.itemCode} · {item.itemName}
            </p>
          </div>
          <StatusBadge label={`${formatQuantity(item.quantityOnHand)} on hand`} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Cost Price
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {money(item.costPrice)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Sale Price
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {money(item.salePrice)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Quantity
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {formatQuantity(item.quantityOnHand)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Updated
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {formatDate(item.updatedAt)}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Description
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {item.description ?? "No description was added for this item."}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                Stock Movement History
              </h4>
              <p className="text-xs text-slate-500">
                Opening balance, imports, document activity, and manual adjustments.
              </p>
            </div>
          </div>

          {item.movements.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-900">
                No stock movement has been recorded for this item yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Quantity</th>
                    <th className="px-3 py-2 font-medium">After</th>
                    <th className="px-3 py-2 font-medium">Reference</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {item.movements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="px-3 py-3 align-top">
                        <StatusBadge
                          label={movementLabel(movement.movementType)}
                          tone={movementTone(movement.movementType)}
                        />
                      </td>
                      <td className="px-3 py-3 align-top font-medium text-slate-900">
                        {Number(movement.quantityDelta) > 0 ? "+" : ""}
                        {formatQuantity(movement.quantityDelta)}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700">
                        {formatQuantity(movement.quantityAfter)}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700">
                        {movement.reference ?? "No reference"}
                        {movement.notes ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {movement.notes}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700">
                        {formatDate(movement.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InventoryItemForm({
  canWrite,
  endpoint,
  initialValues,
  method,
  orgSlug,
  search,
  showOpeningQuantity,
  submitLabel,
  title,
  description,
}: {
  canWrite: boolean;
  endpoint: string;
  initialValues: InventoryItemFormValues;
  method: "POST" | "PATCH";
  orgSlug: string;
  search: string;
  showOpeningQuantity: boolean;
  submitLabel: string;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [itemCode, setItemCode] = useState(initialValues.itemCode);
  const [itemName, setItemName] = useState(initialValues.itemName);
  const [descriptionValue, setDescriptionValue] = useState(
    initialValues.description,
  );
  const [costPrice, setCostPrice] = useState(initialValues.costPrice);
  const [salePrice, setSalePrice] = useState(initialValues.salePrice);
  const [quantityOnHand, setQuantityOnHand] = useState(
    initialValues.quantityOnHand,
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemCode,
          itemName,
          description: descriptionValue || null,
          costPrice,
          salePrice,
          ...(showOpeningQuantity ? { quantityOnHand: quantityOnHand || "0.00" } : {}),
        }),
      });

      if (!response.ok) {
        setError((await response.text()) || "Unable to save inventory item.");
        return;
      }

      const payload = (await response.json()) as { id?: string };
      router.push(buildInventoryPath(orgSlug, search, payload.id ?? null));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Item Code</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setItemCode(event.target.value)}
              placeholder="ITM-1001"
              type="text"
              value={itemCode}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Item Name</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setItemName(event.target.value)}
              placeholder="Backdrop Panel Set"
              type="text"
              value={itemName}
            />
          </label>
          <label className="block space-y-2 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Description</span>
            <textarea
              className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setDescriptionValue(event.target.value)}
              placeholder="Optional notes for the inventory item."
              value={descriptionValue}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Cost Price</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              min="0"
              onChange={(event) => setCostPrice(event.target.value)}
              step="0.01"
              type="number"
              value={costPrice}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Sale Price</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              min="0"
              onChange={(event) => setSalePrice(event.target.value)}
              step="0.01"
              type="number"
              value={salePrice}
            />
          </label>
          {showOpeningQuantity ? (
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Opening Quantity</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                disabled={!canWrite || isPending}
                min="0"
                onChange={(event) => setQuantityOnHand(event.target.value)}
                step="0.01"
                type="number"
                value={quantityOnHand}
              />
            </label>
          ) : null}
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <Button disabled={!canWrite || isPending} onClick={submit} type="button">
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function StockAdjustmentForm({
  canWrite,
  itemId,
  orgSlug,
  search,
}: {
  canWrite: boolean;
  itemId: string;
  orgSlug: string;
  search: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [movementType, setMovementType] =
    useState<StockAdjustmentValues["movementType"]>("ADJUSTMENT_IN");
  const [quantity, setQuantity] = useState("1.00");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `${apiBaseUrl}/v1/inventory/items/${itemId}/adjustments`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            movementType,
            quantity,
            reference: reference || null,
            notes: notes || null,
          }),
        },
      );

      if (!response.ok) {
        setError((await response.text()) || "Unable to record stock adjustment.");
        return;
      }

      setQuantity("1.00");
      setReference("");
      setNotes("");
      router.push(buildInventoryPath(orgSlug, search, itemId));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Adjust Stock</h3>
          <p className="text-sm text-slate-500">
            Record a manual quantity increase or decrease for the selected item.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Adjustment Type</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) =>
                setMovementType(
                  event.target.value as StockAdjustmentValues["movementType"],
                )
              }
              value={movementType}
            >
              <option value="ADJUSTMENT_IN">Adjustment In</option>
              <option value="ADJUSTMENT_OUT">Adjustment Out</option>
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Quantity</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              min="0.01"
              onChange={(event) => setQuantity(event.target.value)}
              step="0.01"
              type="number"
              value={quantity}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Reference</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Count sheet or adjustment reference"
              type="text"
              value={reference}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-700">Notes</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={!canWrite || isPending}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional adjustment note"
              type="text"
              value={notes}
            />
          </label>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <Button disabled={!canWrite || isPending} onClick={submit} type="button">
          {isPending ? "Saving..." : "Save Adjustment"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function InventoryPageClient({
  canWrite,
  initialSearch,
  items,
  orgSlug,
  selected,
}: {
  canWrite: boolean;
  initialSearch: string;
  items: InventoryItemSummary[];
  orgSlug: string;
  selected: InventoryItemDetail | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<InventoryImportResult | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isImportPending, startImportTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const allSelected =
    items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  function toggleSelected(itemId: string) {
    if (!canWrite) {
      return;
    }

    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((entry) => entry !== itemId)
        : [...current, itemId],
    );
  }

  function toggleAll(nextChecked: boolean) {
    if (!canWrite) {
      return;
    }

    setSelectedIds(nextChecked ? items.map((item) => item.id) : []);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildInventoryPath(orgSlug, search));
  }

  function deleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }

    if (!window.confirm("Delete the selected inventory items?")) {
      return;
    }

    setDeleteError(null);
    startDeleteTransition(async () => {
      const response = await fetch(`${apiBaseUrl}/v1/inventory/items`, {
        method: "DELETE",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemIds: selectedIds }),
      });

      if (!response.ok) {
        setDeleteError((await response.text()) || "Unable to delete items.");
        return;
      }

      setSelectedIds([]);
      router.push(buildInventoryPath(orgSlug, search));
      router.refresh();
    });
  }

  function openImportPicker() {
    if (!canWrite || isImportPending) {
      return;
    }

    fileInputRef.current?.click();
  }

  function importItems(file: File) {
    setImportError(null);
    setImportResult(null);

    startImportTransition(async () => {
      const response = await fetch(`${apiBaseUrl}/v1/inventory/imports`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalFileName: file.name,
          mimeType: file.type || "text/csv",
          contentBase64: arrayBufferToBase64(await file.arrayBuffer()),
        }),
      });

      if (!response.ok) {
        setImportError((await response.text()) || "Unable to import inventory items.");
        return;
      }

      setImportResult((await response.json()) as InventoryImportResult);
      router.push(buildInventoryPath(orgSlug, search));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Inventory</h2>
              <p className="text-sm text-slate-500">
                Track item master data, on-hand quantities, and manual stock
                adjustments.
              </p>
            </div>

            <form
              className="grid gap-3 xl:grid-cols-[1.6fr_auto_auto_auto]"
              onSubmit={submitSearch}
            >
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by item code or item name"
                type="search"
                value={search}
              />
              <Button className="bg-white text-slate-900 hover:bg-slate-100" type="submit">
                Search
              </Button>
              <a
                className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                href={buildInventoryPath(orgSlug, search)}
              >
                New Item
              </a>
              <Button
                className="bg-white text-slate-900 hover:bg-slate-100"
                disabled={!canWrite || isImportPending}
                onClick={openImportPicker}
                type="button"
              >
                {isImportPending ? "Importing..." : "Import Items"}
              </Button>
              <input
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    importItems(file);
                  }
                  event.target.value = "";
                }}
                ref={fileInputRef}
                type="file"
              />
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button
                  className="bg-rose-600 hover:bg-rose-500"
                  disabled={!canWrite || isDeletePending || selectedIds.length === 0}
                  onClick={deleteSelected}
                  type="button"
                >
                  {isDeletePending
                    ? "Deleting..."
                    : selectedIds.length > 0
                      ? `Delete (${selectedIds.length})`
                      : "Delete"}
                </Button>
                {importResult ? (
                  <StatusBadge
                    label={`Imported ${importResult.importedCount} rows`}
                    tone="success"
                  />
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                CSV headers: itemCode, itemName, description, costPrice, salePrice, quantityOnHand.
              </p>
            </div>

            {importError ? (
              <p className="text-sm text-rose-600">{importError}</p>
            ) : null}
            {deleteError ? (
              <p className="text-sm text-rose-600">{deleteError}</p>
            ) : null}
            {importResult ? (
              <p className="text-sm text-emerald-700">
                {importResult.createdCount} created, {importResult.updatedCount} updated from{" "}
                {importResult.originalFileName}.
              </p>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-12 text-center">
              <p className="text-sm font-medium text-slate-900">
                No items found for the current search.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">
                      <input
                        aria-label="Select all inventory items"
                        checked={allSelected}
                        disabled={!canWrite || isDeletePending}
                        onChange={(event) => toggleAll(event.target.checked)}
                        type="checkbox"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Item Code</th>
                    <th className="px-3 py-2 font-medium">Item Name</th>
                    <th className="px-3 py-2 font-medium">Cost Price</th>
                    <th className="px-3 py-2 font-medium">Sale Price</th>
                    <th className="px-3 py-2 font-medium">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const isSelected = selected?.id === item.id;

                    return (
                      <tr
                        className={isSelected ? "bg-slate-50" : undefined}
                        key={item.id}
                      >
                        <td className="px-3 py-3 align-top">
                          <input
                            aria-label={`Select ${item.itemCode}`}
                            checked={selectedIds.includes(item.id)}
                            disabled={!canWrite || isDeletePending}
                            onChange={() => toggleSelected(item.id)}
                            type="checkbox"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <a
                            className="font-medium text-slate-900 underline-offset-4 hover:underline"
                            href={buildInventoryPath(orgSlug, search, item.id)}
                          >
                            {item.itemCode}
                          </a>
                        </td>
                        <td className="px-3 py-3 align-top text-slate-700">
                          <p>{item.itemName}</p>
                          {item.description ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {item.description}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 align-top text-slate-700">
                          {money(item.costPrice)}
                        </td>
                        <td className="px-3 py-3 align-top text-slate-700">
                          {money(item.salePrice)}
                        </td>
                        <td className="px-3 py-3 align-top font-medium text-slate-900">
                          {formatQuantity(item.quantityOnHand)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {selected ? <InventoryDetailCard item={selected} /> : <SelectHint canWrite={canWrite} />}

        {selected && canWrite ? (
          <>
            <InventoryItemForm
              canWrite={canWrite}
              description="Update the selected item master data without changing its current quantity."
              endpoint={`/v1/inventory/items/${selected.id}`}
              initialValues={{
                itemCode: selected.itemCode,
                itemName: selected.itemName,
                description: selected.description ?? "",
                costPrice: selected.costPrice,
                salePrice: selected.salePrice,
                quantityOnHand: selected.quantityOnHand,
              }}
              method="PATCH"
              orgSlug={orgSlug}
              search={search}
              showOpeningQuantity={false}
              submitLabel="Update Item"
              title="Edit Inventory Item"
            />
            <StockAdjustmentForm
              canWrite={canWrite}
              itemId={selected.id}
              orgSlug={orgSlug}
              search={search}
            />
          </>
        ) : null}

        {!selected && canWrite ? (
          <InventoryItemForm
            canWrite={canWrite}
            description="Create a new stock item with opening quantity, cost price, and sale price."
            endpoint="/v1/inventory/items"
            initialValues={{
              itemCode: "",
              itemName: "",
              description: "",
              costPrice: "0.00",
              salePrice: "0.00",
              quantityOnHand: "0.00",
            }}
            method="POST"
            orgSlug={orgSlug}
            search={search}
            showOpeningQuantity
            submitLabel="Create Item"
            title="New Inventory Item"
          />
        ) : null}
      </div>
    </div>
  );
}
