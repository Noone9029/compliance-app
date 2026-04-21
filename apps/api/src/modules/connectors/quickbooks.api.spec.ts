import { afterEach, describe, expect, it, vi } from "vitest";

import { QuickBooksApiClient } from "./quickbooks.api";

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

  const api = new QuickBooksApiClient(prisma, transport, connectorCredentials);

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

describe("quickbooks api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses decrypted credential access token for live API calls", async () => {
    const { api, mocks } = createHarness();
    const accessToken = "access-token-live";

    mocks.findUnique.mockResolvedValue({
      id: "conn_1",
      provider: "QUICKBOOKS_ONLINE",
      externalTenantId: "realm-12345"
    });
    mocks.getDecryptedCredentials.mockResolvedValue({
      connectorAccountId: "conn_1",
      provider: "QUICKBOOKS_ONLINE",
      accessToken,
      refreshToken: "refresh-token-live",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      tokenType: "bearer",
      scopes: ["customers.read"],
      rotationCount: 0,
      lastRotatedAt: null
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        QueryResponse: {
          Invoice: []
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const invoices = await api.listInvoices("conn_1");

    expect(invoices).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization).toBe(
      `Bearer ${accessToken}`
    );
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.rotateCredentials).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refreshes expiring credentials through the credential service boundary", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_1",
      provider: "QUICKBOOKS_ONLINE",
      externalTenantId: "realm-12345"
    });
    mocks.getDecryptedCredentials.mockResolvedValue({
      connectorAccountId: "conn_1",
      provider: "QUICKBOOKS_ONLINE",
      accessToken: "old-access",
      refreshToken: "old-refresh",
      expiresAt: new Date(Date.now() + 15 * 1000),
      tokenType: "bearer",
      scopes: ["customers.read"],
      rotationCount: 2,
      lastRotatedAt: new Date("2026-04-21T00:00:00.000Z")
    });
    mocks.refreshAccessToken.mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["customers.read", "invoices.read"],
      externalTenantId: null,
      displayName: "QuickBooks",
      raw: { token_type: "bearer" }
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        QueryResponse: {
          Customer: []
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const customers = await api.listCustomers("conn_1");

    expect(customers).toEqual([]);
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith({
      refreshToken: "old-refresh"
    });
    expect(mocks.rotateCredentials).toHaveBeenCalledWith(
      {
        connectorAccountId: "conn_1",
        provider: "QUICKBOOKS_ONLINE",
        tokenSet: {
          accessToken: "new-access",
          refreshToken: "new-refresh",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["customers.read", "invoices.read"],
          externalTenantId: null,
          displayName: "QuickBooks",
          raw: { token_type: "bearer" }
        }
      },
      expect.any(Object)
    );
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "conn_1" },
      data: {
        scopes: ["customers.read", "invoices.read"]
      }
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization).toBe(
      "Bearer new-access"
    );
  });

  it("surfaces credential-missing failures", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_legacy",
      provider: "QUICKBOOKS_ONLINE",
      externalTenantId: "realm-legacy"
    });
    mocks.getDecryptedCredentials.mockRejectedValue(
      new Error("Connector credentials are missing for this account.")
    );

    await expect(api.listCustomers("conn_legacy")).rejects.toThrow(/missing/i);
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("uses a single refresh operation for concurrent requests on the same connector account", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_qbo_concurrent",
      provider: "QUICKBOOKS_ONLINE",
      externalTenantId: "realm-concurrent-1"
    });
    mocks.getDecryptedCredentials.mockResolvedValue({
      connectorAccountId: "conn_qbo_concurrent",
      provider: "QUICKBOOKS_ONLINE",
      accessToken: "qbo-old-access",
      refreshToken: "qbo-old-refresh",
      expiresAt: new Date(Date.now() + 15 * 1000),
      tokenType: "bearer",
      scopes: ["customers.read"],
      rotationCount: 2,
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
      if (target.includes("FROM%20Customer")) {
        return {
          ok: true,
          json: async () => ({
            QueryResponse: {
              Customer: []
            }
          })
        };
      }

      return {
        ok: true,
        json: async () => ({
          QueryResponse: {
            Invoice: []
          }
        })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const customersPromise = api.listCustomers("conn_qbo_concurrent");
    const invoicesPromise = api.listInvoices("conn_qbo_concurrent");

    await vi.waitFor(() => {
      expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
    });

    resolveRefresh({
      accessToken: "qbo-new-access",
      refreshToken: "qbo-new-refresh",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["customers.read", "invoices.read"],
      externalTenantId: null,
      displayName: "QuickBooks",
      raw: { token_type: "bearer" }
    });

    const [customers, invoices] = await Promise.all([
      customersPromise,
      invoicesPromise
    ]);

    expect(customers).toEqual([]);
    expect(invoices).toEqual([]);
    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.rotateCredentials).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(
        (call) =>
          (call[1]?.headers as Record<string, string> | undefined)
            ?.Authorization === "Bearer qbo-new-access"
      )
    ).toBe(true);
  });
});
