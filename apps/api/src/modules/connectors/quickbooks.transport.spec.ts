import { afterEach, describe, expect, it, vi } from "vitest";

import { QuickBooksTransport } from "./quickbooks.transport";

describe("quickbooks transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds OAuth authorization URL with expected parameters", async () => {
    const transport = new QuickBooksTransport();

    const result = await transport.buildAuthorizationUrl({
      organizationId: "org_1",
      userId: "user_1",
      redirectUri: "https://app.daftar.local/connectors/callback",
      state: "state-123",
    });

    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe("https://appcenter.intuit.com");
    expect(url.pathname).toBe("/connect/oauth2");
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(
      "com.intuit.quickbooks.accounting",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.daftar.local/connectors/callback",
    );
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("stores callback realmId as externalTenantId and parses scopes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        scope: "com.intuit.quickbooks.accounting openid profile",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const transport = new QuickBooksTransport();
    const tokenSet = await transport.exchangeAuthorizationCode({
      organizationId: "org_1",
      userId: "user_1",
      code: "auth-code",
      redirectUri: "https://app.daftar.local/connectors/callback",
      externalTenantId: "realm-12345",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenSet.externalTenantId).toBe("realm-12345");
    expect(tokenSet.accessToken).toBe("access-token");
    expect(tokenSet.refreshToken).toBe("refresh-token");
    expect(tokenSet.displayName).toBe("QuickBooks");
    expect(tokenSet.scopes).toEqual([
      "com.intuit.quickbooks.accounting",
      "openid",
      "profile",
    ]);
  });

  it("sets externalTenantId to null on refresh flow", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token-2",
        refresh_token: "refresh-token-2",
        expires_in: 3600,
        token_type: "bearer",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const transport = new QuickBooksTransport();
    const tokenSet = await transport.refreshAccessToken({
      refreshToken: "refresh-token-current",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenSet.externalTenantId).toBeNull();
    expect(tokenSet.scopes).toEqual([]);
  });
});
