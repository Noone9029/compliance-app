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

type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type: string;
  scope?: string;
};

@Injectable()
export class QuickBooksTransport implements ConnectorProviderTransport {
  readonly provider: ConnectorProvider = "QUICKBOOKS_ONLINE";

  async buildAuthorizationUrl(
    input: ConnectorAuthorizationRequest
  ): Promise<ConnectorAuthorizationResult> {
    const env = loadEnv();
    const url = new URL("https://appcenter.intuit.com/connect/oauth2");

    url.searchParams.set("client_id", env.QBO_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("state", input.state);

    return { authorizationUrl: url.toString() };
  }

  async exchangeAuthorizationCode(
    input: ConnectorCallbackInput
  ): Promise<ConnectorTokenSet> {
    return this.exchangeToken({
      grantType: "authorization_code",
      code: input.code,
      redirectUri: input.redirectUri
    });
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
    refreshToken?: string;
    redirectUri?: string;
  }): Promise<ConnectorTokenSet> {
    const env = loadEnv();
    const basic = Buffer.from(
      `${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`,
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

    const response = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `QuickBooks token exchange failed: ${response.status} ${text}`
      );
    }

    const data = (await response.json()) as QuickBooksTokenResponse;
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scopes: data.scope ? data.scope.split(" ").filter(Boolean) : [],
      externalTenantId: null,
      displayName: "QuickBooks",
      raw: data as Record<string, unknown>
    };
  }
}