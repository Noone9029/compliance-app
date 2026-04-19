"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";

import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

export function FixedAssetForm({
  endpoint,
  method,
  canWrite,
  submitLabel,
  initialValues,
  redirectTo,
  appendResultId = false
}: {
  endpoint: string;
  method: "POST" | "PATCH";
  canWrite: boolean;
  submitLabel: string;
  initialValues: {
    assetNumber: string;
    name: string;
    category: string;
    purchaseDate: string;
    cost: string;
    salvageValue: string;
    usefulLifeMonths: string;
    depreciationMethod: string;
  };
  redirectTo?: string;
  appendResultId?: boolean;
}) {
  const router = useRouter();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialValues);

  function setValue(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetNumber: form.assetNumber || null,
          name: form.name,
          category: form.category,
          purchaseDate: new Date(`${form.purchaseDate}T00:00:00.000Z`).toISOString(),
          cost: form.cost,
          salvageValue: form.salvageValue,
          usefulLifeMonths: Number(form.usefulLifeMonths),
          depreciationMethod: form.depreciationMethod
        })
      });

      if (!response.ok) {
        setError((await response.text()) || "Unable to save asset.");
        return;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      if (redirectTo) {
        const target =
          appendResultId && typeof payload.id === "string"
            ? `${redirectTo}/${payload.id}`
            : redirectTo;
        router.push(target);
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">Fixed Asset</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["assetNumber", "Asset Number", "text"],
            ["name", "Name", "text"],
            ["category", "Category", "text"],
            ["purchaseDate", "Purchase Date", "date"],
            ["cost", "Cost", "number"],
            ["salvageValue", "Salvage Value", "number"],
            ["usefulLifeMonths", "Useful Life (months)", "number"],
            ["depreciationMethod", "Depreciation Method", "text"]
          ].map(([key, label, type]) => (
            <label className="block space-y-2 text-sm" key={key}>
              <span className="font-medium text-slate-700">{label}</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                disabled={!canWrite || isPending}
                onChange={(event) =>
                  setValue(key as keyof typeof form, event.target.value)
                }
                type={type}
                value={form[key as keyof typeof form]}
              />
            </label>
          ))}
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <Button disabled={!canWrite || isPending} onClick={submit} type="button">
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
