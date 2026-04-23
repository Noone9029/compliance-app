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
  COMPLIANCE_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
  CONNECTOR_SECRETS_KEY: "connector-secrets-prod-key-1234",
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
});
