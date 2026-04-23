import { describe, expect, it } from "vitest";

import {
  redactSensitiveText,
  sanitizeSensitiveObject,
  sanitizeSensitiveValue,
} from "./secret-redaction";

describe("compliance secret redaction", () => {
  it("redacts protected keys recursively for logs and metadata", () => {
    const sanitized = sanitizeSensitiveObject({
      stage: "activation",
      certificateSecret: "plain-secret-value",
      nested: {
        privateKeyPem: "-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----",
        authorization: "Basic dXNlcjpzZWNyZXQ=",
        keep: "ok",
      },
    });

    expect(sanitized).toEqual({
      stage: "activation",
      certificateSecret: "[REDACTED]",
      nested: {
        privateKeyPem: "[REDACTED]",
        authorization: "[REDACTED]",
        keep: "ok",
      },
    });
  });

  it("redacts inline sensitive text patterns", () => {
    const redacted = redactSensitiveText(
      'certificateSecret: super-secret Authorization: Basic dXNlcjpzZWNyZXQ= "privateKeyPem":"-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----"',
    );

    expect(redacted).not.toContain("super-secret");
    expect(redacted).not.toContain("dXNlcjpzZWNyZXQ=");
    expect(redacted).not.toContain("BEGIN PRIVATE KEY");
    expect(redacted).toContain("[REDACTED]");
  });

  it("redacts thrown error messages before log serialization", () => {
    const value = sanitizeSensitiveValue(
      new Error("certificateSecret=super-secret"),
    ) as { message: string };

    expect(value.message).toContain("[REDACTED]");
    expect(value.message).not.toContain("super-secret");
  });
});

