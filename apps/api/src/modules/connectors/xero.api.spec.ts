import { afterEach, describe, expect, it, vi } from "vitest";

import { XeroApiClient } from "./xero.api";

function createHarness() {
  const findUnique = vi.fn();
  const update = vi.fn();
  const refreshAccessToken = vi.fn();
  const getDecryptedCredentials = vi.fn();
  const rotateCredentials = vi.fn();

  const connectorAccount = {
    findUnique,
    update
  };

  const prisma = {
    connectorAccount,
    $transaction: vi.fn(
      async (
        callback: (tx: {
          connectorAccount: typeof connectorAccount;
        }) => Promise<void>
      ) => callback({ connectorAccount })
    )
  } as any;

  const transport = {
    refreshAccessToken
  } as any;

  const connectorCredentials = {
    getDecryptedCredentials,
    rotateCredentials
  } as any;

  const api = new XeroApiClient(prisma, transport, connectorCredentials);

  return {
    api,
    mocks: {
      findUnique,
      update,
      refreshAccessToken,
      getDecryptedCredentials,
      rotateCredentials
    }
  };
}

describe("xero api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses decrypted credential access token for live API calls", async () => {
    const { api, mocks } = createHarness();
    const accessToken = "xero-access-live";

    mocks.findUnique.mockResolvedValue({
      id: "conn_xero_1",
      provider: "XERO",
      externalTenantId: "tenant-abc-123"
    });
    mocks.getDecryptedCredentials.mockResolvedValue({
      connectorAccountId: "conn_xero_1",
      provider: "XERO",
      accessToken,
      refreshToken: "xero-refresh-live",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      tokenType: "Bearer",
      scopes: ["accounting.contacts"],
      rotationCount: 0,
      lastRotatedAt: null
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Contacts: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const contacts = await api.listContacts("conn_xero_1");

    expect(contacts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization).toBe(
      `Bearer ${accessToken}`
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.["xero-tenant-id"]).toBe(
      "tenant-abc-123"
    );
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.rotateCredentials).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refreshes expiring credentials through the credential service boundary", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_xero_2",
      provider: "XERO",
      externalTenantId: "tenant-refresh-1"
    });
    mocks.getDecryptedCredentials.mockResolvedValue({
      connectorAccountId: "conn_xero_2",
      provider: "XERO",
      accessToken: "xero-old-access",
      refreshToken: "xero-old-refresh",
      expiresAt: new Date(Date.now() + 15 * 1000),
      tokenType: "Bearer",
      scopes: ["accounting.contacts"],
      rotationCount: 1,
      lastRotatedAt: new Date("2026-04-21T00:00:00.000Z")
    });
    mocks.refreshAccessToken.mockResolvedValue({
      accessToken: "xero-new-access",
      refreshToken: "xero-new-refresh",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["accounting.contacts", "accounting.transactions"],
      externalTenantId: null,
      displayName: "Xero",
      raw: { token_type: "Bearer" }
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Invoices: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const invoices = await api.listInvoices("conn_xero_2");

    expect(invoices).toEqual([]);
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith({
      refreshToken: "xero-old-refresh"
    });
    expect(mocks.rotateCredentials).toHaveBeenCalledWith(
      {
        connectorAccountId: "conn_xero_2",
        provider: "XERO",
        tokenSet: {
          accessToken: "xero-new-access",
          refreshToken: "xero-new-refresh",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["accounting.contacts", "accounting.transactions"],
          externalTenantId: null,
          displayName: "Xero",
          raw: { token_type: "Bearer" }
        }
      },
      expect.any(Object)
    );
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "conn_xero_2" },
      data: {
        scopes: ["accounting.contacts", "accounting.transactions"]
      }
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization).toBe(
      "Bearer xero-new-access"
    );
  });

  it("surfaces credential-missing failures", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_xero_legacy",
      provider: "XERO",
      externalTenantId: "tenant-legacy"
    });
    mocks.getDecryptedCredentials.mockRejectedValue(
      new Error("Connector credentials are missing for this account.")
    );

    await expect(api.listContacts("conn_xero_legacy")).rejects.toThrow(/missing/i);
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires external tenant id before attempting API calls", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_xero_missing_tenant",
      provider: "XERO",
      externalTenantId: null
    });

    await expect(api.listInvoices("conn_xero_missing_tenant")).rejects.toThrow(
      /tenantId is missing/i
    );
    expect(mocks.getDecryptedCredentials).not.toHaveBeenCalled();
  });

  it("uses a single refresh operation for concurrent requests on the same connector account", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_xero_concurrent",
      provider: "XERO",
      externalTenantId: "tenant-concurrent-1"
    });
    mocks.getDecryptedCredentials.mockResolvedValue({
      connectorAccountId: "conn_xero_concurrent",
      provider: "XERO",
      accessToken: "xero-old-access",
      refreshToken: "xero-old-refresh",
      expiresAt: new Date(Date.now() + 15 * 1000),
      tokenType: "Bearer",
      scopes: ["accounting.contacts"],
      rotationCount: 1,
      lastRotatedAt: new Date("2026-04-21T00:00:00.000Z")
    });

    let resolveRefresh!: (value: {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      scopes: string[];
      externalTenantId: null;
      displayName: string;
      raw: { token_type: string };
    }) => void;
    const refreshPromise = new Promise<{
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
      scopes: string[];
      externalTenantId: null;
      displayName: string;
      raw: { token_type: string };
    }>((resolve) => {
      resolveRefresh = resolve;
    });

    mocks.refreshAccessToken.mockImplementation(() => refreshPromise);

    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/Contacts")) {
        return {
          ok: true,
          json: async () => ({ Contacts: [] })
        };
      }

      return {
        ok: true,
        json: async () => ({ Invoices: [] })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const contactsPromise = api.listContacts("conn_xero_concurrent");
    const invoicesPromise = api.listInvoices("conn_xero_concurrent");

    await vi.waitFor(() => {
      expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
    });

    resolveRefresh({
      accessToken: "xero-new-access",
      refreshToken: "xero-new-refresh",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["accounting.contacts", "accounting.transactions"],
      externalTenantId: null,
      displayName: "Xero",
      raw: { token_type: "Bearer" }
    });

    const [contacts, invoices] = await Promise.all([
      contactsPromise,
      invoicesPromise
    ]);

    expect(contacts).toEqual([]);
    expect(invoices).toEqual([]);
    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.rotateCredentials).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(
        (call) =>
          (call[1]?.headers as Record<string, string> | undefined)
            ?.Authorization === "Bearer xero-new-access"
      )
    ).toBe(true);
  });
});
