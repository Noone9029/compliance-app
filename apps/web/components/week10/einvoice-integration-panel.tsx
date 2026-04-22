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

function statusLabel(value: string | null | undefined) {
  if (!value) {
    return "Not Started";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function EInvoiceIntegrationPanel(props: {
  canWrite: boolean;
  canManageLifecycle: boolean;
  integration: EInvoiceIntegrationRecord;
}) {
  const router = useRouter();
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    [],
  );
  const onboarding = props.integration.onboarding;
  const [environment, setEnvironment] = useState(props.integration.environment);
  const [mappings, setMappings] = useState(
    Object.fromEntries(
      props.integration.mappings.map((entry) => [
        entry.bankAccountId,
        entry.paymentMeansCode ?? "",
      ]),
    ),
  );
  const [deviceSerial, setDeviceSerial] = useState(
    onboarding?.deviceSerial ?? "",
  );
  const [commonName, setCommonName] = useState(onboarding?.commonName ?? "");
  const [organizationUnitName, setOrganizationUnitName] = useState(
    onboarding?.organizationUnitName ?? "",
  );
  const [organizationName, setOrganizationName] = useState(
    onboarding?.organizationName ?? props.integration.legalName ?? props.integration.organizationName,
  );
  const [vatNumber, setVatNumber] = useState(
    onboarding?.vatNumber ?? props.integration.taxNumber ?? "",
  );
  const [branchName, setBranchName] = useState(onboarding?.branchName ?? "");
  const [countryCode, setCountryCode] = useState(onboarding?.countryCode ?? "SA");
  const [locationAddress, setLocationAddress] = useState(
    onboarding?.locationAddress ?? "",
  );
  const [industry, setIndustry] = useState(onboarding?.industry ?? "");
  const [otpCode, setOtpCode] = useState("");
  const [renewOtpCode, setRenewOtpCode] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onboardingStatus = onboarding?.status ?? "NOT_STARTED";
  const certificateStatus = onboarding?.certificateStatus ?? "NOT_REQUESTED";

  function clearFeedback() {
    setError(null);
    setSuccess(null);
  }

  async function readError(response: Response) {
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string" && payload.message.trim().length > 0) {
        return payload.message.trim();
      }
    } catch {
      // fallback to raw text below
    }

    const message = await response.text();
    return message || "Action failed.";
  }

  function withOnboardingId(callback: (onboardingId: string) => Promise<boolean>) {
    if (!onboarding?.id) {
      setError("Prepare onboarding first to create a device record.");
      return;
    }

    startTransition(async () => {
      clearFeedback();
      const ok = await callback(onboarding.id);
      if (ok) {
        router.refresh();
      }
    });
  }

  function runLifecycle(path: string, body?: Record<string, unknown>) {
    startTransition(async () => {
      clearFeedback();
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        credentials: "include",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      setSuccess("Action completed.");
      router.refresh();
    });
  }

  function saveMappings() {
    clearFeedback();

    startTransition(async () => {
      const response = await fetch(`${apiBaseUrl}/v1/compliance/integration`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          environment,
          mappings: props.integration.mappings.map((entry) => ({
            bankAccountId: entry.bankAccountId,
            paymentMeansCode: mappings[entry.bankAccountId] || null,
          })),
        }),
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      setSuccess("Payment means saved.");
      router.refresh();
    });
  }

  function prepareOnboarding() {
    if (!deviceSerial.trim() || !commonName.trim() || !organizationName.trim() || !vatNumber.trim()) {
      setError("Device serial, common name, organization name, and VAT number are required.");
      return;
    }

    runLifecycle("/v1/compliance/onboarding/prepare", {
      deviceSerial: deviceSerial.trim(),
      commonName: commonName.trim(),
      organizationUnitName: organizationUnitName.trim() || undefined,
      organizationName: organizationName.trim(),
      vatNumber: vatNumber.trim(),
      branchName: branchName.trim() || undefined,
      countryCode: countryCode.trim() || undefined,
      locationAddress: locationAddress.trim() || undefined,
      industry: industry.trim() || undefined,
    });
  }

  function submitOtp() {
    if (!otpCode.trim()) {
      setError("Enter OTP first.");
      return;
    }

    withOnboardingId(async (onboardingId) => {
      const response = await fetch(
        `${apiBaseUrl}/v1/compliance/onboarding/${onboardingId}/submit-otp`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            otpCode: otpCode.trim(),
          }),
        },
      );

      if (!response.ok) {
        setError(await readError(response));
        return false;
      }

      setOtpCode("");
      setSuccess("OTP submitted.");
      return true;
    });
  }

  function renewOnboarding() {
    if (!renewOtpCode.trim()) {
      setError("Enter renewal OTP first.");
      return;
    }

    withOnboardingId(async (onboardingId) => {
      const response = await fetch(
        `${apiBaseUrl}/v1/compliance/onboarding/${onboardingId}/renew`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            otpCode: renewOtpCode.trim(),
          }),
        },
      );

      if (!response.ok) {
        setError(await readError(response));
        return false;
      }

      setRenewOtpCode("");
      setSuccess("Device renewed.");
      return true;
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">E-Invoice Integration</p>
            <p className="text-sm text-slate-500">
              Manage ZATCA device onboarding and monitor compliance lifecycle events.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-slate-950">
                  Admin Compliance Console
                </h3>
                <div className="space-y-1 text-sm text-slate-600">
                  <p>
                    Organization:{" "}
                    <strong>{presentOrganizationName(props.integration.organizationName)}</strong>
                  </p>
                  <p>Environment: {environment}</p>
                  <p>VAT Number: {props.integration.taxNumber ?? "Not configured"}</p>
                  <p>Device Serial: {onboarding?.deviceSerial ?? "Not registered"}</p>
                  <p>Device Name: {onboarding?.deviceName ?? "Not registered"}</p>
                  <p>CSID: {onboarding?.csid ?? "Not issued"}</p>
                  <p>Certificate ID: {onboarding?.certificateId ?? "Not issued"}</p>
                  <p>
                    Certificate Expires:{" "}
                    {onboarding?.certificateExpiresAt
                      ? onboarding.certificateExpiresAt.slice(0, 19).replace("T", " ")
                      : "Unknown"}
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
                <StatusBadge
                  label={props.integration.status === "REGISTERED" ? "Registered" : "Not Registered"}
                  tone={props.integration.status === "REGISTERED" ? "success" : "warning"}
                />
                <StatusBadge
                  label={statusLabel(onboardingStatus)}
                  tone={onboardingStatus === "ACTIVE" ? "success" : "warning"}
                />
                <StatusBadge
                  label={statusLabel(certificateStatus)}
                  tone={certificateStatus === "ACTIVE" ? "success" : "warning"}
                />
              </div>
            </div>

            {onboarding?.lastError ? (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {onboarding.lastError}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-950">Onboarding Lifecycle</h3>
              <p className="text-sm text-slate-500">
                Prepare device identity, generate CSR, submit OTP, then activate/renew/revoke certificate.
              </p>
            </div>

            {!props.canManageLifecycle ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Lifecycle actions are admin-only. You need organization management access.
              </p>
            ) : null}

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Device Serial</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={!props.canManageLifecycle || isPending}
                  onChange={(event) => setDeviceSerial(event.target.value)}
                  value={deviceSerial}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Common Name</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={!props.canManageLifecycle || isPending}
                  onChange={(event) => setCommonName(event.target.value)}
                  value={commonName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Organization Name</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={!props.canManageLifecycle || isPending}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  value={organizationName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">VAT Number</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={!props.canManageLifecycle || isPending}
                  onChange={(event) => setVatNumber(event.target.value)}
                  value={vatNumber}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Organization Unit</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={!props.canManageLifecycle || isPending}
                  onChange={(event) => setOrganizationUnitName(event.target.value)}
                  value={organizationUnitName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Branch Name</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={!props.canManageLifecycle || isPending}
                  onChange={(event) => setBranchName(event.target.value)}
                  value={branchName}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Country Code</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={!props.canManageLifecycle || isPending}
                  maxLength={3}
                  onChange={(event) => setCountryCode(event.target.value)}
                  value={countryCode}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700">Industry</span>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={!props.canManageLifecycle || isPending}
                  onChange={(event) => setIndustry(event.target.value)}
                  value={industry}
                />
              </label>
            </div>

            <label className="mt-3 block space-y-1 text-sm">
              <span className="font-medium text-slate-700">Location Address</span>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                disabled={!props.canManageLifecycle || isPending}
                onChange={(event) => setLocationAddress(event.target.value)}
                value={locationAddress}
              />
            </label>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                className={actionClass("green")}
                disabled={!props.canManageLifecycle || isPending}
                onClick={prepareOnboarding}
                type="button"
              >
                Prepare Draft
              </Button>
              <Button
                className={actionClass("slate")}
                disabled={
                  !props.canManageLifecycle ||
                  !onboarding?.id ||
                  isPending ||
                  !["DRAFT", "FAILED"].includes(onboardingStatus)
                }
                onClick={() =>
                  runLifecycle(`/v1/compliance/onboarding/${onboarding?.id}/generate-csr`)
                }
                type="button"
              >
                Generate CSR
              </Button>
              <Button
                className={actionClass("slate")}
                disabled={
                  !props.canManageLifecycle ||
                  !onboarding?.id ||
                  isPending ||
                  onboardingStatus !== "CSR_GENERATED"
                }
                onClick={() =>
                  runLifecycle(`/v1/compliance/onboarding/${onboarding?.id}/request-otp`)
                }
                type="button"
              >
                Request OTP
              </Button>
              <Button
                className={actionClass("green")}
                disabled={
                  !props.canManageLifecycle ||
                  !onboarding?.id ||
                  isPending ||
                  !["CERTIFICATE_ISSUED", "CSR_SUBMITTED", "ACTIVE", "FAILED"].includes(
                    onboardingStatus,
                  )
                }
                onClick={() =>
                  runLifecycle(`/v1/compliance/onboarding/${onboarding?.id}/activate`)
                }
                type="button"
              >
                Activate Device
              </Button>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={!props.canManageLifecycle || isPending || !onboarding?.id}
                onChange={(event) => setOtpCode(event.target.value)}
                placeholder="OTP for compliance CSID issuance"
                value={otpCode}
              />
              <Button
                className={actionClass("green")}
                disabled={
                  !props.canManageLifecycle ||
                  !onboarding?.id ||
                  isPending ||
                  onboardingStatus !== "OTP_PENDING"
                }
                onClick={submitOtp}
                type="button"
              >
                Submit OTP
              </Button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={!props.canManageLifecycle || isPending || !onboarding?.id}
                onChange={(event) => setRenewOtpCode(event.target.value)}
                placeholder="OTP for certificate renewal"
                value={renewOtpCode}
              />
              <Button
                className={actionClass("green")}
                disabled={
                  !props.canManageLifecycle ||
                  !onboarding?.id ||
                  isPending ||
                  !["ACTIVE", "RENEWAL_REQUIRED"].includes(onboardingStatus)
                }
                onClick={renewOnboarding}
                type="button"
              >
                Renew Device
              </Button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={!props.canManageLifecycle || isPending || !onboarding?.id}
                onChange={(event) => setRevokeReason(event.target.value)}
                placeholder="Revocation reason (optional)"
                value={revokeReason}
              />
              <Button
                className={actionClass("red")}
                disabled={
                  !props.canManageLifecycle ||
                  !onboarding?.id ||
                  isPending ||
                  onboardingStatus === "REVOKED"
                }
                onClick={() =>
                  runLifecycle(`/v1/compliance/onboarding/${onboarding?.id}/revoke`, {
                    reason: revokeReason.trim() || undefined,
                  })
                }
                type="button"
              >
                Revoke Device
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-950">Compliance Timeline</h3>
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
                  Configure payment means mappings
                </h3>
                <p className="text-sm text-slate-500">
                  Map bank accounts to UNCL4461 payment means codes used during UBL generation.
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
                              [entry.bankAccountId]: event.target.value,
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
