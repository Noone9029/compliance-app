import { createHash, randomBytes } from "node:crypto";

export type ConnectorStatePayload = {
  organizationId: string;
  userId: string;
  provider: "XERO" | "QUICKBOOKS_ONLINE" | "ZOHO_BOOKS";
  nonce: string;
};

export function encodeConnectorState(payload: ConnectorStatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeConnectorState(value: string): ConnectorStatePayload {
  const json = Buffer.from(value, "base64url").toString("utf8");
  return JSON.parse(json) as ConnectorStatePayload;
}

export function createConnectorNonce(): string {
  return randomBytes(16).toString("hex");
}

export function hashConnectorSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}