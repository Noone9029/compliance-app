"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ConnectorAccountRecord, ConnectorProvider } from "@daftar/types";
import { Button, Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

const CONNECTOR_PROVIDER_OPTIONS: Array<{
  provider: ConnectorProvider;
  label: string;
  description: string;
}> = [
  {
    provider: "XERO",
    label: "Xero",
    description: "Connect your Xero organization and import contacts plus invoices.",
  },
  {
    provider: "QUICKBOOKS_ONLINE",
    label: "QuickBooks Online",
    description: "Connect your QuickBooks company and sync accounting records.",
  },
  {
    provider: "ZOHO_BOOKS",
    label: "Zoho Books",
    description: "Connect Zoho Books with regional API-domain aware credential handling.",
  },
];

function connectorProviderLabel(provider: ConnectorProvider) {
  if (provider === "QUICKBOOKS_ONLINE") {
    return "QuickBooks Online";
  }

  if (provider === "ZOHO_BOOKS") {
    return "Zoho Books";
  }

  return "Xero";
}

function decodeConnectorProviderFromState(state: string): ConnectorProvider | null {
  try {
    const normalized = state.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const payload = JSON.parse(atob(`${normalized}${padding}`)) as {
      provider?: unknown;
    };

    if (
      payload.provider === "XERO" ||
      payload.provider === "QUICKBOOKS_ONLINE" ||
      payload.provider === "ZOHO_BOOKS"
    ) {
      return payload.provider;
    }

    return null;
  } catch {
    return null;
  }
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

  const fallback = await response.text();
  return fallback || "Request failed.";
}

export function ConnectorLiveControls(props: {
  orgSlug: string;
  accounts: ConnectorAccountRecord[];
  canWriteConnectors: boolean;
  canSyncConnectors: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeProvider, setActiveProvider] = useState<ConnectorProvider | null>(null);
  const [activeSyncAccountId, setActiveSyncAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const hasProcessedCallback = useRef(false);
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    [],
  );

  const accountsByProvider = useMemo(
    () => new Map(props.accounts.map((account) => [account.provider, account])),
    [props.accounts],
  );

  const connectedAccounts = useMemo(
    () => props.accounts.filter((account) => account.status === "CONNECTED"),
    [props.accounts],
  );

  const settingsPath = useMemo(
    () => `/${props.orgSlug}/settings/connector-settings`,
    [props.orgSlug],
  );

  useEffect(() => {
    if (hasProcessedCallback.current || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const realmId = params.get("realmId");
    const oauthError = params.get("error");
    const oauthErrorDescription = params.get("error_description");

    if (!oauthError && (!code || !state)) {
      return;
    }

    hasProcessedCallback.current = true;

    startTransition(async () => {
      setError(null);
      setSuccess(null);

      if (oauthError) {
        setError(oauthErrorDescription?.trim() || `Provider authorization failed: ${oauthError}`);
        router.replace(settingsPath);
        return;
      }

      const provider = decodeConnectorProviderFromState(state!);

      if (!provider) {
        setError("Could not determine connector provider from callback state.");
        router.replace(settingsPath);
        return;
      }

      const redirectUri = `${window.location.origin}${settingsPath}`;
      const response = await fetch(
        `${apiBaseUrl}/v1/connectors/providers/${provider}/callback`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            code,
            state,
            redirectUri,
            realmId: realmId?.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        setError(await readError(response));
        router.replace(settingsPath);
        return;
      }

      setSuccess(`${connectorProviderLabel(provider)} account connected.`);
      router.replace(settingsPath);
      router.refresh();
    });
  }, [apiBaseUrl, router, settingsPath]);

  function connectProvider(provider: ConnectorProvider) {
    if (!props.canWriteConnectors || typeof window === "undefined") {
      return;
    }

    startTransition(async () => {
      setError(null);
      setSuccess(null);
      setActiveProvider(provider);

      try {
        const redirectUri = `${window.location.origin}${settingsPath}`;
        const params = new URLSearchParams({ redirectUri });
        const response = await fetch(
          `${apiBaseUrl}/v1/connectors/providers/${provider}/connect-url?${params.toString()}`,
          {
            credentials: "include",
          },
        );

        if (!response.ok) {
          setError(await readError(response));
          return;
        }

        const payload = (await response.json()) as { authorizationUrl?: unknown };
        if (
          typeof payload.authorizationUrl !== "string" ||
          payload.authorizationUrl.trim().length === 0
        ) {
          setError("Provider connect URL was empty.");
          return;
        }

        window.location.assign(payload.authorizationUrl);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Connector launch failed.");
      } finally {
        setActiveProvider(null);
      }
    });
  }

  function runImportSync(connectorAccountId: string) {
    if (!props.canSyncConnectors) {
      return;
    }

    startTransition(async () => {
      setError(null);
      setSuccess(null);
      setActiveSyncAccountId(connectorAccountId);

      try {
        const response = await fetch(
          `${apiBaseUrl}/v1/connectors/accounts/${connectorAccountId}/sync`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              direction: "IMPORT",
            }),
          },
        );

        if (!response.ok) {
          setError(await readError(response));
          return;
        }

        setSuccess("Import sync started successfully.");
        router.refresh();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Import sync failed.");
      } finally {
        setActiveSyncAccountId(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Connect accounting providers</h2>
          <p className="text-sm text-slate-500">
            Launch OAuth for each provider, complete callback on this page, and run import sync for connected accounts.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!props.canWriteConnectors ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Connector connection actions require the <code>connectors.write</code> permission.
          </p>
        ) : null}

        <div className="space-y-3">
          {CONNECTOR_PROVIDER_OPTIONS.map((option) => {
            const account = accountsByProvider.get(option.provider);
            const isConnected = account?.status === "CONNECTED";
            const statusLabel = account?.status ?? "NOT_CONNECTED";
            const isLaunching = activeProvider === option.provider;

            return (
              <div
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
                key={option.provider}
              >
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">{option.label}</p>
                  <p className="text-sm text-slate-600">{option.description}</p>
                  <p className="text-xs text-slate-500">
                    {account
                      ? `Account: ${account.displayName}`
                      : "No account connected for this provider yet."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    label={statusLabel}
                    tone={
                      statusLabel === "CONNECTED"
                        ? "success"
                        : statusLabel === "ERROR"
                          ? "warning"
                          : "neutral"
                    }
                  />
                  <Button
                    disabled={!props.canWriteConnectors || isPending}
                    onClick={() => connectProvider(option.provider)}
                    type="button"
                  >
                    {isLaunching
                      ? "Opening..."
                      : isConnected
                        ? `Reconnect ${option.label}`
                        : `Connect ${option.label}`}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900">Import sync</h3>
            <p className="text-sm text-slate-500">
              Run a live import for each connected connector account.
            </p>
          </div>

          {connectedAccounts.length === 0 ? (
            <p className="text-sm text-slate-500">Connect at least one provider to run import sync.</p>
          ) : (
            <div className="space-y-2">
              {connectedAccounts.map((account) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
                  key={account.id}
                >
                  <div className="text-sm text-slate-700">
                    <p className="font-medium">{account.displayName}</p>
                    <p>{connectorProviderLabel(account.provider)}</p>
                  </div>
                  <Button
                    disabled={!props.canSyncConnectors || isPending}
                    onClick={() => runImportSync(account.id)}
                    type="button"
                  >
                    {activeSyncAccountId === account.id ? "Running..." : "Run import sync"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!props.canSyncConnectors ? (
            <p className="text-sm text-amber-700">
              Import sync requires the <code>connectors.sync</code> permission.
            </p>
          ) : null}
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      </CardContent>
    </Card>
  );
}
