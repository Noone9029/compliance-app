"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";

import { Button } from "@daftar/ui";

export function ActionButton({
  endpoint,
  label,
  canWrite,
  method = "POST",
  body,
  redirectTo,
  redirectField,
  pendingLabel,
  onSuccess
}: {
  endpoint: string;
  label: string;
  canWrite: boolean;
  method?: "POST" | "PATCH";
  body?: Record<string, unknown>;
  redirectTo?: string;
  redirectField?: string;
  pendingLabel?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );

  function submit() {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method,
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Request failed.");
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;

      if (redirectTo) {
        let nextPath = redirectTo;

        if (payload && redirectField) {
          const redirectValue = payload[redirectField];
          if (typeof redirectValue === "string" && redirectValue.length > 0) {
            nextPath = `${redirectTo}/${redirectValue}`;
          }
        }

        router.push(nextPath);
        return;
      }

      onSuccess?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button disabled={!canWrite || isPending} onClick={submit} type="button">
        {isPending ? pendingLabel ?? "Working..." : label}
      </Button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
