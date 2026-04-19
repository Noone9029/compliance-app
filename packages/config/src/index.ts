import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().min(1).default("Daftar"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Daftar"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  INTERNAL_API_URL: z.string().url().default("http://localhost:4000"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  WORKER_PORT: z.coerce.number().int().positive().default(4010),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/daftar?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  SESSION_COOKIE_NAME: z.string().min(1).default("daftar_session"),
  SESSION_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  SESSION_COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  AUTH_BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(14).default(10),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  S3_ENDPOINT: z.string().min(1).default("http://localhost:9000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("daftar-local"),
  S3_ACCESS_KEY: z.string().min(1).default("minioadmin"),
  S3_SECRET_KEY: z.string().min(1).default("minioadmin"),
  STRIPE_SECRET_KEY: z.string().min(1).default("sk_test_placeholder"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).default("whsec_placeholder"),
  XERO_CLIENT_ID: z.string().min(1).default("placeholder"),
  XERO_CLIENT_SECRET: z.string().min(1).default("placeholder"),
  QBO_CLIENT_ID: z.string().min(1).default("placeholder"),
  QBO_CLIENT_SECRET: z.string().min(1).default("placeholder"),
  ZOHO_CLIENT_ID: z.string().min(1).default("placeholder"),
  ZOHO_CLIENT_SECRET: z.string().min(1).default("placeholder"),
  ZATCA_BASE_URL: z.string().min(1).default("https://sandbox.example.zatca.gov.sa"),
  ZATCA_CLIENT_ID: z.string().min(1).default("placeholder"),
  ZATCA_CLIENT_SECRET: z.string().min(1).default("placeholder")
});

export type DaftarEnv = z.infer<typeof baseEnvSchema>;

const configDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(configDir, "../../..");

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((accumulator, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return accumulator;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function loadWorkspaceEnvFiles(): Record<string, string> {
  return {
    ...parseEnvFile(resolve(workspaceRoot, ".env")),
    ...parseEnvFile(resolve(workspaceRoot, ".env.local"))
  };
}

export function loadEnv(input: NodeJS.ProcessEnv = {}): DaftarEnv {
  const workspaceEnv = loadWorkspaceEnvFiles();
  const merged = {
    ...process.env,
    ...workspaceEnv,
    ...input
  };

  merged.NODE_ENV = input.NODE_ENV ?? process.env.NODE_ENV ?? workspaceEnv.NODE_ENV;

  if (!merged.API_PORT && merged.PORT) {
    merged.API_PORT = merged.PORT;
  }

  if (!merged.WEB_PORT && merged.PORT) {
    merged.WEB_PORT = merged.PORT;
  }

  if (!merged.INTERNAL_API_URL && merged.NEXT_PUBLIC_API_URL) {
    merged.INTERNAL_API_URL = merged.NEXT_PUBLIC_API_URL;
  }

  return baseEnvSchema.parse(merged);
}

export const queueNames = {
  platform: "platform-events",
  complianceSubmissions: "compliance-submissions"
} as const;

export const featureFlags = {
  week1InvitationsStub: true,
  week1DebugSessionPage: true
} as const;
