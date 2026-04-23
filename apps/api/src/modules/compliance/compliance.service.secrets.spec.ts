import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "@daftar/config";
import { ComplianceEncryptionService } from "./encryption.service";
import { ComplianceService } from "./compliance.service";

function createServiceForSecretsTests() {
  const prisma = {
    complianceOnboarding: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue(null),
    },
  };
  const service = new ComplianceService(
    prisma as any,
    {} as any,
    {} as any,
    new ComplianceEncryptionService(
      loadEnv({
        NODE_ENV: "test",
        COMPLIANCE_ENCRYPTION_KEY:
          "base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      }),
    ),
    {} as any,
    {} as any,
  );

  return {
    service,
    prisma,
  };
}

describe("compliance service secret handling", () => {
  it("redacts sensitive fields from onboarding metadata snapshots", () => {
    const { service } = createServiceForSecretsTests();

    const sanitized = (service as any).sanitizeOnboardingMetadata({
      secret: "top-secret",
      certificateSecret: "also-secret",
      nested: {
        privateKeyPem: "-----BEGIN PRIVATE KEY-----",
        private_key: "raw",
        keep: "ok",
      },
    });

    expect(sanitized).toEqual({
      secret: "[REDACTED]",
      certificateSecret: "[REDACTED]",
      nested: {
        privateKeyPem: "[REDACTED]",
        private_key: "[REDACTED]",
        keep: "ok",
      },
    });
  });

  it("rotates legacy plaintext secret values to encrypted payloads", async () => {
    const { service, prisma } = createServiceForSecretsTests();
    const plaintext = "legacy-plaintext-secret";

    const decrypted = await (service as any).readOnboardingSecret({
      onboardingId: "onb_1",
      field: "certificateSecret",
      value: plaintext,
      errorMessage: "should not fail",
    });

    expect(decrypted).toBe(plaintext);
    expect(prisma.complianceOnboarding.update).toHaveBeenCalledTimes(1);
    const updateInput = prisma.complianceOnboarding.update.mock.calls[0]?.[0];
    expect(updateInput?.data?.certificateSecret).toMatch(/^enc:v1:/);
    expect(updateInput?.data?.certificateSecret).not.toBe(plaintext);
  });

  it("never exposes onboarding secrets through read models", async () => {
    const { service, prisma } = createServiceForSecretsTests();
    prisma.complianceOnboarding.findFirst.mockResolvedValue({
      id: "onb_1",
      organizationId: "org_1",
      environment: "Sandbox",
      deviceName: "EGS Device",
      deviceSerial: "egs-1",
      status: "ACTIVE",
      certificateStatus: "ACTIVE",
      commonName: "EGS Device",
      egsSerialNumber: "egs-1",
      organizationUnitName: "Ops",
      organizationName: "Nomad Events",
      countryCode: "SA",
      vatNumber: "300123456700003",
      branchName: "Riyadh",
      locationAddress: "Olaya",
      industry: "Events",
      csrPem: "csr",
      csrBase64: "csr-base64",
      privateKeyPem: "enc:v1:private",
      publicKeyPem: "public",
      otpCode: "123456",
      otpReceivedAt: null,
      csrGeneratedAt: new Date("2026-01-01T00:00:00.000Z"),
      csrSubmittedAt: new Date("2026-01-01T00:00:00.000Z"),
      csid: "csid-1",
      certificateId: "cert-1",
      certificatePem: "pem",
      certificateBase64: "base64",
      certificateSecret: "enc:v1:secret",
      secretFingerprint: "fingerprint",
      certificateIssuedAt: new Date("2026-01-01T00:00:00.000Z"),
      certificateExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
      lastActivatedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastRenewedAt: new Date("2026-01-01T00:00:00.000Z"),
      zatcaRequestId: "req-1",
      revokedAt: null,
      lastError: null,
      metadata: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const record = await service.getOnboarding("org_1", "onb_1");

    expect("privateKeyPem" in record).toBe(false);
    expect("certificateSecret" in record).toBe(false);
    expect("otpCode" in record).toBe(false);
  });

  it("redacts secret-looking values from onboarding error messages", () => {
    const { service } = createServiceForSecretsTests();

    const message = (service as any).onboardingClientErrorMessage(
      new Error("certificateSecret=super-secret"),
      "fallback",
    );

    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("super-secret");
  });
});
