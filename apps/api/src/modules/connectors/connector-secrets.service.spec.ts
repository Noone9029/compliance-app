import { describe, expect, it } from "vitest";

import { ConnectorSecretsService } from "./connector-secrets.service";

describe("connector secrets service", () => {
  const service = new ConnectorSecretsService();

  it("encrypts and decrypts connector secrets", () => {
    const ciphertext = service.encrypt("access-token-secret");

    expect(ciphertext).not.toBe("access-token-secret");
    expect(service.isEncrypted(ciphertext)).toBe(true);
    expect(service.decrypt(ciphertext)).toBe("access-token-secret");
  });

  it("passes through legacy plaintext values", () => {
    expect(service.isEncrypted("legacy-token")).toBe(false);
    expect(service.decrypt("legacy-token")).toBe("legacy-token");
  });

  it("fails on malformed encrypted payloads", () => {
    expect(() => service.decrypt("enc:v1:broken")).toThrow(/malformed/i);
  });
});
