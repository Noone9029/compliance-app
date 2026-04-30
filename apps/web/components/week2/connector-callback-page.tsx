"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@daftar/ui";

import {
  connectorProviderLabel,
  decodeConnectorProviderFromState,
  readError
} from "./connector-live-controls";

type SessionResponse = {
  authenticated?: boolean;
  organization?: {
    slug?: unknown;
  } | null;
};

async function resolveSettingsPath(apiBaseUrl: string) {
  const response = await fetch(`${apiBaseUrl}/v1/auth/session`, {
    credentials: "include"
  });

  if (!response.ok) {
    return null;
  }

  const session = (await response.json()) as SessionResponse;
  const slug = session.organization?.slug;
  if (session.authenticated !== true || typeof slug !== "string" || slug.trim().length === 0) {
    return null;
  }

  return `/${slug}/settings/connector-settings`;
}

export function ConnectorCallbackPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasProcessedCallback = useRef(false);
  const [message, setMessage] = useState("Completing connector authorization...");
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );

  useEffect(() => {
    if (hasProcessedCallback.current || typeof window === "undefined") {
      return;
    }

    hasProcessedCallback.current = true;

    startTransition(async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const realmId = params.get("realmId");
      const oauthError = params.get("error");
      const oauthErrorDescription = params.get("error_description");

      if (oauthError) {
        setError(oauthErrorDescription?.trim() || `Provider authorization failed: ${oauthError}`);
        return;
      }

      if (!code || !state) {
        setError("Connector callback is missing the authorization code or state.");
        return;
      }

      const provider = decodeConnectorProviderFromState(state);
      if (!provider) {
        setError("Could not determine connector provider from callback state.");
        return;
      }

      const response = await fetch(
        `${apiBaseUrl}/v1/connectors/providers/${provider}/callback`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            code,
            state,
            realmId: realmId?.trim() || undefined
          })
        }
      );

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      setMessage(`${connectorProviderLabel(provider)} account connected. Redirecting...`);

      const settingsPath = await resolveSettingsPath(apiBaseUrl);
      router.replace(settingsPath ?? "/sign-in");
      router.refresh();
    });
  }, [apiBaseUrl, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <h1 className="text-lg font-semibold text-slate-950">Connector Authorization</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error
              ? "Return to connector settings and start the provider connection again."
              : "Keep this page open while Daftar finishes the provider callback."}
          </p>
        </CardHeader>
        <CardContent>
          <p className={error ? "text-sm text-red-700" : "text-sm text-slate-700"}>
            {error ?? message}
          </p>
          {isPending ? <p className="mt-3 text-xs text-slate-500">Processing...</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
