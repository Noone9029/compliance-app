import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectorAccountRecord } from "@daftar/types";

const router = {
  refresh: vi.fn(),
  replace: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { ConnectorLiveControls } from "./connector-live-controls";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

const connectedAccounts: ConnectorAccountRecord[] = [
  {
    id: "connector_1",
    organizationId: "org_1",
    provider: "XERO",
    displayName: "Nomad Events Xero",
    status: "CONNECTED",
    externalTenantId: "tenant_123",
    scopes: ["contacts", "invoices"],
    connectedAt: "2026-04-01T00:00:00.000Z",
    lastSyncedAt: "2026-04-12T00:00:00.000Z",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
  },
];

describe("ConnectorLiveControls", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/nomad-events/settings/connector-settings");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("completes provider callback from query params and refreshes connector data", async () => {
    const state = Buffer.from(
      JSON.stringify({
        organizationId: "org_1",
        userId: "user_1",
        provider: "QUICKBOOKS_ONLINE",
        nonce: "nonce_1",
      }),
      "utf8",
    ).toString("base64url");

    window.history.replaceState(
      {},
      "",
      `/nomad-events/settings/connector-settings?code=auth_code&state=${encodeURIComponent(state)}&realmId=realm_123`,
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "connector_qbo" }, 201));

    render(
      <ConnectorLiveControls
        accounts={[]}
        canSyncConnectors
        canWriteConnectors
        orgSlug="nomad-events"
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4000/v1/connectors/providers/QUICKBOOKS_ONLINE/callback");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    const expectedRedirectUri = `${window.location.origin}/nomad-events/settings/connector-settings`;
    expect(init.body).toBe(
      JSON.stringify({
        code: "auth_code",
        state,
        redirectUri: expectedRedirectUri,
        realmId: "realm_123",
      }),
    );

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/nomad-events/settings/connector-settings"),
    );
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByText("QuickBooks Online account connected.")).toBeTruthy();
  });

  it("runs import sync for connected accounts", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    render(
      <ConnectorLiveControls
        accounts={connectedAccounts}
        canSyncConnectors
        canWriteConnectors
        orgSlug="nomad-events"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run import sync" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4000/v1/connectors/accounts/connector_1/sync");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBe(JSON.stringify({ direction: "IMPORT" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(screen.getByText("Import sync started successfully.")).toBeTruthy();
  });
});
