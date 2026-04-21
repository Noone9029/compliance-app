import { afterEach, describe, expect, it, vi } from "vitest";

import { XeroTransport } from "./xero.transport";

describe("xero transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds OAuth authorization URL with expected parameters", async () => {
    const transport = new XeroTransport();

    const result = await transport.buildAuthorizationUrl({
      organizationId: "org_1",
      userId: "user_1",
      redirectUri: "https://app.daftar.local/connectors/callback",
      state: "state-123"
    });

    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe("https://login.xero.com");
    expect(url.pathname).toBe("/identity/connect/authorize");
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.daftar.local/connectors/callback"
    );
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("exchanges code and resolves external tenant id from Xero connections", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "xero-access-token",
          refresh_token: "xero-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "offline_access accounting.transactions accounting.contacts"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tenantId: "tenant-123",
            tenantName: "Nomad Events",
            tenantType: "ORGANISATION"
          }
        ]
      });

    vi.stubGlobal("fetch", fetchMock);

    const transport = new XeroTransport();
    const tokenSet = await transport.exchangeAuthorizationCode({
      organizationId: "org_1",
      userId: "user_1",
      code: "auth-code",
      redirectUri: "https://app.daftar.local/connectors/callback"
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenSet.accessToken).toBe("xero-access-token");
    expect(tokenSet.refreshToken).toBe("xero-refresh-token");
    expect(tokenSet.externalTenantId).toBe("tenant-123");
    expect(tokenSet.displayName).toBe("Nomad Events");
    expect(tokenSet.scopes).toContain("accounting.transactions");
  });

  it("refreshes token without overriding external tenant id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "xero-access-token-2",
        refresh_token: "xero-refresh-token-2",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "offline_access accounting.transactions"
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const transport = new XeroTransport();
    const tokenSet = await transport.refreshAccessToken({
      refreshToken: "refresh-token-current"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenSet.externalTenantId).toBeNull();
    expect(tokenSet.displayName).toBe("Xero");
    expect(tokenSet.scopes).toContain("accounting.transactions");
  });
});
