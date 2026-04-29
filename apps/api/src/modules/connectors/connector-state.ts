import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@daftar/config";

export type UnsignedConnectorStatePayload = {
  organizationId: string;
  userId: string;
  provider: "XERO" | "QUICKBOOKS_ONLINE" | "ZOHO_BOOKS";
  nonce: string;
};

export type ConnectorStatePayload = UnsignedConnectorStatePayload & {
  issuedAt: string;
  expiresAt: string;
};

export const CONNECTOR_STATE_TTL_MS = 10 * 60 * 1000;

export function encodeConnectorState(
  payload: UnsignedConnectorStatePayload,
  options: {
    now?: Date;
    ttlMs?: number;
  } = {}
): string {
  const issuedAt = options.now ?? new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + (options.ttlMs ?? CONNECTOR_STATE_TTL_MS)
  );
  const signedPayload: ConnectorStatePayload = {
    organizationId: payload.organizationId,
    userId: payload.userId,
    provider: payload.provider,
    nonce: payload.nonce,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
  const body = Buffer.from(JSON.stringify(signedPayload), "utf8").toString(
    "base64url"
  );

  return `${body}.${signConnectorStateBody(body)}`;
}

export function decodeConnectorState(
  value: string,
  options: {
    now?: Date;
  } = {}
): ConnectorStatePayload {
  const [body, signature, extra] = value.split(".");

  if (!body || !signature || extra !== undefined) {
    throw new Error("Invalid connector state");
  }

  if (!verifyConnectorStateSignature(body, signature)) {
    throw new Error("Invalid connector state");
  }

  let payload: ConnectorStatePayload;

  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    payload = JSON.parse(json) as ConnectorStatePayload;
  } catch {
    throw new Error("Invalid connector state");
  }

  if (!isConnectorStatePayload(payload)) {
    throw new Error("Invalid connector state");
  }

  const expiresAtMs = new Date(payload.expiresAt).getTime();
  const nowMs = (options.now ?? new Date()).getTime();

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    throw new Error("Expired connector state");
  }

  return payload;
}

export function createConnectorNonce(): string {
  return randomBytes(16).toString("hex");
}

export function hashConnectorSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function signConnectorStateBody(body: string): string {
  const env = loadEnv();

  return createHmac("sha256", env.CONNECTOR_SECRETS_KEY)
    .update(`connector-oauth-state.v1.${body}`)
    .digest("base64url");
}

function verifyConnectorStateSignature(body: string, signature: string): boolean {
  const expected = signConnectorStateBody(body);
  const expectedBuffer = Buffer.from(expected, "base64url");
  const actualBuffer = Buffer.from(signature, "base64url");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function isConnectorStatePayload(value: unknown): value is ConnectorStatePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as ConnectorStatePayload;

  return (
    typeof candidate.organizationId === "string" &&
    candidate.organizationId.length > 0 &&
    typeof candidate.userId === "string" &&
    candidate.userId.length > 0 &&
    ["XERO", "QUICKBOOKS_ONLINE", "ZOHO_BOOKS"].includes(candidate.provider) &&
    typeof candidate.nonce === "string" &&
    candidate.nonce.length > 0 &&
    typeof candidate.issuedAt === "string" &&
    Number.isFinite(new Date(candidate.issuedAt).getTime()) &&
    typeof candidate.expiresAt === "string"
  );
}
