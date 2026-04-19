"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EInvoiceIntegrationRecord } from "@daftar/types";
import { Button, Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { presentOrganizationName } from "../presentation";

function actionClass(tone: "green" | "red" | "slate") {
  if (tone === "green") {
    return "bg-emerald-600 hover:bg-emerald-500";
  }

  if (tone === "red") {
    return "bg-rose-600 hover:bg-rose-500";
  }

  return "bg-slate-700 hover:bg-slate-600";
}

export function EInvoiceIntegrationPanel(props: {
  canWrite: boolean;
  integration: EInvoiceIntegrationRecord;
}) {
  const router = useRouter();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );
  const [environment, setEnvironment] = useState(props.integration.environment);
  const [mappings, setMappings] = useState(
    Object.fromEntries(
      props.integration.mappings.map((entry) => [entry.bankAccountId, entry.paymentMeansCode ?? ""])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(path: string) {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        credentials: "include"
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Action failed.");
        return;
      }

      router.refresh();
    });
  }

  function saveMappings() {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}/v1/compliance/integration`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          environment,
          mappings: props.integration.mappings.map((entry) => ({
            bankAccountId: entry.bankAccountId,
            paymentMeansCode: mappings[entry.bankAccountId] || null
          }))
        })
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Unable to save mappings.");
        return;
      }

      setSuccess("Payment means saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">E-Invoice Integration</p>
            <p className="text-sm text-slate-500">
              Manage your tax and e-invoice registration through the ZATCA integration workspace.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-slate-950">
                  Manage taxes and e-invoice onboarding
                </h3>
                <div className="space-y-1 text-sm text-slate-600">
                  <p>
                    Device record for{" "}
                    <strong>
                      {presentOrganizationName(props.integration.organizationName)}
                    </strong>
                  </p>
                  <p>Type: {environment}</p>
                  <p>Tax Number: {props.integration.taxNumber ?? "Not configured"}</p>
                  <p>
                    Device: {props.integration.onboarding?.deviceName ?? "Not registered"}
                  </p>
                  <p>
                    Serial: {props.integration.onboarding?.deviceSerial ?? "Not registered"}
                  </p>
                  <p>
                    CSID: {props.integration.onboarding?.csid ?? "Not issued"}
                  </p>
                  <p>
                    Certificate Status:{" "}
                    {props.integration.onboarding?.certificateStatus ?? "Not requested"}
                  </p>
                  <p>
                    Integration Date:{" "}
                    {props.integration.integrationDate
                      ? props.integration.integrationDate.slice(0, 10)
                      : "Not registered"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {props.integration.status === "REGISTERED" ? (
                  <>
                    <Button
                      className={actionClass("red")}
                      disabled={!props.canWrite || isPending}
                      onClick={() => runAction("/v1/compliance/integration/remove")}
                      type="button"
                    >
                      Remove
                    </Button>
                    <Button
                      className={actionClass("green")}
                      disabled={!props.canWrite || isPending}
                      onClick={() => runAction("/v1/compliance/integration/renew")}
                      type="button"
                    >
                      Renew
                    </Button>
                  </>
                ) : (
                  <Button
                    className={actionClass("green")}
                    disabled={!props.canWrite || isPending}
                    onClick={() => runAction("/v1/compliance/integration/onboard")}
                    type="button"
                  >
                    Register Device
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm">
              <div className="space-y-1 text-slate-600">
                <p>
                  Onboarding Status:{" "}
                  <strong>{props.integration.onboarding?.status ?? "NOT_STARTED"}</strong>
                </p>
                {props.integration.onboarding?.lastError ? (
                  <p className="text-rose-600">{props.integration.onboarding.lastError}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  label={
                    props.integration.status === "REGISTERED"
                      ? "Registered"
                      : "Not Registered"
                  }
                  tone={props.integration.status === "REGISTERED" ? "success" : "warning"}
                />
                <StatusBadge
                  label={props.integration.onboarding?.certificateStatus ?? "NOT_REQUESTED"}
                  tone={
                    props.integration.onboarding?.certificateStatus === "ACTIVE"
                      ? "success"
                      : "warning"
                  }
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-950">
                Compliance Timeline
              </h3>
              <p className="text-sm text-slate-500">
                Latest onboarding and submission events for the active device record.
              </p>
            </div>
            <div className="mt-5 space-y-3">
              {props.integration.timeline.length === 0 ? (
                <p className="text-sm text-slate-500">No compliance events recorded yet.</p>
              ) : (
                props.integration.timeline.map((event) => (
                  <div
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"
                    key={event.id}
                  >
                    <p className="font-medium text-slate-900">{event.action}</p>
                    <p className="text-slate-600">
                      {event.status} • {event.createdAt.slice(0, 19).replace("T", " ")}
                    </p>
                    <p className="text-slate-600">{event.message ?? "No message recorded."}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-950">
                  Configure your payment methods for ZATCA
                </h3>
                <p className="text-sm text-slate-500">
                  Payment means codes follow the UNCL4461 mapping used by the XML implementation standard.
                </p>
              </div>

              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Environment</span>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2"
                  disabled={!props.canWrite || isPending}
                  onChange={(event) =>
                    setEnvironment(event.target.value as EInvoiceIntegrationRecord["environment"])
                  }
                  value={environment}
                >
                  <option value="Production">Production</option>
                  <option value="Sandbox">Sandbox</option>
                </select>
              </label>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Account Name</th>
                    <th className="px-3 py-2 font-medium">Payment Means Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {props.integration.mappings.map((entry) => (
                    <tr key={entry.bankAccountId}>
                      <td className="px-3 py-3 text-slate-800">{entry.accountName}</td>
                      <td className="px-3 py-3">
                        <select
                          className="w-full rounded-md border border-slate-300 px-3 py-2"
                          disabled={!props.canWrite || isPending}
                          onChange={(event) =>
                            setMappings((current) => ({
                              ...current,
                              [entry.bankAccountId]: event.target.value
                            }))
                          }
                          value={mappings[entry.bankAccountId] ?? ""}
                        >
                          <option value="">Select…</option>
                          {props.integration.availablePaymentMeans.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.code} - {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                className={actionClass("green")}
                disabled={!props.canWrite || isPending}
                onClick={saveMappings}
                type="button"
              >
                Save Payment Means
              </Button>
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
