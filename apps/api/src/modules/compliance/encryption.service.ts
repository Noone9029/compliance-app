import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Injectable } from "@nestjs/common";

import { loadEnv, type DaftarEnv } from "@daftar/config";

const ENCRYPTION_PREFIX = "enc:v1:";

type EncryptionKey = {
  id: string;
  key: Buffer;
};

type DecryptionResult = {
  plaintext: string;
  keyId: string | null;
  encrypted: boolean;
};

function deriveKeyId(key: Buffer) {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function decodeKey(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      "COMPLIANCE_ENCRYPTION_KEY must be set to a non-empty value.",
    );
  }

  if (trimmed.startsWith("base64:")) {
    const decoded = Buffer.from(trimmed.slice("base64:".length), "base64");
    if (decoded.length !== 32) {
      throw new Error(
        "COMPLIANCE_ENCRYPTION_KEY base64 payload must decode to 32 bytes.",
      );
    }
    return decoded;
  }

  if (trimmed.startsWith("hex:")) {
    const decoded = Buffer.from(trimmed.slice("hex:".length), "hex");
    if (decoded.length !== 32) {
      throw new Error(
        "COMPLIANCE_ENCRYPTION_KEY hex payload must decode to 32 bytes.",
      );
    }
    return decoded;
  }

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  if (/^[a-z0-9+/=]+$/i.test(trimmed) && trimmed.length % 4 === 0) {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  }

  return createHash("sha256").update(trimmed, "utf8").digest();
}

function parsePreviousKeys(raw: string) {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function decodeSegment(segment: string, fieldName: string) {
  try {
    return Buffer.from(segment, "base64");
  } catch {
    throw new Error(`Encrypted payload has invalid ${fieldName}.`);
  }
}

@Injectable()
export class ComplianceEncryptionService {
  private readonly currentKey: EncryptionKey;
  private readonly keysById = new Map<string, Buffer>();
  private readonly keyOrder: string[] = [];

  constructor(env: DaftarEnv = loadEnv()) {
    const keys: EncryptionKey[] = [];
    const current = decodeKey(env.COMPLIANCE_ENCRYPTION_KEY);
    keys.push({
      id: deriveKeyId(current),
      key: current,
    });

    for (const previous of parsePreviousKeys(env.COMPLIANCE_ENCRYPTION_PREVIOUS_KEYS)) {
      const decoded = decodeKey(previous);
      keys.push({
        id: deriveKeyId(decoded),
        key: decoded,
      });
    }

    for (const entry of keys) {
      if (this.keysById.has(entry.id)) {
        continue;
      }
      this.keysById.set(entry.id, entry.key);
      this.keyOrder.push(entry.id);
    }

    this.currentKey = keys[0]!;
  }

  isEncrypted(value: string | null | undefined): value is string {
    return Boolean(value && value.startsWith(ENCRYPTION_PREFIX));
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.currentKey.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `${ENCRYPTION_PREFIX}${this.currentKey.id}:${iv.toString("base64")}:${tag.toString(
      "base64",
    )}:${encrypted.toString("base64")}`;
  }

  decrypt(ciphertext: string): string {
    return this.decryptWithDetails(ciphertext).plaintext;
  }

  reencryptWithCurrentKey(value: string | null | undefined) {
    if (!value) {
      return value ?? null;
    }

    const decrypted = this.decryptWithDetails(value);
    if (!decrypted.encrypted) {
      return this.encrypt(decrypted.plaintext);
    }

    if (decrypted.keyId === this.currentKey.id) {
      return value;
    }

    return this.encrypt(decrypted.plaintext);
  }

  private decryptWithDetails(ciphertext: string): DecryptionResult {
    if (!this.isEncrypted(ciphertext)) {
      return {
        plaintext: ciphertext,
        keyId: null,
        encrypted: false,
      };
    }

    const parts = ciphertext.split(":");
    if (parts.length !== 6 || parts[0] !== "enc" || parts[1] !== "v1") {
      throw new Error("Encrypted payload format is invalid.");
    }

    const keyId = parts[2]!;
    const iv = decodeSegment(parts[3]!, "iv");
    const authTag = decodeSegment(parts[4]!, "authTag");
    const encrypted = decodeSegment(parts[5]!, "ciphertext");

    const preferred = this.keysById.get(keyId);
    const candidateIds = preferred
      ? [keyId, ...this.keyOrder.filter((entry) => entry !== keyId)]
      : this.keyOrder;

    for (const candidateId of candidateIds) {
      const key = this.keysById.get(candidateId);
      if (!key) {
        continue;
      }
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]).toString("utf8");
        return {
          plaintext,
          keyId: candidateId,
          encrypted: true,
        };
      } catch {
        // Try remaining keys.
      }
    }

    throw new Error(
      "Compliance secret cannot be decrypted with configured encryption keys.",
    );
  }
}
