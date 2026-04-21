import { afterEach, describe, expect, it, vi } from "vitest";

import { ZohoApiClient } from "./zoho.api";

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

  const api = new ZohoApiClient(prisma, transport, connectorCredentials);

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

describe("zoho api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses decrypted credential access token and persisted apiDomain for live API calls", async () => {
    const { api, mocks } = createHarness();
    const accessToken = "zoho-access-live";

    mocks.findUnique.mockResolvedValue({
      id: "conn_zoho_1",
      provider: "ZOHO_BOOKS",
      externalTenantId: "zoho-org-123"
    });
    mocks.getDecryptedCredentials.mockResolvedValue({
      connectorAccountId: "conn_zoho_1",
      provider: "ZOHO_BOOKS",
      accessToken,
      refreshToken: "zoho-refresh-live",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      tokenType: "Bearer",
      scopes: ["ZohoBooks.fullaccess.all"],
      credentialMetadata: {
        apiDomain: "https://www.zohoapis.eu"
      },
      rotationCount: 0,
      lastRotatedAt: null
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        contacts: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const contacts = await api.listContacts("conn_zoho_1");

    expect(contacts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization).toBe(
      `Zoho-oauthtoken ${accessToken}`
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://www.zohoapis.eu/books/v3/contacts"
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "organization_id=zoho-org-123"
    );
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.rotateCredentials).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refreshes expiring credentials through the credential service boundary", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_zoho_2",
      provider: "ZOHO_BOOKS",
      externalTenantId: "zoho-org-refresh"
    });
    mocks.getDecryptedCredentials.mockResolvedValue({
      connectorAccountId: "conn_zoho_2",
      provider: "ZOHO_BOOKS",
      accessToken: "zoho-old-access",
      refreshToken: "zoho-old-refresh",
      expiresAt: new Date(Date.now() + 15 * 1000),
      tokenType: "Bearer",
      scopes: ["ZohoBooks.fullaccess.all"],
      credentialMetadata: {
        apiDomain: "https://www.zohoapis.eu"
      },
      rotationCount: 1,
      lastRotatedAt: new Date("2026-04-21T00:00:00.000Z")
    });
    mocks.refreshAccessToken.mockResolvedValue({
      accessToken: "zoho-new-access",
      refreshToken: "zoho-new-refresh",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["ZohoBooks.fullaccess.all"],
      externalTenantId: null,
      displayName: "Zoho Books",
      raw: { token_type: "Bearer" }
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        invoices: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const invoices = await api.listInvoices("conn_zoho_2");

    expect(invoices).toEqual([]);
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith({
      refreshToken: "zoho-old-refresh"
    });
    expect(mocks.rotateCredentials).toHaveBeenCalledWith(
      {
        connectorAccountId: "conn_zoho_2",
        provider: "ZOHO_BOOKS",
        tokenSet: {
          accessToken: "zoho-new-access",
          refreshToken: "zoho-new-refresh",
          expiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["ZohoBooks.fullaccess.all"],
          externalTenantId: null,
          displayName: "Zoho Books",
          raw: { token_type: "Bearer" }
        }
      },
      expect.any(Object)
    );
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "conn_zoho_2" },
      data: {
        scopes: ["ZohoBooks.fullaccess.all"]
      }
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization).toBe(
      "Zoho-oauthtoken zoho-new-access"
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://www.zohoapis.eu/books/v3/invoices"
    );
  });

  it("surfaces credential-missing failures", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_zoho_legacy",
      provider: "ZOHO_BOOKS",
      externalTenantId: "zoho-org-legacy"
    });
    mocks.getDecryptedCredentials.mockRejectedValue(
      new Error("Connector credentials are missing for this account.")
    );

    await expect(api.listContacts("conn_zoho_legacy")).rejects.toThrow(/missing/i);
    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires organization id before attempting API calls", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_zoho_missing_org",
      provider: "ZOHO_BOOKS",
      externalTenantId: null
    });

    await expect(api.listInvoices("conn_zoho_missing_org")).rejects.toThrow(
      /organization_id is missing/i
    );
    expect(mocks.getDecryptedCredentials).not.toHaveBeenCalled();
  });

  it("uses a single refresh operation for concurrent requests on the same connector account", async () => {
    const { api, mocks } = createHarness();

    mocks.findUnique.mockResolvedValue({
      id: "conn_zoho_concurrent",
      provider: "ZOHO_BOOKS",
      externalTenantId: "zoho-org-concurrent"
    });
    mocks.getDecryptedCredentials.mockResolvedValue({
      connectorAccountId: "conn_zoho_concurrent",
      provider: "ZOHO_BOOKS",
      accessToken: "zoho-old-access",
      refreshToken: "zoho-old-refresh",
      expiresAt: new Date(Date.now() + 15 * 1000),
      tokenType: "Bearer",
      scopes: ["ZohoBooks.fullaccess.all"],
      credentialMetadata: {
        apiDomain: "https://www.zohoapis.eu"
      },
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
      if (target.includes("/books/v3/contacts")) {
        return {
          ok: true,
          json: async () => ({ contacts: [] })
        };
      }

      return {
        ok: true,
        json: async () => ({ invoices: [] })
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const contactsPromise = api.listContacts("conn_zoho_concurrent");
    const invoicesPromise = api.listInvoices("conn_zoho_concurrent");

    await vi.waitFor(() => {
      expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
    });

    resolveRefresh({
      accessToken: "zoho-new-access",
      refreshToken: "zoho-new-refresh",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["ZohoBooks.fullaccess.all"],
      externalTenantId: null,
      displayName: "Zoho Books",
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
          String(call[0]).startsWith("https://www.zohoapis.eu/books/v3/") &&
          (call[1]?.headers as Record<string, string> | undefined)
            ?.Authorization === "Zoho-oauthtoken zoho-new-access"
      )
    ).toBe(true);
  });
});
