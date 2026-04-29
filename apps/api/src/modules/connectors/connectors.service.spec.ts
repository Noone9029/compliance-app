import { BadRequestException, NotImplementedException } from "@nestjs/common";
import type { ConnectorProvider } from "@daftar/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConnectorProviderTransport } from "./provider-transport";
import {
  decodeConnectorState,
  encodeConnectorState,
  hashConnectorSecret
} from "./connector-state";
import { ConnectorsService } from "./connectors.service";

function createServiceHarness() {
  const upsert = vi.fn();
  const findFirstConnectorAccount = vi.fn();
  const updateConnectorAccount = vi.fn();
  const findUniqueCredential = vi.fn();
  const createSyncLog = vi.fn(async (input) => ({
    id: "log_1",
    ...input.data,
  }));
  const createOAuthState = vi.fn();
  const consumeOAuthState = vi.fn().mockResolvedValue({ count: 1 });
  const saveConnectedCredentials = vi.fn();
  const connectorAccount = {
    upsert,
    findFirst: findFirstConnectorAccount,
    update: updateConnectorAccount,
  };
  const connectorCredential = {
    findUnique: findUniqueCredential,
  };
  const connectorSyncLog = {
    create: createSyncLog,
  };
  const connectorOAuthState = {
    create: createOAuthState,
    updateMany: consumeOAuthState,
  };

  const prisma = {
    connectorAccount,
    connectorCredential,
    connectorSyncLog,
    connectorOAuthState,
    $transaction: vi.fn(
      async (
        callback: (tx: {
          connectorAccount: typeof connectorAccount;
          connectorSyncLog: typeof connectorSyncLog;
        }) => unknown,
      ) =>
        callback({
          connectorAccount,
          connectorSyncLog,
        }),
    ),
  } as any;

  const quickBooksTransport: ConnectorProviderTransport = {
    provider: "QUICKBOOKS_ONLINE",
    buildAuthorizationUrl: vi.fn(),
    exchangeAuthorizationCode: vi.fn(),
  };
  const xeroTransport: ConnectorProviderTransport = {
    provider: "XERO",
    buildAuthorizationUrl: vi.fn(),
    exchangeAuthorizationCode: vi.fn(),
  };
  const zohoTransport: ConnectorProviderTransport = {
    provider: "ZOHO_BOOKS",
    buildAuthorizationUrl: vi.fn(),
    exchangeAuthorizationCode: vi.fn(),
  };
  const xeroAdapter = {
    provider: "XERO",
    buildExportPreview: vi.fn(),
    mapLiveImportPayload: vi.fn(() => ({ contacts: [], invoices: [] })),
  };
  const quickBooksAdapter = {
    provider: "QUICKBOOKS_ONLINE",
    buildExportPreview: vi.fn(),
    mapLiveImportPayload: vi.fn(() => ({ contacts: [], invoices: [] })),
  };
  const zohoAdapter = {
    provider: "ZOHO_BOOKS",
    buildExportPreview: vi.fn(),
    mapLiveImportPayload: vi.fn(() => ({ contacts: [], invoices: [] })),
  };
  const quickBooksApiClient = {
    listCustomers: vi.fn(),
    listInvoices: vi.fn(),
  };
  const xeroApiClient = {
    listContacts: vi.fn(),
    listInvoices: vi.fn(),
  };
  const zohoApiClient = {
    listContacts: vi.fn(),
    listInvoices: vi.fn(),
  };

  const service = new ConnectorsService(
    prisma,
    xeroAdapter as any,
    quickBooksAdapter as any,
    zohoAdapter as any,
    quickBooksTransport as any,
    xeroTransport as any,
    zohoTransport as any,
    quickBooksApiClient as any,
    xeroApiClient as any,
    zohoApiClient as any,
    { saveConnectedCredentials } as any,
    {} as any,
  );

  return {
    service,
    mocks: {
      prisma,
      upsert,
      findFirstConnectorAccount,
      updateConnectorAccount,
      findUniqueCredential,
      createSyncLog,
      createOAuthState,
      consumeOAuthState,
      saveConnectedCredentials,
      quickBooksTransport,
      xeroTransport,
      zohoTransport,
      xeroAdapter,
      quickBooksAdapter,
      zohoAdapter,
      quickBooksApiClient,
      xeroApiClient,
      zohoApiClient,
    },
  };
}

function mockConnectedAccount(
  mocks: ReturnType<typeof createServiceHarness>["mocks"],
  provider: ConnectorProvider,
  metadata: Record<string, unknown> | null = null,
) {
  mocks.findFirstConnectorAccount.mockResolvedValue({
    id: "conn_1",
    organizationId: "org_1",
    provider,
    metadata,
  });
  mocks.findUniqueCredential.mockResolvedValue({ id: "credential_1" });
  mocks.updateConnectorAccount.mockResolvedValue({});
}

function stubImportPersistence(
  service: ConnectorsService,
  summary = { contacts: 2, invoices: 1 },
  compliance = { eligible: 1, queued: 1, skipped: 0, firstSkipReason: null },
) {
  vi.spyOn(service as any, "persistCanonicalImportBundle").mockResolvedValue(
    summary,
  );
  vi.spyOn(service as any, "queueImportedInvoicesForCompliance").mockResolvedValue(
    compliance,
  );
}

function expectIsoTimestamp(value: unknown) {
  expect(typeof value).toBe("string");
  expect(Number.isNaN(Date.parse(value as string))).toBe(false);
}

describe("connectors service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a signed expiring state and stores the nonce before returning a connect URL", async () => {
    const { service, mocks } = createServiceHarness();

    vi.mocked(mocks.xeroTransport.buildAuthorizationUrl).mockImplementation(
      async (input) => ({
        authorizationUrl: `https://login.xero.test/connect?state=${encodeURIComponent(input.state)}`,
      }),
    );

    const response = await service.getConnectUrl({
      organizationId: "org_1",
      userId: "user_1",
      provider: "XERO",
      redirectUri: "https://app.daftar.local/connectors/callback",
    });

    const url = new URL(response.authorizationUrl);
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(state?.split(".")).toHaveLength(2);

    const decoded = decodeConnectorState(state!);
    expect(decoded.organizationId).toBe("org_1");
    expect(decoded.userId).toBe("user_1");
    expect(decoded.provider).toBe("XERO");
    expect(new Date(decoded.expiresAt).getTime()).toBeGreaterThan(Date.now());

    expect(mocks.createOAuthState).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        userId: "user_1",
        provider: "XERO",
        nonceHash: hashConnectorSecret(decoded.nonce),
        issuedAt: new Date(decoded.issuedAt),
        expiresAt: new Date(decoded.expiresAt),
      },
    });
  });

  it("persists callback realmId as externalTenantId and omits secret-bearing metadata from the response", async () => {
    const { service, mocks } = createServiceHarness();
    const state = encodeConnectorState({
      organizationId: "org_1",
      userId: "user_1",
      provider: "QUICKBOOKS_ONLINE",
      nonce: "nonce-1",
    });

    vi.mocked(mocks.quickBooksTransport.exchangeAuthorizationCode).mockResolvedValue({
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      expiresAt: "2026-04-22T00:00:00.000Z",
      scopes: ["customers.read", "invoices.read"],
      externalTenantId: null,
      displayName: "QuickBooks",
      raw: { any: "payload" },
    });

    const now = new Date("2026-04-21T10:00:00.000Z");
    mocks.upsert.mockResolvedValue({
      id: "conn_1",
      organizationId: "org_1",
      provider: "QUICKBOOKS_ONLINE",
      displayName: "QuickBooks",
      status: "CONNECTED",
      externalTenantId: "realm-12345",
      scopes: ["customers.read", "invoices.read"],
      connectedAt: now,
      lastSyncedAt: null,
      metadata: {
        accessToken: "should-not-leak",
        refreshToken: "should-not-leak",
      },
      createdAt: now,
      updatedAt: now,
    });

    const account = await service.completeConnection({
      organizationId: "org_1",
      userId: "user_1",
      provider: "QUICKBOOKS_ONLINE",
      code: "auth-code",
      state,
      redirectUri: "https://app.daftar.local/connectors/callback",
      externalTenantId: " realm-12345 ",
    });

    expect(mocks.quickBooksTransport.exchangeAuthorizationCode).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_1",
      code: "auth-code",
      redirectUri: "https://app.daftar.local/connectors/callback",
      externalTenantId: "realm-12345",
    });

    expect(mocks.consumeOAuthState).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = mocks.upsert.mock.calls[0]?.[0];
    expect(upsertArg.update.externalTenantId).toBe("realm-12345");
    expect(upsertArg.create.externalTenantId).toBe("realm-12345");
    expect(upsertArg.update.scopes).toEqual(["customers.read", "invoices.read"]);

    expect(mocks.saveConnectedCredentials).toHaveBeenCalledWith(
      {
        connectorAccountId: "conn_1",
        provider: "QUICKBOOKS_ONLINE",
        tokenSet: {
          accessToken: "access-secret",
          refreshToken: "refresh-secret",
          expiresAt: "2026-04-22T00:00:00.000Z",
          scopes: ["customers.read", "invoices.read"],
          externalTenantId: null,
          displayName: "QuickBooks",
          raw: { any: "payload" },
        },
      },
      expect.any(Object),
    );

    expect(account.externalTenantId).toBe("realm-12345");
    expect("metadata" in account).toBe(false);
    expect(account.scopes).toEqual(["customers.read", "invoices.read"]);
    expect(JSON.stringify(account)).not.toMatch(/accessToken|refreshToken|expiresAt/i);
  });

  it("rejects tampered signed state before token exchange", async () => {
    const { service, mocks } = createServiceHarness();
    const state = encodeConnectorState({
      organizationId: "org_1",
      userId: "user_1",
      provider: "XERO",
      nonce: "nonce-tamper",
    });
    const [body, signature] = state.split(".");
    const decoded = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    decoded.provider = "ZOHO_BOOKS";
    const tamperedBody = Buffer.from(JSON.stringify(decoded), "utf8").toString(
      "base64url",
    );
    const tamperedState = `${tamperedBody}.${signature}`;

    await expect(
      service.completeConnection({
        organizationId: "org_1",
        userId: "user_1",
        provider: "ZOHO_BOOKS",
        code: "auth-code",
        state: tamperedState,
        redirectUri: "https://app.daftar.local/connectors/callback",
      }),
    ).rejects.toThrow(/invalid connector state/i);

    expect(mocks.consumeOAuthState).not.toHaveBeenCalled();
    expect(mocks.xeroTransport.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.zohoTransport.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("rejects expired state before token exchange", async () => {
    const { service, mocks } = createServiceHarness();
    const state = encodeConnectorState(
      {
        organizationId: "org_1",
        userId: "user_1",
        provider: "XERO",
        nonce: "nonce-expired",
      },
      {
        now: new Date(Date.now() - 60_000),
        ttlMs: 1_000,
      },
    );

    await expect(
      service.completeConnection({
        organizationId: "org_1",
        userId: "user_1",
        provider: "XERO",
        code: "auth-code",
        state,
        redirectUri: "https://app.daftar.local/connectors/callback",
      }),
    ).rejects.toThrow(/expired connector state/i);

    expect(mocks.consumeOAuthState).not.toHaveBeenCalled();
    expect(mocks.xeroTransport.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("rejects replayed state before token exchange", async () => {
    const { service, mocks } = createServiceHarness();
    mocks.consumeOAuthState.mockResolvedValueOnce({ count: 0 });
    const state = encodeConnectorState({
      organizationId: "org_1",
      userId: "user_1",
      provider: "XERO",
      nonce: "nonce-replayed",
    });

    await expect(
      service.completeConnection({
        organizationId: "org_1",
        userId: "user_1",
        provider: "XERO",
        code: "auth-code",
        state,
        redirectUri: "https://app.daftar.local/connectors/callback",
      }),
    ).rejects.toThrow(/already used connector state/i);

    expect(mocks.consumeOAuthState).toHaveBeenCalledTimes(1);
    expect(mocks.xeroTransport.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("rejects completeConnection when callback state provider does not match requested provider", async () => {
    const { service, mocks } = createServiceHarness();
    const state = encodeConnectorState({
      organizationId: "org_1",
      userId: "user_1",
      provider: "XERO",
      nonce: "nonce-2",
    });

    await expect(
      service.completeConnection({
        organizationId: "org_1",
        userId: "user_1",
        provider: "ZOHO_BOOKS",
        code: "auth-code",
        state,
        redirectUri: "https://app.daftar.local/connectors/callback",
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.completeConnection({
        organizationId: "org_1",
        userId: "user_1",
        provider: "ZOHO_BOOKS",
        code: "auth-code",
        state,
        redirectUri: "https://app.daftar.local/connectors/callback",
      }),
    ).rejects.toThrow(/invalid connector state/i);

    expect(mocks.quickBooksTransport.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.xeroTransport.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.zohoTransport.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.consumeOAuthState).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects completeConnection when callback state organization or user does not match the session context", async () => {
    const { service, mocks } = createServiceHarness();
    const state = encodeConnectorState({
      organizationId: "org_2",
      userId: "user_2",
      provider: "XERO",
      nonce: "nonce-context-mismatch",
    });

    await expect(
      service.completeConnection({
        organizationId: "org_1",
        userId: "user_1",
        provider: "XERO",
        code: "auth-code",
        state,
        redirectUri: "https://app.daftar.local/connectors/callback",
      }),
    ).rejects.toThrow(/invalid connector state/i);

    expect(mocks.consumeOAuthState).not.toHaveBeenCalled();
    expect(mocks.xeroTransport.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects QuickBooks callback when realmId is missing before token exchange", async () => {
    const { service, mocks } = createServiceHarness();
    const state = encodeConnectorState({
      organizationId: "org_1",
      userId: "user_1",
      provider: "QUICKBOOKS_ONLINE",
      nonce: "nonce-3",
    });

    await expect(
      service.completeConnection({
        organizationId: "org_1",
        userId: "user_1",
        provider: "QUICKBOOKS_ONLINE",
        code: "auth-code",
        state,
        redirectUri: "https://app.daftar.local/connectors/callback",
      }),
    ).rejects.toThrow(/missing realmId/i);

    expect(mocks.quickBooksTransport.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.consumeOAuthState).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects export preview with NotImplementedException after validating account ownership", async () => {
    const { service, mocks } = createServiceHarness();
    mockConnectedAccount(mocks, "XERO");

    await expect(service.getExportPreview("org_1", "conn_1")).rejects.toThrow(
      NotImplementedException,
    );
    await expect(service.getExportPreview("org_1", "conn_1")).rejects.toThrow(
      "Connector exports are not implemented yet.",
    );

    expect(mocks.findFirstConnectorAccount).toHaveBeenCalledWith({
      where: {
        id: "conn_1",
        organizationId: "org_1",
      },
    });
    expect(mocks.xeroAdapter.buildExportPreview).not.toHaveBeenCalled();
    expect(mocks.createSyncLog).not.toHaveBeenCalled();
  });

  it("keeps missing connector accounts on export preview from reaching export 501", async () => {
    const { service, mocks } = createServiceHarness();
    mocks.findFirstConnectorAccount.mockResolvedValue(null);

    await expect(service.getExportPreview("org_1", "missing_conn")).rejects.toThrow(
      /connector account not found/i,
    );

    expect(mocks.xeroAdapter.buildExportPreview).not.toHaveBeenCalled();
    expect(mocks.quickBooksAdapter.buildExportPreview).not.toHaveBeenCalled();
    expect(mocks.zohoAdapter.buildExportPreview).not.toHaveBeenCalled();
    expect(mocks.createSyncLog).not.toHaveBeenCalled();
  });

  it("rejects export sync with NotImplementedException after validating account ownership", async () => {
    const { service, mocks } = createServiceHarness();
    mockConnectedAccount(mocks, "XERO");

    await expect(
      service.runSync("org_1", "user_1", "conn_1", {
        direction: "EXPORT",
      }),
    ).rejects.toThrow(NotImplementedException);
    await expect(
      service.runSync("org_1", "user_1", "conn_1", {
        direction: "EXPORT",
      }),
    ).rejects.toThrow("Connector exports are not implemented yet.");

    expect(mocks.xeroAdapter.buildExportPreview).not.toHaveBeenCalled();
    expect(mocks.xeroApiClient.listContacts).not.toHaveBeenCalled();
    expect(mocks.xeroApiClient.listInvoices).not.toHaveBeenCalled();
    expect(mocks.createSyncLog).not.toHaveBeenCalled();
  });

  it("runs the first Xero sync as full sync without modified-since and records checkpoint metadata", async () => {
    const { service, mocks } = createServiceHarness();
    mockConnectedAccount(mocks, "XERO");
    stubImportPersistence(service);
    mocks.xeroApiClient.listContacts.mockResolvedValue([
      { ContactID: "contact_1" },
      { ContactID: "contact_2" },
    ]);
    mocks.xeroApiClient.listInvoices.mockResolvedValue([{ InvoiceID: "invoice_1" }]);

    await service.runSync("org_1", "user_1", "conn_1", {
      direction: "IMPORT",
    });

    const metadata = mocks.createSyncLog.mock.calls[0]?.[0].data.metadata;
    const updateData = mocks.updateConnectorAccount.mock.calls[0]?.[0].data;
    expect(mocks.xeroApiClient.listContacts).toHaveBeenCalledWith("conn_1", {
      modifiedSince: null,
    });
    expect(mocks.xeroApiClient.listInvoices).toHaveBeenCalledWith("conn_1", {
      modifiedSince: null,
    });
    expect(metadata).toMatchObject({
      provider: "XERO",
      mode: "xero-live",
      syncMode: "FULL",
      incrementalApplied: false,
      checkpointBefore: null,
      modifiedSinceApplied: null,
      overlapMinutes: 0,
      contactsFetched: 2,
      invoicesFetched: 1,
      contactsPersisted: 2,
      invoicesPrepared: 1,
      invoicesQueuedForCompliance: 1,
      invoicesSkippedForCompliance: 0,
    });
    expect(metadata.checkpointAfter).toEqual({
      contactsModifiedSince: metadata.syncStartedAt,
      invoicesModifiedSince: metadata.syncStartedAt,
    });
    expect(updateData.metadata).toMatchObject({
      sync: {
        xero: metadata.checkpointAfter,
      },
    });
    expect(updateData.lastSyncedAt).toBeInstanceOf(Date);
    expectIsoTimestamp(metadata.syncStartedAt);
    expectIsoTimestamp(metadata.syncFinishedAt);
  });

  it("runs a later Xero sync as incremental with overlapped modified-since", async () => {
    const { service, mocks } = createServiceHarness();
    mockConnectedAccount(mocks, "XERO", {
      sync: {
        xero: {
          contactsModifiedSince: "2026-04-29T10:00:00.000Z",
          invoicesModifiedSince: "2026-04-29T10:05:00.000Z",
        },
      },
      preserved: "value",
    });
    stubImportPersistence(service);
    mocks.xeroApiClient.listContacts.mockResolvedValue([{ ContactID: "contact_1" }]);
    mocks.xeroApiClient.listInvoices.mockResolvedValue([{ InvoiceID: "invoice_1" }]);

    await service.runSync("org_1", "user_1", "conn_1", {
      direction: "IMPORT",
    });

    const expectedModifiedSince = new Date("2026-04-29T09:50:00.000Z");
    expect(mocks.xeroApiClient.listContacts).toHaveBeenCalledWith("conn_1", {
      modifiedSince: expectedModifiedSince,
    });
    expect(mocks.xeroApiClient.listInvoices).toHaveBeenCalledWith("conn_1", {
      modifiedSince: expectedModifiedSince,
    });

    const metadata = mocks.createSyncLog.mock.calls[0]?.[0].data.metadata;
    expect(metadata).toMatchObject({
      provider: "XERO",
      mode: "xero-live",
      syncMode: "INCREMENTAL",
      incrementalApplied: true,
      checkpointBefore: {
        contactsModifiedSince: "2026-04-29T10:00:00.000Z",
        invoicesModifiedSince: "2026-04-29T10:05:00.000Z",
      },
      modifiedSinceApplied: "2026-04-29T09:50:00.000Z",
      overlapMinutes: 10,
    });
    expect(metadata.checkpointAfter).toEqual({
      contactsModifiedSince: metadata.syncStartedAt,
      invoicesModifiedSince: metadata.syncStartedAt,
    });
    expect(mocks.updateConnectorAccount.mock.calls[0]?.[0].data.metadata).toMatchObject({
      preserved: "value",
      sync: {
        xero: metadata.checkpointAfter,
      },
    });
  });

  it("does not advance Xero checkpoint when provider fetch fails", async () => {
    const { service, mocks } = createServiceHarness();
    mockConnectedAccount(mocks, "XERO", {
      sync: {
        xero: {
          contactsModifiedSince: "2026-04-29T10:00:00.000Z",
          invoicesModifiedSince: "2026-04-29T10:00:00.000Z",
        },
      },
    });
    mocks.xeroApiClient.listContacts.mockRejectedValue(
      new Error("Xero unavailable"),
    );
    mocks.xeroApiClient.listInvoices.mockResolvedValue([]);

    const result = await service.runSync("org_1", "user_1", "conn_1", {
      direction: "IMPORT",
    });

    expect(result.ok).toBe(false);
    expect(mocks.updateConnectorAccount).not.toHaveBeenCalled();
    const metadata = mocks.createSyncLog.mock.calls[0]?.[0].data.metadata;
    expect(metadata).toMatchObject({
      provider: "XERO",
      mode: "xero-live",
      syncMode: "INCREMENTAL",
      incrementalApplied: true,
      checkpointBefore: {
        contactsModifiedSince: "2026-04-29T10:00:00.000Z",
        invoicesModifiedSince: "2026-04-29T10:00:00.000Z",
      },
      checkpointAfter: null,
      modifiedSinceApplied: "2026-04-29T09:50:00.000Z",
      overlapMinutes: 10,
    });
    expectIsoTimestamp(metadata.syncFailedAt);
  });

  it("does not advance Xero checkpoint when local import persistence fails", async () => {
    const { service, mocks } = createServiceHarness();
    mockConnectedAccount(mocks, "XERO");
    vi.spyOn(service as any, "persistCanonicalImportBundle").mockRejectedValue(
      new Error("Import persistence failed"),
    );
    mocks.xeroApiClient.listContacts.mockResolvedValue([{ ContactID: "contact_1" }]);
    mocks.xeroApiClient.listInvoices.mockResolvedValue([{ InvoiceID: "invoice_1" }]);

    const result = await service.runSync("org_1", "user_1", "conn_1", {
      direction: "IMPORT",
    });

    expect(result.ok).toBe(false);
    expect(mocks.updateConnectorAccount).not.toHaveBeenCalled();
    const metadata = mocks.createSyncLog.mock.calls[0]?.[0].data.metadata;
    expect(metadata).toMatchObject({
      provider: "XERO",
      mode: "xero-live",
      syncMode: "FULL",
      incrementalApplied: false,
      checkpointBefore: null,
      checkpointAfter: null,
      modifiedSinceApplied: null,
      overlapMinutes: 0,
      message: "Import persistence failed",
    });
  });

  it("records successful QuickBooks sync metadata with full-sync checkpoint fields", async () => {
    const { service, mocks } = createServiceHarness();
    mockConnectedAccount(mocks, "QUICKBOOKS_ONLINE");
    stubImportPersistence(service);
    mocks.quickBooksApiClient.listCustomers.mockResolvedValue([
      { Id: "customer_1" },
      { Id: "customer_2" },
      { Id: "customer_3" },
    ]);
    mocks.quickBooksApiClient.listInvoices.mockResolvedValue([{ Id: "invoice_1" }]);

    await service.runSync("org_1", "user_1", "conn_1", {
      direction: "IMPORT",
    });

    const metadata = mocks.createSyncLog.mock.calls[0]?.[0].data.metadata;
    expect(metadata).toMatchObject({
      provider: "QUICKBOOKS_ONLINE",
      mode: "quickbooks-live",
      syncMode: "FULL",
      incrementalApplied: false,
      checkpointBefore: null,
      checkpointAfter: null,
      customersFetched: 3,
      invoicesFetched: 1,
      contactsPersisted: 2,
      invoicesPrepared: 1,
      invoicesQueuedForCompliance: 1,
      invoicesSkippedForCompliance: 0,
    });
    expectIsoTimestamp(metadata.syncStartedAt);
    expectIsoTimestamp(metadata.syncFinishedAt);
  });

  it("records successful Zoho sync metadata with full-sync checkpoint fields", async () => {
    const { service, mocks } = createServiceHarness();
    mockConnectedAccount(mocks, "ZOHO_BOOKS");
    stubImportPersistence(service);
    mocks.zohoApiClient.listContacts.mockResolvedValue([{ contact_id: "contact_1" }]);
    mocks.zohoApiClient.listInvoices.mockResolvedValue([
      { invoice_id: "invoice_1" },
      { invoice_id: "invoice_2" },
    ]);

    await service.runSync("org_1", "user_1", "conn_1", {
      direction: "IMPORT",
    });

    const metadata = mocks.createSyncLog.mock.calls[0]?.[0].data.metadata;
    expect(metadata).toMatchObject({
      provider: "ZOHO_BOOKS",
      mode: "zoho-live",
      syncMode: "FULL",
      incrementalApplied: false,
      checkpointBefore: null,
      checkpointAfter: null,
      contactsFetched: 1,
      invoicesFetched: 2,
      contactsPersisted: 2,
      invoicesPrepared: 1,
      invoicesQueuedForCompliance: 1,
      invoicesSkippedForCompliance: 0,
    });
    expectIsoTimestamp(metadata.syncStartedAt);
    expectIsoTimestamp(metadata.syncFinishedAt);
  });

  it("records failed live sync metadata without leaking connector secrets", async () => {
    const { service, mocks } = createServiceHarness();
    mockConnectedAccount(mocks, "XERO");
    mocks.xeroApiClient.listContacts.mockRejectedValue(
      new Error(
        "Xero import failed access_token=super-secret refreshToken: refresh-secret",
      ),
    );
    mocks.xeroApiClient.listInvoices.mockResolvedValue([]);

    const result = await service.runSync("org_1", "user_1", "conn_1", {
      direction: "IMPORT",
    });

    const logData = mocks.createSyncLog.mock.calls[0]?.[0].data;
    const metadata = logData.metadata;
    expect(result).toMatchObject({
      ok: false,
      mode: "xero-live",
      message:
        "Xero import failed access_token=[REDACTED] refreshToken: [REDACTED]",
    });
    expect(logData.message).toBe(
      "Xero import failed access_token=[REDACTED] refreshToken: [REDACTED]",
    );
    expect(metadata).toMatchObject({
      provider: "XERO",
      mode: "xero-live",
      syncMode: "FULL",
      incrementalApplied: false,
      checkpointBefore: null,
      checkpointAfter: null,
      message:
        "Xero import failed access_token=[REDACTED] refreshToken: [REDACTED]",
    });
    expectIsoTimestamp(metadata.syncStartedAt);
    expectIsoTimestamp(metadata.syncFailedAt);
    expect(JSON.stringify(metadata)).not.toMatch(/super-secret|refresh-secret/);
  });
});
