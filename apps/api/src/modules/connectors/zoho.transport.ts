import { Injectable } from "@nestjs/common";
import type { ConnectorProvider } from "@daftar/types";
import { loadEnv } from "@daftar/config";

import type {
  ConnectorAuthorizationRequest,
  ConnectorAuthorizationResult,
  ConnectorCallbackInput,
  ConnectorProviderTransport,
  ConnectorRefreshInput,
  ConnectorTokenSet
} from "./provider-transport";

type ZohoTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  api_domain?: string;
  scope?: string;
};

type ZohoOrganizationsResponse = {
  organizations?: Array<{
    organization_id?: string;
    name?: string;
    is_default_org?: boolean;
  }>;
};

@Injectable()
export class ZohoTransport implements ConnectorProviderTransport {
  readonly provider: ConnectorProvider = "ZOHO_BOOKS";

  async buildAuthorizationUrl(
    input: ConnectorAuthorizationRequest
  ): Promise<ConnectorAuthorizationResult> {
    const env = loadEnv();
    const url = new URL("https://accounts.zoho.com/oauth/v2/auth");

    url.searchParams.set("client_id", env.ZOHO_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("scope", "ZohoBooks.fullaccess.all");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", input.state);

    return { authorizationUrl: url.toString() };
  }

  async exchangeAuthorizationCode(
    input: ConnectorCallbackInput
  ): Promise<ConnectorTokenSet> {
    const tokenSet = await this.exchangeToken({
      grantType: "authorization_code",
      code: input.code,
      redirectUri: input.redirectUri
    });

    const tenant =
      input.externalTenantId?.trim()
        ? {
            externalTenantId: input.externalTenantId.trim(),
            displayName: "Zoho Books"
          }
        : await this.fetchOrganizationSummary(tokenSet.accessToken, tokenSet.raw);

    return {
      ...tokenSet,
      externalTenantId: tenant.externalTenantId,
      displayName: tenant.displayName
    };
  }

  async refreshAccessToken(
    input: ConnectorRefreshInput
  ): Promise<ConnectorTokenSet> {
    return this.exchangeToken({
      grantType: "refresh_token",
      refreshToken: input.refreshToken
    });
  }

  private async exchangeToken(input: {
    grantType: "authorization_code" | "refresh_token";
    code?: string;
    redirectUri?: string;
    refreshToken?: string;
  }): Promise<ConnectorTokenSet> {
    const env = loadEnv();
    const body = new URLSearchParams();

    body.set("grant_type", input.grantType);
    body.set("client_id", env.ZOHO_CLIENT_ID);
    body.set("client_secret", env.ZOHO_CLIENT_SECRET);

    if (input.grantType === "authorization_code") {
      body.set("code", input.code!);
      body.set("redirect_uri", input.redirectUri!);
    } else {
      body.set("refresh_token", input.refreshToken!);
    }

    const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Zoho token exchange failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as ZohoTokenResponse;

    if (!data.access_token?.trim()) {
      throw new Error("Zoho token exchange did not return an access_token.");
    }

    const refreshToken =
      data.refresh_token?.trim() ||
      (input.grantType === "refresh_token" ? input.refreshToken : null);

    if (!refreshToken) {
      throw new Error(
        "Zoho token exchange did not return a refresh_token. Reconnect with offline access."
      );
    }

    const expiresInSeconds =
      typeof data.expires_in === "number" && data.expires_in > 0
        ? data.expires_in
        : 3600;

    const expiresAt = new Date(
      Date.now() + expiresInSeconds * 1000
    ).toISOString();

    return {
      accessToken: data.access_token.trim(),
      refreshToken,
      expiresAt,
      scopes: this.parseScopes(data.scope),
      externalTenantId: null,
      displayName: "Zoho Books",
      raw: data as Record<string, unknown>
    };
  }

  private async fetchOrganizationSummary(
    accessToken: string,
    raw: Record<string, unknown>
  ): Promise<{ externalTenantId: string; displayName: string }> {
    const apiDomain =
      (typeof raw.api_domain === "string" && raw.api_domain.trim()) ||
      "https://www.zohoapis.com";

    const endpoint = `${apiDomain.replace(/\/+$/, "")}/books/v3/organizations`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Zoho organization discovery failed: ${response.status} ${text}`
      );
    }

    const payload = (await response.json()) as ZohoOrganizationsResponse;
    const organizations = payload.organizations ?? [];

    if (organizations.length === 0) {
      throw new Error(
        "Zoho organization discovery returned no available organizations."
      );
    }

    const preferred =
      organizations.find((organization) => organization.is_default_org) ??
      organizations.find((organization) => organization.organization_id?.trim());

    const externalTenantId = preferred?.organization_id?.trim();
    if (!externalTenantId) {
      throw new Error("Zoho organization discovery did not return organization_id.");
    }

    return {
      externalTenantId,
      displayName: preferred?.name?.trim() || "Zoho Books"
    };
  }

  private parseScopes(scope: string | undefined) {
    if (!scope?.trim()) {
      return [] as string[];
    }

    return scope
      .split(/[,\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}
