import { describe, expect, it } from "vitest";

import { loadServiceEnv } from "./index";

const productionApiBase = {
  NODE_ENV: "production",
  APP_BASE_URL: "https://app.example.com",
  NEXT_PUBLIC_API_URL: "https://api.example.com",
  INTERNAL_API_URL: "https://api-internal.example.com",
  DATABASE_URL: "postgresql://user:pass@db.example.com:5432/daftar?schema=public",
  REDIS_URL: "redis://redis.example.com:6379",
  SESSION_COOKIE_NAME: "daftar_session",
  SESSION_COOKIE_SAME_SITE: "none",
  SESSION_COOKIE_SECURE: "true",
  SESSION_TTL_HOURS: "12",
  AUTH_BCRYPT_ROUNDS: "10",
  COMPLIANCE_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CONNECTOR_SECRETS_KEY: "connector-secrets-prod-key-123456",
  S3_ENDPOINT: "https://s3.example.com",
  S3_REGION: "me-south-1",
  S3_BUCKET: "daftar-prod",
  S3_ACCESS_KEY: "prod-storage-access-key",
  S3_SECRET_KEY: "prod-storage-secret-key",
} as const;

describe("loadServiceEnv", () => {
  it("throws clear errors for missing API production variables", () => {
    expect(() =>
      loadServiceEnv(
        "api",
        {
          ...productionApiBase,
          DATABASE_URL: "",
        },
        { includeWorkspaceEnvFiles: false },
      ),
    ).toThrow(/DATABASE_URL/);
  });

  it("throws clear errors for missing worker production variables", () => {
    expect(() =>
      loadServiceEnv(
        "worker",
        {
          NODE_ENV: "production",
          DATABASE_URL: "",
          REDIS_URL: "redis://redis.example.com:6379",
          COMPLIANCE_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
        },
        { includeWorkspaceEnvFiles: false },
      ),
    ).toThrow(/DATABASE_URL/);
  });

  it("throws clear errors for missing web production variables", () => {
    expect(() =>
      loadServiceEnv(
        "web",
        {
          NODE_ENV: "production",
          APP_BASE_URL: "https://app.example.com",
          NEXT_PUBLIC_API_URL: "",
          INTERNAL_API_URL: "https://api-internal.example.com",
        },
        { includeWorkspaceEnvFiles: false },
      ),
    ).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("keeps development mode defaults for local startup", () => {
    const env = loadServiceEnv(
      "api",
      {
        NODE_ENV: "development",
      },
      { includeWorkspaceEnvFiles: false },
    );

    expect(env.NODE_ENV).toBe("development");
    expect(env.API_PORT).toBe(4000);
    expect(env.DATABASE_URL).toContain("localhost");
  });

  it("requires explicit S3-compatible storage variables for production API startup", () => {
    const withoutStorage: Record<string, string> = { ...productionApiBase };
    delete withoutStorage.S3_ENDPOINT;
    delete withoutStorage.S3_REGION;
    delete withoutStorage.S3_BUCKET;
    delete withoutStorage.S3_ACCESS_KEY;
    delete withoutStorage.S3_SECRET_KEY;

    expect(() =>
      loadServiceEnv("api", withoutStorage, { includeWorkspaceEnvFiles: false }),
    ).toThrow(/S3_ENDPOINT/);
  });

  it("rejects local MinIO storage defaults for production API startup", () => {
    expect(() =>
      loadServiceEnv(
        "api",
        {
          ...productionApiBase,
          S3_ENDPOINT: "http://localhost:9000",
          S3_BUCKET: "daftar-local",
          S3_ACCESS_KEY: "minioadmin",
          S3_SECRET_KEY: "minioadmin",
        },
        { includeWorkspaceEnvFiles: false },
      ),
    ).toThrow(/S3_ENDPOINT.*S3_BUCKET.*S3_ACCESS_KEY.*S3_SECRET_KEY/);
  });

  it("rejects the local compliance encryption key default for production", () => {
    expect(() =>
      loadServiceEnv(
        "api",
        {
          ...productionApiBase,
          COMPLIANCE_ENCRYPTION_KEY: "compliance-encryption-local-dev-key",
        },
        { includeWorkspaceEnvFiles: false },
      ),
    ).toThrow(/COMPLIANCE_ENCRYPTION_KEY/);
  });

  it("accepts a base64-prefixed 32-byte compliance encryption key for production", () => {
    const env = loadServiceEnv(
      "api",
      {
        ...productionApiBase,
        COMPLIANCE_ENCRYPTION_KEY: `base64:${Buffer.alloc(32, 7).toString("base64")}`,
      },
      { includeWorkspaceEnvFiles: false },
    );

    expect(env.NODE_ENV).toBe("production");
  });

  it("accepts a hex-prefixed 32-byte compliance encryption key for production", () => {
    const env = loadServiceEnv(
      "api",
      {
        ...productionApiBase,
        COMPLIANCE_ENCRYPTION_KEY: `hex:${"a".repeat(64)}`,
      },
      { includeWorkspaceEnvFiles: false },
    );

    expect(env.NODE_ENV).toBe("production");
  });

  it("rejects explicitly configured placeholder connector credentials in production", () => {
    expect(() =>
      loadServiceEnv(
        "api",
        {
          ...productionApiBase,
          XERO_CLIENT_ID: "placeholder",
          XERO_CLIENT_SECRET: "placeholder",
        },
        { includeWorkspaceEnvFiles: false },
      ),
    ).toThrow(/XERO_CLIENT_ID.*XERO_CLIENT_SECRET/);
  });
});
