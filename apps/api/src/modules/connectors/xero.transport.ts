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

type XeroTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

type XeroConnection = {
  tenantId?: string;
  tenantName?: string;
  tenantType?: string;
};

@Injectable()
export class XeroTransport implements ConnectorProviderTransport {
  readonly provider: ConnectorProvider = "XERO";

  async buildAuthorizationUrl(
    input: ConnectorAuthorizationRequest
  ): Promise<ConnectorAuthorizationResult> {
    const env = loadEnv();
    const url = new URL("https://login.xero.com/identity/connect/authorize");

    url.searchParams.set("client_id", env.XERO_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      "openid profile email offline_access accounting.transactions accounting.contacts"
    );
    url.searchParams.set("redirect_uri", input.redirectUri);
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

    const tenant = await this.fetchTenant(tokenSet.accessToken);

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
    const basic = Buffer.from(
      `${env.XERO_CLIENT_ID}:${env.XERO_CLIENT_SECRET}`,
      "utf8"
    ).toString("base64");

    const body = new URLSearchParams();
    body.set("grant_type", input.grantType);

    if (input.grantType === "authorization_code") {
      body.set("code", input.code!);
      body.set("redirect_uri", input.redirectUri!);
    } else {
      body.set("refresh_token", input.refreshToken!);
    }

    const response = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Xero token exchange failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as XeroTokenResponse;
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scopes: data.scope ? data.scope.split(" ").filter(Boolean) : [],
      externalTenantId: null,
      displayName: "Xero",
      raw: data as Record<string, unknown>
    };
  }

  private async fetchTenant(accessToken: string): Promise<{
    externalTenantId: string;
    displayName: string;
  }> {
    const response = await fetch("https://api.xero.com/connections", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Xero tenant discovery failed: ${response.status} ${text}`
      );
    }

    const connections = (await response.json()) as XeroConnection[];

    if (!Array.isArray(connections) || connections.length === 0) {
      throw new Error("Xero tenant discovery returned no connected organizations.");
    }

    const preferred =
      connections.find((connection) => connection.tenantType === "ORGANISATION") ??
      connections.find((connection) => connection.tenantId?.trim());

    const externalTenantId = preferred?.tenantId?.trim();
    if (!externalTenantId) {
      throw new Error("Xero tenant discovery did not return a tenantId.");
    }

    const displayName = preferred?.tenantName?.trim() || "Xero";

    return {
      externalTenantId,
      displayName
    };
  }
}
