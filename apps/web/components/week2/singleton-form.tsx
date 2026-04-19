"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, Card, CardContent, CardHeader } from "@daftar/ui";

type SingletonField =
  | {
      name: string;
      label: string;
      type: "text" | "number";
      placeholder?: string;
    }
  | {
      name: string;
      label: string;
      type: "textarea";
      rows?: number;
      placeholder?: string;
    }
  | {
      name: string;
      label: string;
      type: "checkbox";
    };

type FormState = Record<string, string | boolean>;

export function SingletonForm({
  title,
  description,
  fields,
  initialValues,
  endpoint,
  canWrite,
  submitLabel = "Save"
}: {
  title: string;
  description: string;
  fields: SingletonField[];
  initialValues: FormState;
  endpoint: string;
  canWrite: boolean;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const fieldClass =
    "w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900";

  function updateField(name: string, value: string | boolean) {
    setForm((current) => ({
      ...current,
      [name]: value
    }));
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(form)
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
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <label
              className={
                field.type === "textarea"
                  ? "block space-y-2 text-sm md:col-span-2"
                  : "block space-y-2 text-sm"
              }
              key={field.name}
            >
              <span className="font-medium text-slate-700">{field.label}</span>
              {field.type === "textarea" ? (
                <textarea
                  className={`${fieldClass} min-h-32`}
                  disabled={!canWrite || isPending}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  rows={field.rows ?? 4}
                  value={String(form[field.name] ?? "")}
                />
              ) : null}
              {field.type === "text" || field.type === "number" ? (
                <input
                  className={fieldClass}
                  disabled={!canWrite || isPending}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  type={field.type}
                  value={String(form[field.name] ?? "")}
                />
              ) : null}
              {field.type === "checkbox" ? (
                <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    checked={Boolean(form[field.name])}
                    className="h-4 w-4 rounded border-slate-300"
                    disabled={!canWrite || isPending}
                    onChange={(event) => updateField(field.name, event.target.checked)}
                    type="checkbox"
                  />
                  <span className="text-sm text-slate-700">
                    Toggle this setting for the current organisation.
                  </span>
                </span>
              ) : null}
            </label>
          ))}
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button disabled={!canWrite || isPending} onClick={submit} type="button">
            {isPending ? "Saving..." : submitLabel}
          </Button>
          {!canWrite ? (
            <span className="text-sm text-slate-500">Read-only access</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
