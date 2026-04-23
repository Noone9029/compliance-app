import { describe, expect, it } from "vitest";

import { loadEnv, type DaftarEnv } from "@daftar/config";
import { ComplianceEncryptionService } from "./encryption.service";

const KEY_A = "base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const KEY_B = "base64:ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=";

function buildEnv(overrides?: Record<string, string>): DaftarEnv {
  return loadEnv({
    NODE_ENV: "test",
    COMPLIANCE_ENCRYPTION_KEY: KEY_A,
    COMPLIANCE_ENCRYPTION_PREVIOUS_KEYS: "",
    ...overrides,
  });
}

describe("compliance encryption service", () => {
  it("encrypts and decrypts secrets with AES-256-GCM envelope format", () => {
    const service = new ComplianceEncryptionService(buildEnv());
    const plaintext = "PRIVATE-KEY-MATERIAL";

    const encrypted = service.encrypt(plaintext);

    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(encrypted).not.toBe(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it("treats legacy plaintext values as readable and re-encryptable", () => {
    const service = new ComplianceEncryptionService(buildEnv());
    const plaintext = "legacy-plain-secret";

    expect(service.decrypt(plaintext)).toBe(plaintext);
    const rotated = service.reencryptWithCurrentKey(plaintext);
    expect(rotated).not.toBe(plaintext);
    expect(rotated?.startsWith("enc:v1:")).toBe(true);
    expect(service.decrypt(rotated!)).toBe(plaintext);
  });

  it("supports key rotation using previous keys", () => {
    const previousKeyService = new ComplianceEncryptionService(
      buildEnv({
        COMPLIANCE_ENCRYPTION_KEY: KEY_A,
      }),
    );
    const encryptedWithPrevious = previousKeyService.encrypt("rotating-secret");

    const currentKeyService = new ComplianceEncryptionService(
      buildEnv({
        COMPLIANCE_ENCRYPTION_KEY: KEY_B,
        COMPLIANCE_ENCRYPTION_PREVIOUS_KEYS: KEY_A,
      }),
    );

    expect(currentKeyService.decrypt(encryptedWithPrevious)).toBe("rotating-secret");
    const reencrypted = currentKeyService.reencryptWithCurrentKey(encryptedWithPrevious);
    expect(reencrypted).not.toBe(encryptedWithPrevious);
    expect(reencrypted?.startsWith("enc:v1:")).toBe(true);
    expect(currentKeyService.decrypt(reencrypted!)).toBe("rotating-secret");
  });

  it("fails decryption when ciphertext key is unknown", () => {
    const keyAService = new ComplianceEncryptionService(buildEnv());
    const encrypted = keyAService.encrypt("unreadable-with-other-key");
    const keyBService = new ComplianceEncryptionService(
      buildEnv({
        COMPLIANCE_ENCRYPTION_KEY: KEY_B,
      }),
    );

    expect(() => keyBService.decrypt(encrypted)).toThrow(
      /cannot be decrypted with configured encryption keys/i,
    );
  });
});
