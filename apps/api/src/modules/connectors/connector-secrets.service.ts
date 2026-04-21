import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { loadEnv } from "@daftar/config";

const ENCRYPTED_PREFIX = "enc:v1:";
const IV_BYTES = 12;

@Injectable()
export class ConnectorSecretsService {
  encrypt(secret: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.getKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${tag.toString(
      "base64"
    )}:${encrypted.toString("base64")}`;
  }

  decrypt(secretOrCiphertext: string): string {
    if (!this.isEncrypted(secretOrCiphertext)) {
      return secretOrCiphertext;
    }

    const encoded = secretOrCiphertext.slice(ENCRYPTED_PREFIX.length);
    const parts = encoded.split(":");

    if (parts.length !== 3) {
      throw new Error("Connector secret ciphertext is malformed.");
    }

    const [ivEncoded, tagEncoded, ciphertextEncoded] = parts;
    const iv = Buffer.from(ivEncoded, "base64");
    const tag = Buffer.from(tagEncoded, "base64");
    const ciphertext = Buffer.from(ciphertextEncoded, "base64");
    const decipher = createDecipheriv("aes-256-gcm", this.getKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString("utf8");
  }

  isEncrypted(value: string | null | undefined): value is string {
    return Boolean(value?.startsWith(ENCRYPTED_PREFIX));
  }

  private getKey(): Buffer {
    const env = loadEnv();
    return createHash("sha256")
      .update(env.CONNECTOR_SECRETS_KEY, "utf8")
      .digest();
  }
}
