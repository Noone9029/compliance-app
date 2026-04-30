import { createHash, createHmac } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { loadEnv, type DaftarEnv } from "@daftar/config";

const defaultSignedUrlExpirySeconds = 15 * 60;
const maxSignedUrlExpirySeconds = 60 * 60;
const emptyPayloadHash = createHash("sha256").update("").digest("hex");

export type StorageReadinessResult = {
  status: "ok" | "error";
  bucket: string;
  endpoint: string;
  provider: "s3-compatible";
  message?: string;
};

export type SignedStorageUrl = {
  method: "GET" | "PUT";
  url: string;
  expiresAt: string;
  expiresInSeconds: number;
};

type StorageFetch = typeof fetch;

type StorageRequestInput = {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  objectKey?: string;
  body?: Buffer | Uint8Array | string;
  contentType?: string;
};

export class StorageObjectNotFoundError extends Error {
  constructor() {
    super("Stored object was not found.");
  }
}

function sha256Hex(value: string | Buffer | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function formatAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function formatDateStamp(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (entry) =>
    `%${entry.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeObjectKey(objectKey: string) {
  return objectKey
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

function normalizeObjectKey(objectKey: string) {
  const normalized = objectKey.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("objectKey must be a non-empty relative storage key.");
  }
  return normalized;
}

function normalizeExpirySeconds(expiresInSeconds?: number) {
  const value = expiresInSeconds ?? defaultSignedUrlExpirySeconds;
  if (!Number.isInteger(value) || value <= 0 || value > maxSignedUrlExpirySeconds) {
    throw new Error(
      `Signed URL expiry must be between 1 and ${maxSignedUrlExpirySeconds} seconds.`,
    );
  }
  return value;
}

@Injectable()
export class StorageService {
  private readonly env: DaftarEnv;
  private readonly fetchImpl: StorageFetch;

  constructor(env: DaftarEnv = loadEnv(), fetchImpl: StorageFetch = fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
  }

  get bucketName() {
    return this.env.S3_BUCKET;
  }

  async putObject(input: {
    objectKey: string;
    body: Buffer | Uint8Array | string;
    contentType?: string;
  }) {
    const response = await this.sendStorageRequest({
      method: "PUT",
      objectKey: input.objectKey,
      body: input.body,
      contentType: input.contentType,
    });
    if (!response.ok) {
      throw new Error(`S3-compatible putObject failed with status ${response.status}.`);
    }
  }

  async getObject(objectKey: string) {
    const response = await this.sendStorageRequest({
      method: "GET",
      objectKey,
    });

    if (response.status === 404) {
      throw new StorageObjectNotFoundError();
    }

    if (!response.ok) {
      throw new Error(`S3-compatible getObject failed with status ${response.status}.`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async deleteObject(input: { objectKey: string; allowDelete: true }) {
    if (input.allowDelete !== true) {
      throw new Error("deleteObject requires explicit allowDelete: true.");
    }

    const response = await this.sendStorageRequest({
      method: "DELETE",
      objectKey: input.objectKey,
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`S3-compatible deleteObject failed with status ${response.status}.`);
    }
  }

  createSignedUploadUrl(input: {
    objectKey: string;
    expiresInSeconds?: number;
  }): SignedStorageUrl {
    return this.createSignedUrl({
      method: "PUT",
      objectKey: input.objectKey,
      expiresInSeconds: input.expiresInSeconds,
    });
  }

  createSignedDownloadUrl(input: {
    objectKey: string;
    expiresInSeconds?: number;
  }): SignedStorageUrl {
    return this.createSignedUrl({
      method: "GET",
      objectKey: input.objectKey,
      expiresInSeconds: input.expiresInSeconds,
    });
  }

  async checkReadiness(): Promise<StorageReadinessResult> {
    try {
      const response = await this.sendStorageRequest({
        method: "HEAD",
      });

      if (!response.ok) {
        return {
          status: "error",
          bucket: this.env.S3_BUCKET,
          endpoint: this.endpointOrigin(),
          provider: "s3-compatible",
          message: `Bucket readiness check failed with status ${response.status}.`,
        };
      }

      return {
        status: "ok",
        bucket: this.env.S3_BUCKET,
        endpoint: this.endpointOrigin(),
        provider: "s3-compatible",
      };
    } catch (error) {
      return {
        status: "error",
        bucket: this.env.S3_BUCKET,
        endpoint: this.endpointOrigin(),
        provider: "s3-compatible",
        message: error instanceof Error ? error.message : "Unknown storage readiness failure.",
      };
    }
  }

  private async sendStorageRequest(input: StorageRequestInput) {
    const body = input.body;
    const payloadHash =
      body === undefined ? emptyPayloadHash : sha256Hex(Buffer.from(body));
    const url = this.objectUrl(input.objectKey);
    const now = new Date();
    const signedHeaders = this.signedRequestHeaders({
      method: input.method,
      url,
      now,
      payloadHash,
      contentType: input.contentType,
    });

    const requestBody =
      body === undefined || input.method === "HEAD"
        ? undefined
        : (body as BodyInit);

    return this.fetchImpl(url.toString(), {
      method: input.method,
      headers: signedHeaders,
      body: requestBody,
    });
  }

  private createSignedUrl(input: {
    method: "GET" | "PUT";
    objectKey: string;
    expiresInSeconds?: number;
  }): SignedStorageUrl {
    const expiresInSeconds = normalizeExpirySeconds(input.expiresInSeconds);
    const now = new Date();
    const url = this.objectUrl(input.objectKey);
    const host = url.host;
    const amzDate = formatAmzDate(now);
    const dateStamp = formatDateStamp(now);
    const credentialScope = this.credentialScope(dateStamp);

    url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    url.searchParams.set(
      "X-Amz-Credential",
      `${this.env.S3_ACCESS_KEY}/${credentialScope}`,
    );
    url.searchParams.set("X-Amz-Date", amzDate);
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
    url.searchParams.set("X-Amz-SignedHeaders", "host");

    const canonicalRequest = [
      input.method,
      url.pathname,
      this.canonicalQueryString(url.searchParams),
      `host:${host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = this.stringToSign({
      amzDate,
      credentialScope,
      canonicalRequest,
    });
    const signature = hmacHex(this.signingKey(dateStamp), stringToSign);
    url.searchParams.set("X-Amz-Signature", signature);

    return {
      method: input.method,
      url: url.toString(),
      expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
      expiresInSeconds,
    };
  }

  private signedRequestHeaders(input: {
    method: string;
    url: URL;
    now: Date;
    payloadHash: string;
    contentType?: string;
  }) {
    const amzDate = formatAmzDate(input.now);
    const dateStamp = formatDateStamp(input.now);
    const headers: Record<string, string> = {
      host: input.url.host,
      "x-amz-content-sha256": input.payloadHash,
      "x-amz-date": amzDate,
    };
    if (input.contentType) {
      headers["content-type"] = input.contentType;
    }

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((key) => `${key}:${headers[key]!.trim()}`)
      .join("\n");
    const signedHeaders = signedHeaderNames.join(";");
    const credentialScope = this.credentialScope(dateStamp);
    const canonicalRequest = [
      input.method,
      input.url.pathname,
      this.canonicalQueryString(input.url.searchParams),
      `${canonicalHeaders}\n`,
      signedHeaders,
      input.payloadHash,
    ].join("\n");
    const stringToSign = this.stringToSign({
      amzDate,
      credentialScope,
      canonicalRequest,
    });
    const signature = hmacHex(this.signingKey(dateStamp), stringToSign);

    return {
      ...headers,
      authorization: [
        `AWS4-HMAC-SHA256 Credential=${this.env.S3_ACCESS_KEY}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
      ].join(", "),
    };
  }

  private objectUrl(objectKey?: string) {
    const endpoint = this.env.S3_ENDPOINT.endsWith("/")
      ? this.env.S3_ENDPOINT
      : `${this.env.S3_ENDPOINT}/`;
    const encodedBucket = encodeRfc3986(this.env.S3_BUCKET);
    const keyPath = objectKey ? `/${encodeObjectKey(normalizeObjectKey(objectKey))}` : "";
    return new URL(`${encodedBucket}${keyPath}`, endpoint);
  }

  private endpointOrigin() {
    return new URL(this.env.S3_ENDPOINT).origin;
  }

  private canonicalQueryString(searchParams: URLSearchParams) {
    return [...searchParams.entries()]
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey === rightKey
          ? leftValue.localeCompare(rightValue)
          : leftKey.localeCompare(rightKey),
      )
      .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
      .join("&");
  }

  private credentialScope(dateStamp: string) {
    return `${dateStamp}/${this.env.S3_REGION}/s3/aws4_request`;
  }

  private signingKey(dateStamp: string) {
    const dateKey = hmac(`AWS4${this.env.S3_SECRET_KEY}`, dateStamp);
    const regionKey = hmac(dateKey, this.env.S3_REGION);
    const serviceKey = hmac(regionKey, "s3");
    return hmac(serviceKey, "aws4_request");
  }

  private stringToSign(input: {
    amzDate: string;
    credentialScope: string;
    canonicalRequest: string;
  }) {
    return [
      "AWS4-HMAC-SHA256",
      input.amzDate,
      input.credentialScope,
      sha256Hex(input.canonicalRequest),
    ].join("\n");
  }
}
