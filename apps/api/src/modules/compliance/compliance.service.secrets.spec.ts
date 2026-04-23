import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "@daftar/config";
import { ComplianceEncryptionService } from "./encryption.service";
import { ComplianceService } from "./compliance.service";

function createServiceForSecretsTests() {
  const prisma = {
    complianceOnboarding: {
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
});
