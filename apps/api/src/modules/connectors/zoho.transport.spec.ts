import { afterEach, describe, expect, it, vi } from "vitest";

import { ZohoTransport } from "./zoho.transport";

describe("zoho transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds OAuth authorization URL with expected parameters", async () => {
    const transport = new ZohoTransport();

    const result = await transport.buildAuthorizationUrl({
      organizationId: "org_1",
      userId: "user_1",
      redirectUri: "https://app.daftar.local/connectors/callback",
      state: "state-123"
    });

    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe("https://accounts.zoho.com");
    expect(url.pathname).toBe("/oauth/v2/auth");
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.daftar.local/connectors/callback"
    );
    expect(url.searchParams.get("scope")).toContain("ZohoBooks.fullaccess.all");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("exchanges code and discovers organization id from Zoho organizations API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "zoho-access-token",
          refresh_token: "zoho-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          api_domain: "https://www.zohoapis.com",
          scope: "ZohoBooks.fullaccess.all,offline_access"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organizations: [
            {
              organization_id: "zoho-org-123",
              name: "Nomad Events",
              is_default_org: true
            }
          ]
        })
      });

    vi.stubGlobal("fetch", fetchMock);

    const transport = new ZohoTransport();
    const tokenSet = await transport.exchangeAuthorizationCode({
      organizationId: "org_1",
      userId: "user_1",
      code: "auth-code",
      redirectUri: "https://app.daftar.local/connectors/callback"
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenSet.accessToken).toBe("zoho-access-token");
    expect(tokenSet.refreshToken).toBe("zoho-refresh-token");
    expect(tokenSet.externalTenantId).toBe("zoho-org-123");
    expect(tokenSet.displayName).toBe("Nomad Events");
    expect(tokenSet.scopes).toContain("ZohoBooks.fullaccess.all");
  });

  it("keeps previous refresh token when Zoho refresh response omits a new one", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "zoho-access-token-2",
        expires_in: 3600,
        token_type: "Bearer",
        api_domain: "https://www.zohoapis.com",
        scope: "ZohoBooks.fullaccess.all"
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const transport = new ZohoTransport();
    const tokenSet = await transport.refreshAccessToken({
      refreshToken: "existing-refresh-token"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenSet.refreshToken).toBe("existing-refresh-token");
    expect(tokenSet.externalTenantId).toBeNull();
    expect(tokenSet.displayName).toBe("Zoho Books");
  });
});
