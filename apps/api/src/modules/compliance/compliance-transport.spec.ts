import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DaftarEnv } from "@daftar/config";
import {
  createComplianceTransportClient,
  fallbackComplianceTransportCredentialsFromEnv,
  isConfiguredComplianceCredentials,
} from "./compliance-transport";

function buildEnv(overrides?: Partial<DaftarEnv>): DaftarEnv {
  return {
    NODE_ENV: "production",
    APP_NAME: "Daftar",
    APP_BASE_URL: "http://localhost:3000",
    NEXT_PUBLIC_APP_NAME: "Daftar",
    NEXT_PUBLIC_API_URL: "http://localhost:4000",
    INTERNAL_API_URL: "http://localhost:4000",
    API_PORT: 4000,
    WEB_PORT: 3000,
    WORKER_PORT: 4010,
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/daftar",
    REDIS_URL: "redis://localhost:6379",
    SESSION_COOKIE_SAME_SITE: "lax",
    SESSION_COOKIE_SECURE: "false",
    AUTH_BCRYPT_ROUNDS: 10,
    SESSION_COOKIE_NAME: "daftar_session",
    SESSION_TTL_HOURS: 24,
    LOG_LEVEL: "info",
    ZATCA_BASE_URL: "https://example.zatca.gov.sa",
    ZATCA_CLIENT_ID: "placeholder",
    ZATCA_CLIENT_SECRET: "placeholder",
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "us-east-1",
    S3_BUCKET: "daftar-local",
    S3_ACCESS_KEY: "minio",
    S3_SECRET_KEY: "minio123",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    XERO_CLIENT_ID: "xero-client",
    XERO_CLIENT_SECRET: "xero-secret",
    QBO_CLIENT_ID: "qbo-client",
    QBO_CLIENT_SECRET: "qbo-secret",
    CONNECTOR_SECRETS_KEY: "connector-secrets-local-dev-key",
    ZOHO_CLIENT_ID: "zoho-client",
    ZOHO_CLIENT_SECRET: "zoho-secret",
    ...overrides,
  };
}

describe("compliance transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("evaluates readiness from explicit credentials", () => {
    expect(isConfiguredComplianceCredentials(null)).toBe(false);
    expect(
      isConfiguredComplianceCredentials({
        clientId: "client",
        clientSecret: "secret",
      }),
    ).toBe(true);
  });

  it("uses explicitly provided fallback credentials instead of workspace env", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Accepted" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createComplianceTransportClient({
      env: buildEnv(),
      fallbackCredentials: {
        clientId: "tenant-client",
        clientSecret: "tenant-secret",
      },
    });

    await client.submit({
      flow: "REPORTING",
      invoiceId: "invoice_1",
      invoiceNumber: "INV-NE-1001",
      uuid: "uuid-1",
      attemptNumber: 1,
      invoiceHash: "hash-1",
      xmlContent: "<Invoice />",
      onboarding: null,
      credentials: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0]!;
    expect(request.headers.authorization).toBe(
      `Basic ${Buffer.from("tenant-client:tenant-secret").toString("base64")}`,
    );
  });

  it("derives optional fallback credentials from env when they are explicitly requested", () => {
    expect(fallbackComplianceTransportCredentialsFromEnv(buildEnv())).toBeNull();
    expect(
      fallbackComplianceTransportCredentialsFromEnv(
        buildEnv({
          ZATCA_CLIENT_ID: "client-id",
          ZATCA_CLIENT_SECRET: "client-secret",
        }),
      ),
    ).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
  });
});
