import type { ConnectorProvider } from "@daftar/types";

export type ConnectorTransportProvider =
  | "XERO"
  | "QUICKBOOKS_ONLINE"
  | "ZOHO_BOOKS";

export type ConnectorAuthorizationRequest = {
  organizationId: string;
  userId: string;
  redirectUri: string;
  state: string;
};

export type ConnectorAuthorizationResult = {
  authorizationUrl: string;
};

export type ConnectorCallbackInput = {
  organizationId: string;
  userId: string;
  code: string;
  redirectUri: string;
  externalTenantId?: string | null;
};

export type ConnectorTenantSummary = {
  externalTenantId: string;
  displayName: string;
};

export type ConnectorTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
  externalTenantId: string | null;
  displayName: string | null;
  raw: Record<string, unknown>;
};

export type ConnectorRefreshInput = {
  refreshToken: string;
};

export interface ConnectorProviderTransport {
  provider: ConnectorProvider;

  buildAuthorizationUrl(
    input: ConnectorAuthorizationRequest
  ): Promise<ConnectorAuthorizationResult>;

  exchangeAuthorizationCode(
    input: ConnectorCallbackInput
  ): Promise<ConnectorTokenSet>;

  refreshAccessToken?(input: ConnectorRefreshInput): Promise<ConnectorTokenSet>;
}
