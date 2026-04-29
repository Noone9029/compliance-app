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

function providerResponse(input: {
  ok: boolean;
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
}) {
  return {
    ok: input.ok,
    status: input.status ?? (input.ok ? 200 : 500),
    headers: new Headers(input.headers),
    json: async () => input.body,
    text: async () =>
      typeof input.body === "string" ? input.body : JSON.stringify(input.body)
  };
}

function mockConnectedXeroAccount(mocks: ReturnType<typeof createHarness>["mocks"]) {
  mocks.findUnique.mockResolvedValue({
    id: "conn_xero_retry",
    provider: "XERO",
    externalTenantId: "tenant-retry-1"
  });
  mocks.getDecryptedCredentials.mockResolvedValue({
    connectorAccountId: "conn_xero_retry",
    provider: "XERO",
    accessToken: "xero-access-retry",
    refreshToken: "xero-refresh-retry",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    tokenType: "Bearer",
    scopes: ["accounting.contacts"],
    rotationCount: 0,
    lastRotatedAt: null
  });
}

function xeroContactsPage(page: number, count: number) {
  return Array.from({ length: count }, (_value, index) => ({
    ContactID: `contact-${page}-${index + 1}`,
    Name: `Customer ${page}-${index + 1}`
  }));
}

function xeroInvoicesPage(page: number, count: number) {
  return Array.from({ length: count }, (_value, index) => ({
    InvoiceID: `invoice-${page}-${index + 1}`,
    Type: "ACCREC"
  }));
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

  it("fetches multiple contact pages and concatenates contacts until an empty page", async () => {
    const { api, mocks } = createHarness();
    mockConnectedXeroAccount(mocks);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse({
          ok: true,
          body: {
            Contacts: xeroContactsPage(1, 100)
          }
        })
      )
      .mockResolvedValueOnce(
        providerResponse({
          ok: true,
          body: {
            Contacts: xeroContactsPage(2, 1)
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const contacts = await api.listContacts("conn_xero_retry");

    expect(contacts).toHaveLength(101);
    expect(contacts[0]).toEqual({
      ContactID: "contact-1-1",
      Name: "Customer 1-1"
    });
    expect(contacts[100]).toEqual({
      ContactID: "contact-2-1",
      Name: "Customer 2-1"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map((call) =>
        new URL(String(call[0])).searchParams.get("page")
      )
    ).toEqual(["1", "2"]);
  });

  it("stops contact pagination after the first empty page", async () => {
    const { api, mocks } = createHarness();
    mockConnectedXeroAccount(mocks);

    const fetchMock = vi.fn().mockResolvedValue(
      providerResponse({
        ok: true,
        body: {
          Contacts: []
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const contacts = await api.listContacts("conn_xero_retry");

    expect(contacts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("page")
    ).toBe("1");
  });

  it("fetches multiple invoice pages while preserving the ACCREC where filter", async () => {
    const { api, mocks } = createHarness();
    mockConnectedXeroAccount(mocks);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse({
          ok: true,
          body: {
            Invoices: xeroInvoicesPage(1, 100)
          }
        })
      )
      .mockResolvedValueOnce(
        providerResponse({
          ok: true,
          body: {
            Invoices: xeroInvoicesPage(2, 1)
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const invoices = await api.listInvoices("conn_xero_retry");

    expect(invoices).toHaveLength(101);
    expect(invoices[0]).toEqual({ InvoiceID: "invoice-1-1", Type: "ACCREC" });
    expect(invoices[100]).toEqual({
      InvoiceID: "invoice-2-1",
      Type: "ACCREC"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map((call) => {
        const url = new URL(String(call[0]));
        return {
          page: url.searchParams.get("page"),
          where: url.searchParams.get("where")
        };
      })
    ).toEqual([
      { page: "1", where: 'Type=="ACCREC"' },
      { page: "2", where: 'Type=="ACCREC"' }
    ]);
  });

  it("applies If-Modified-Since while preserving contact pagination", async () => {
    const { api, mocks } = createHarness();
    mockConnectedXeroAccount(mocks);
    const modifiedSince = new Date("2026-04-29T12:34:56.000Z");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse({
          ok: true,
          body: {
            Contacts: xeroContactsPage(1, 100)
          }
        })
      )
      .mockResolvedValueOnce(
        providerResponse({
          ok: true,
          body: {
            Contacts: []
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const contacts = await api.listContacts("conn_xero_retry", {
      modifiedSince
    });

    expect(contacts).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.map((call) => ({
        page: new URL(String(call[0])).searchParams.get("page"),
        modifiedSince: call[1]?.headers?.["If-Modified-Since"]
      }))
    ).toEqual([
      { page: "1", modifiedSince: modifiedSince.toUTCString() },
      { page: "2", modifiedSince: modifiedSince.toUTCString() }
    ]);
  });

  it("applies If-Modified-Since while preserving invoice filter and page", async () => {
    const { api, mocks } = createHarness();
    mockConnectedXeroAccount(mocks);
    const modifiedSince = new Date("2026-04-29T12:34:56.000Z");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse({
          ok: true,
          body: {
            Invoices: xeroInvoicesPage(1, 1)
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const invoices = await api.listInvoices("conn_xero_retry", {
      modifiedSince
    });

    expect(invoices).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("where")).toBe('Type=="ACCREC"');
    expect(url.searchParams.get("page")).toBe("1");
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.["If-Modified-Since"]).toBe(
      modifiedSince.toUTCString()
    );
  });

  it("throws if Xero pagination exceeds the safety page cap", async () => {
    const { api, mocks } = createHarness();
    mockConnectedXeroAccount(mocks);

    const fetchMock = vi.fn().mockResolvedValue(
      providerResponse({
        ok: true,
        body: {
          Contacts: xeroContactsPage(1, 100)
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.listContacts("conn_xero_retry")).rejects.toThrow(
      /pagination exceeded 1000 pages/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(1000);
  });

  it("retries 429 responses with Retry-After before returning contacts", async () => {
    const { api, mocks } = createHarness();
    mockConnectedXeroAccount(mocks);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        providerResponse({
          ok: false,
          status: 429,
          body: "rate limited",
          headers: { "Retry-After": "0" }
        })
      )
      .mockResolvedValueOnce(
        providerResponse({
          ok: true,
          body: {
            Contacts: [{ ContactID: "contact-1", Name: "Retry Customer" }]
          }
        })
      )
      .mockResolvedValueOnce(
        providerResponse({
          ok: true,
          body: {
            Contacts: []
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const contacts = await api.listContacts("conn_xero_retry");

    expect(contacts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a provider-specific error after transient retries are exhausted", async () => {
    const { api, mocks } = createHarness();
    mockConnectedXeroAccount(mocks);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const fetchMock = vi.fn().mockResolvedValue(
      providerResponse({
        ok: false,
        status: 503,
        body: "provider unavailable",
        headers: { "Retry-After": "0" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.listContacts("conn_xero_retry")).rejects.toThrow(
      /Xero API request failed: 503 provider unavailable/
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
