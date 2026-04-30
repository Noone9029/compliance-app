import { describe, expect, it, vi } from "vitest";

import type { DaftarEnv } from "@daftar/config";
import {
  zatcaInvoiceArtifactObjectKey,
  zatcaInvoiceArtifactObjectKeys,
} from "./storage-artifacts";
import { StorageService } from "./storage.service";

const testEnv: DaftarEnv = {
  NODE_ENV: "test",
  APP_NAME: "Daftar",
  APP_BASE_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_NAME: "Daftar",
  NEXT_PUBLIC_API_URL: "http://localhost:4000",
  INTERNAL_API_URL: "http://localhost:4000",
  API_PORT: 4000,
  WEB_PORT: 3000,
  WORKER_PORT: 4010,
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/daftar?schema=public",
  REDIS_URL: "redis://localhost:6379",
  SESSION_COOKIE_NAME: "daftar_session",
  SESSION_COOKIE_SAME_SITE: "lax",
  SESSION_COOKIE_SECURE: "auto",
  SESSION_TTL_HOURS: 12,
  AUTH_BCRYPT_ROUNDS: 10,
  LOG_LEVEL: "debug",
  S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
  S3_REGION: "auto",
  S3_BUCKET: "daftar-private",
  S3_ACCESS_KEY: "storage-access-key",
  S3_SECRET_KEY: "storage-secret-key",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  XERO_CLIENT_ID: "placeholder",
  XERO_CLIENT_SECRET: "placeholder",
  QBO_CLIENT_ID: "placeholder",
  QBO_CLIENT_SECRET: "placeholder",
  CONNECTOR_SECRETS_KEY: "connector-secrets-local-dev-key",
  ZOHO_CLIENT_ID: "placeholder",
  ZOHO_CLIENT_SECRET: "placeholder",
  ZATCA_BASE_URL: "https://gw-fatoora.zatca.gov.sa",
  ZATCA_SDK_CLI_PATH: "fatoora",
  ZATCA_LOCAL_VALIDATION_MODE: "required",
  COMPLIANCE_ENCRYPTION_KEY: "compliance-encryption-local-dev-key",
  COMPLIANCE_ENCRYPTION_PREVIOUS_KEYS: "",
};

describe("StorageService", () => {
  it("generates expiring signed upload and download URLs without public URLs", () => {
    const storage = new StorageService(testEnv, vi.fn());
    const upload = storage.createSignedUploadUrl({
      objectKey: "tenants/t1/orgs/o1/invoices/i1/source.xml",
    });
    const download = storage.createSignedDownloadUrl({
      objectKey: "tenants/t1/orgs/o1/invoices/i1/source.xml",
      expiresInSeconds: 300,
    });
    const uploadUrl = new URL(upload.url);
    const downloadUrl = new URL(download.url);

    expect(upload.method).toBe("PUT");
    expect(upload.expiresInSeconds).toBe(900);
    expect(uploadUrl.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(uploadUrl.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(download.method).toBe("GET");
    expect(download.expiresInSeconds).toBe(300);
    expect(downloadUrl.searchParams.get("X-Amz-Expires")).toBe("300");
    expect("createPublicUrl" in storage).toBe(false);
    expect("getPublicUrl" in storage).toBe(false);
    expect("publicUrl" in storage).toBe(false);
  });

  it("keeps signed URLs provider-neutral and uses the configured endpoint host", () => {
    const storage = new StorageService(testEnv, vi.fn());
    const signed = storage.createSignedDownloadUrl({
      objectKey: "objects/report.pdf",
    });
    const url = new URL(signed.url);

    expect(url.host).toBe("account-id.r2.cloudflarestorage.com");
    expect(url.href).not.toContain("amazonaws.com");
    expect(url.pathname).toBe("/daftar-private/objects/report.pdf");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");
  });

  it("requires explicit delete permission from the caller", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const storage = new StorageService(testEnv, fetchMock);

    await expect(
      storage.deleteObject({
        objectKey: "objects/report.pdf",
        allowDelete: false,
      } as never),
    ).rejects.toThrow(/allowDelete/);

    await storage.deleteObject({
      objectKey: "objects/report.pdf",
      allowDelete: true,
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0]?.[1].method).toBe("DELETE");
  });

  it("checks readiness successfully against the configured private bucket", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const storage = new StorageService(testEnv, fetchMock);

    await expect(storage.checkReadiness()).resolves.toEqual({
      status: "ok",
      bucket: "daftar-private",
      endpoint: "https://account-id.r2.cloudflarestorage.com",
      provider: "s3-compatible",
    });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe(
      "https://account-id.r2.cloudflarestorage.com/daftar-private",
    );
    expect(calls[0]?.[1].method).toBe("HEAD");
  });

  it("returns readiness failure details without throwing", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    const storage = new StorageService(testEnv, fetchMock);

    await expect(storage.checkReadiness()).resolves.toMatchObject({
      status: "error",
      bucket: "daftar-private",
      endpoint: "https://account-id.r2.cloudflarestorage.com",
      provider: "s3-compatible",
      message: "Bucket readiness check failed with status 503.",
    });
  });
});

describe("ZATCA artifact storage paths", () => {
  it("builds deterministic invoice artifact object keys", () => {
    expect(
      zatcaInvoiceArtifactObjectKeys({
        tenantId: "tenant-1",
        orgId: "org-1",
        invoiceId: "invoice-1",
      }),
    ).toEqual({
      sourceXml: "tenants/tenant-1/orgs/org-1/invoices/invoice-1/source.xml",
      signedXml: "tenants/tenant-1/orgs/org-1/invoices/invoice-1/signed.xml",
      visualPdf: "tenants/tenant-1/orgs/org-1/invoices/invoice-1/visual.pdf",
      qrPng: "tenants/tenant-1/orgs/org-1/invoices/invoice-1/qr.png",
    });

    expect(
      zatcaInvoiceArtifactObjectKey({
        tenantId: "tenant-1",
        orgId: "org-1",
        invoiceId: "invoice-1",
        artifact: "signedXml",
      }),
    ).toBe("tenants/tenant-1/orgs/org-1/invoices/invoice-1/signed.xml");
  });
});
