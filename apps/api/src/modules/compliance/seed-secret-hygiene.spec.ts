import { describe, expect, it } from "vitest";

import { loadEnv } from "@daftar/config";
import { ComplianceEncryptionService } from "./encryption.service";
import { protectSeedComplianceSecrets } from "./seed-secret-hygiene";

describe("seed secret hygiene", () => {
  it("encrypts seed onboarding secrets before insert", () => {
    const encryptionService = new ComplianceEncryptionService(
      loadEnv({
        NODE_ENV: "test",
        COMPLIANCE_ENCRYPTION_KEY:
          "base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      }),
    );

    const protectedSecrets = protectSeedComplianceSecrets(
      {
        privateKeyPem: "-----BEGIN PRIVATE KEY-----seed-----END PRIVATE KEY-----",
        certificateSecret: "seed-certificate-secret",
      },
      encryptionService,
    );

    expect(protectedSecrets.privateKeyPem).toMatch(/^enc:v1:/);
    expect(protectedSecrets.certificateSecret).toMatch(/^enc:v1:/);
    expect(protectedSecrets.privateKeyPem).not.toContain("BEGIN PRIVATE KEY");
    expect(protectedSecrets.certificateSecret).not.toContain(
      "seed-certificate-secret",
    );
  });

  it("fails fast when an encryptor returns plaintext", () => {
    expect(() =>
      protectSeedComplianceSecrets(
        {
          privateKeyPem: "plain-private",
          certificateSecret: "plain-secret",
        },
        {
          encrypt: (value: string) => value,
        },
      ),
    ).toThrow("Seed compliance secrets must be encrypted at rest");
  });
});

