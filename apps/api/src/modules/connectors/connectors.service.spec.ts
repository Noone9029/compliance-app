import { BadRequestException } from "@nestjs/common";
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
  const createOAuthState = vi.fn();
  const consumeOAuthState = vi.fn().mockResolvedValue({ count: 1 });
  const saveConnectedCredentials = vi.fn();
  const connectorAccount = {
    upsert,
  };
  const connectorOAuthState = {
    create: createOAuthState,
    updateMany: consumeOAuthState,
  };

  const prisma = {
    connectorAccount,
    connectorOAuthState,
    $transaction: vi.fn(async (callback: (tx: { connectorAccount: typeof connectorAccount }) => unknown) =>
      callback({ connectorAccount }),
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

  const service = new ConnectorsService(
    prisma,
    { provider: "XERO" } as any,
    { provider: "QUICKBOOKS_ONLINE" } as any,
    { provider: "ZOHO_BOOKS" } as any,
    quickBooksTransport as any,
    xeroTransport as any,
    zohoTransport as any,
    {} as any,
    {} as any,
    {} as any,
    { saveConnectedCredentials } as any,
    {} as any,
  );

  return {
    service,
    mocks: {
      prisma,
      upsert,
      createOAuthState,
      consumeOAuthState,
      saveConnectedCredentials,
      quickBooksTransport,
      xeroTransport,
      zohoTransport,
    },
  };
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
});
