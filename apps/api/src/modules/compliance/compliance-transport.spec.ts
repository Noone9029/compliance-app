import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DaftarEnv } from "@daftar/config";
import {
  createComplianceTransportClient,
  ComplianceTransportError,
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
    ZATCA_SDK_CLI_PATH: "fatoora",
    ZATCA_LOCAL_VALIDATION_MODE: "required",
    COMPLIANCE_ENCRYPTION_KEY: "compliance-encryption-local-dev-key",
    COMPLIANCE_ENCRYPTION_PREVIOUS_KEYS: "",
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

  it("uses credentials passed on each request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: async () => ({ message: "Accepted" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createComplianceTransportClient({ env: buildEnv() });

    await client.submit({
      flow: "REPORTING",
      invoiceId: "invoice_1",
      invoiceNumber: "INV-NE-1001",
      uuid: "uuid-1",
      attemptNumber: 1,
      invoiceHash: "hash-1",
      xmlContent: "<Invoice />",
      onboarding: null,
      credentials: {
        clientId: "tenant-client",
        clientSecret: "tenant-secret",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://example.zatca.gov.sa/e-invoicing/core/invoices/reporting/single",
    );
    expect(request.headers.authorization).toBe(
      `Basic ${Buffer.from("tenant-client:tenant-secret").toString("base64")}`,
    );
    expect(request.headers["accept-version"]).toBe("v2");
  });

  it("uses live transport in test mode when LIVE_ZATCA_E2E is enabled", async () => {
    const previous = process.env.LIVE_ZATCA_E2E;
    process.env.LIVE_ZATCA_E2E = "1";

    try {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
        json: async () => ({ message: "Accepted" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = createComplianceTransportClient({
        env: buildEnv({ NODE_ENV: "test" }),
      });

      await client.submit({
        flow: "REPORTING",
        invoiceId: "invoice_live_1",
        invoiceNumber: "INV-LIVE-1001",
        uuid: "uuid-live-1",
        attemptNumber: 1,
        invoiceHash: "hash-live-1",
        xmlContent: "<Invoice />",
        onboarding: null,
        credentials: {
          clientId: "tenant-client",
          clientSecret: "tenant-secret",
        },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://example.zatca.gov.sa/e-invoicing/core/invoices/reporting/single",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.LIVE_ZATCA_E2E;
      } else {
        process.env.LIVE_ZATCA_E2E = previous;
      }
    }
  });

  it("normalizes legacy gateway host and routes sandbox submissions to simulation endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: async () => ({ message: "Accepted" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createComplianceTransportClient({
      env: buildEnv({
        ZATCA_BASE_URL: "https://gw-apic-gov.gazt.gov.sa",
      }),
    });

    await client.submit({
      flow: "CLEARANCE",
      invoiceId: "invoice_2",
      invoiceNumber: "INV-NE-1002",
      uuid: "uuid-2",
      attemptNumber: 1,
      invoiceHash: "hash-2",
      xmlContent: "<Invoice />",
      onboarding: {
        environment: "Sandbox",
        csid: "sandbox-csid",
        certificateId: null,
      },
      credentials: {
        clientId: "sandbox-csid",
        clientSecret: "sandbox-secret",
      },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/invoices/clearance/single",
    );
  });

  it("handles 303 redirect semantics and merges redirected payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 303,
        headers: {
          get: vi.fn((name: string) =>
            name.toLowerCase() === "location"
              ? "/e-invoicing/core/invoices/reporting/single/requests/123"
              : null,
          ),
        },
        json: async () => ({ requestId: "REQ-123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
        json: async () => ({
          requestId: "REQ-123",
          reportingStatus: "REPORTED",
          message: "Accepted after redirect",
          warnings: [{ message: "Minor issue" }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = createComplianceTransportClient({ env: buildEnv() });
    const response = await client.submit({
      flow: "REPORTING",
      invoiceId: "invoice_3",
      invoiceNumber: "INV-NE-1003",
      uuid: "uuid-3",
      attemptNumber: 1,
      invoiceHash: "hash-3",
      xmlContent: "<Invoice />",
      onboarding: null,
      credentials: {
        clientId: "tenant-client",
        clientSecret: "tenant-secret",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://example.zatca.gov.sa/e-invoicing/core/invoices/reporting/single/requests/123",
    );
    expect(response.status).toBe("ACCEPTED_WITH_WARNINGS");
    expect(response.requestId).toBe("REQ-123");
    expect(response.warnings).toEqual(["Minor issue"]);
  });

  it("classifies warning responses without turning them into failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: async () => ({
        clearanceStatus: "CLEARED_WITH_WARNINGS",
        warnings: [{ message: "Amount rounded" }],
        requestId: "REQ-WARN",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createComplianceTransportClient({ env: buildEnv() });
    const response = await client.submit({
      flow: "CLEARANCE",
      invoiceId: "invoice_4",
      invoiceNumber: "INV-NE-1004",
      uuid: "uuid-4",
      attemptNumber: 1,
      invoiceHash: "hash-4",
      xmlContent: "<Invoice />",
      onboarding: null,
      credentials: {
        clientId: "tenant-client",
        clientSecret: "tenant-secret",
      },
    });

    expect(response.status).toBe("ACCEPTED_WITH_WARNINGS");
    expect(response.warnings).toEqual(["Amount rounded"]);
    expect(response.errors).toEqual([]);
  });

  it("classifies payload-level rejection responses as transport errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: async () => ({
        status: "REJECTED",
        errors: [{ message: "Invalid signed invoice hash" }],
        requestId: "REQ-REJECT",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createComplianceTransportClient({ env: buildEnv() });

    await expect(
      client.submit({
        flow: "REPORTING",
        invoiceId: "invoice_5",
        invoiceNumber: "INV-NE-1005",
        uuid: "uuid-5",
        attemptNumber: 1,
        invoiceHash: "hash-5",
        xmlContent: "<Invoice />",
        onboarding: null,
        credentials: {
          clientId: "tenant-client",
          clientSecret: "tenant-secret",
        },
      }),
    ).rejects.toBeInstanceOf(ComplianceTransportError);
  });

  it("treats 429 responses as retryable connectivity failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: vi.fn((name: string) =>
          name.toLowerCase() === "retry-after" ? "120" : null,
        ),
      },
      json: async () => ({
        message: "Too many requests",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createComplianceTransportClient({ env: buildEnv() });

    await expect(
      client.submit({
        flow: "REPORTING",
        invoiceId: "invoice_429",
        invoiceNumber: "INV-NE-429",
        uuid: "uuid-429",
        attemptNumber: 1,
        invoiceHash: "hash-429",
        xmlContent: "<Invoice />",
        onboarding: null,
        credentials: {
          clientId: "tenant-client",
          clientSecret: "tenant-secret",
        },
      }),
    ).rejects.toMatchObject({
      category: "CONNECTIVITY",
      retryable: true,
      statusCode: 429,
    });
  });

  it("treats 5xx responses as retryable connectivity failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: async () => ({
        message: "Service unavailable",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createComplianceTransportClient({ env: buildEnv() });

    await expect(
      client.submit({
        flow: "REPORTING",
        invoiceId: "invoice_503",
        invoiceNumber: "INV-NE-503",
        uuid: "uuid-503",
        attemptNumber: 1,
        invoiceHash: "hash-503",
        xmlContent: "<Invoice />",
        onboarding: null,
        credentials: {
          clientId: "tenant-client",
          clientSecret: "tenant-secret",
        },
      }),
    ).rejects.toMatchObject({
      category: "CONNECTIVITY",
      retryable: true,
      statusCode: 503,
    });
  });

  it("treats authentication responses as terminal failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: async () => ({
        message: "Unauthorized",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createComplianceTransportClient({ env: buildEnv() });

    await expect(
      client.submit({
        flow: "CLEARANCE",
        invoiceId: "invoice_401",
        invoiceNumber: "INV-NE-401",
        uuid: "uuid-401",
        attemptNumber: 1,
        invoiceHash: "hash-401",
        xmlContent: "<Invoice />",
        onboarding: null,
        credentials: {
          clientId: "tenant-client",
          clientSecret: "tenant-secret",
        },
      }),
    ).rejects.toMatchObject({
      category: "AUTHENTICATION",
      retryable: false,
      statusCode: 401,
    });
  });

  it("treats network failures as retryable connectivity errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const client = createComplianceTransportClient({ env: buildEnv() });

    await expect(
      client.submit({
        flow: "CLEARANCE",
        invoiceId: "invoice_network",
        invoiceNumber: "INV-NE-NETWORK",
        uuid: "uuid-network",
        attemptNumber: 1,
        invoiceHash: "hash-network",
        xmlContent: "<Invoice />",
        onboarding: null,
        credentials: {
          clientId: "tenant-client",
          clientSecret: "tenant-secret",
        },
      }),
    ).rejects.toMatchObject({
      category: "CONNECTIVITY",
      retryable: true,
    });
  });

  it("fails when request credentials are not provided", async () => {
    const client = createComplianceTransportClient({ env: buildEnv() });

    await expect(
      client.submit({
        flow: "CLEARANCE",
        invoiceId: "invoice_1",
        invoiceNumber: "INV-NE-1001",
        uuid: "uuid-1",
        attemptNumber: 1,
        invoiceHash: "hash-1",
        xmlContent: "<Invoice />",
        onboarding: null,
        credentials: null,
      }),
    ).rejects.toBeInstanceOf(ComplianceTransportError);
  });

  it("redacts secrets inside transport errors and payloads", () => {
    const error = new ComplianceTransportError({
      message: "certificateSecret=super-secret Authorization: Basic dXNlcjpzZWNyZXQ=",
      category: "UNKNOWN",
      retryable: false,
      responsePayload: {
        certificateSecret: "super-secret",
        nested: {
          privateKeyPem: "-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----",
        },
      },
    });

    expect(error.message).toContain("[REDACTED]");
    expect(error.message).not.toContain("super-secret");
    expect(error.responsePayload).toEqual({
      certificateSecret: "[REDACTED]",
      nested: {
        privateKeyPem: "[REDACTED]",
      },
    });
  });
});
