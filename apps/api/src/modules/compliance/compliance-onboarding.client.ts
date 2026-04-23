import { Buffer } from "node:buffer";
import { createHash, webcrypto } from "node:crypto";
import { Injectable } from "@nestjs/common";
import * as x509 from "@peculiar/x509";

import { loadEnv, type DaftarEnv } from "@daftar/config";
import {
  redactSensitiveText,
  sanitizeSensitiveObject,
} from "./secret-redaction";

export type ComplianceCertificateMaterial = {
  requestId: string | null;
  csid: string;
  certificateId: string | null;
  certificatePem: string | null;
  certificateBase64: string | null;
  secret: string;
  dispositionMessage: string | null;
  tokenType: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  rawPayload: Record<string, unknown>;
};

export type ComplianceCheckResult = {
  passed: boolean;
  warnings: string[];
  errors: string[];
  requestId: string | null;
  rawPayload: Record<string, unknown>;
};

export class ComplianceOnboardingClientError extends Error {
  readonly statusCode: number | null;
  readonly payload: Record<string, unknown> | null;

  constructor(input: {
    message: string;
    statusCode?: number | null;
    payload?: Record<string, unknown> | null;
  }) {
    super(redactSensitiveText(input.message));
    this.statusCode = input.statusCode ?? null;
    this.payload = sanitizeSensitiveObject(input.payload ?? null);
  }
}

type ParsedJsonPayload = Record<string, unknown> | null;

@Injectable()
export class ComplianceOnboardingClient {
  private readonly env: DaftarEnv;
  private readonly liveE2eEnabled: boolean;
  private mockCertificateMaterialPromise:
    | Promise<{ certificatePem: string; certificateBase64: string }>
    | null = null;

  constructor() {
    this.env = loadEnv();
    this.liveE2eEnabled = process.env.LIVE_ZATCA_E2E === "1";
  }

  async submitComplianceCsid(input: {
    csr: string;
    otpCode: string;
    environment: string;
  }): Promise<ComplianceCertificateMaterial> {
    if (this.shouldUseMockResponses()) {
      return this.mockCertificateMaterial(
        "compliance",
        input.csr,
        input.otpCode,
      );
    }

    const response = await fetch(this.endpoint("/compliance", input.environment), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "en",
        "accept-version": "V2",
        OTP: input.otpCode,
      },
      body: JSON.stringify({
        csr: this.normalizeCsrForRequest(input.csr),
      }),
    });

    const payload = await this.readJsonPayload(response);
    this.throwIfNotOk(response, payload, "Compliance CSID request failed.");
    return this.parseCertificateMaterial(
      payload,
      "Compliance CSID response is missing certificate material.",
    );
  }

  async activateProductionCsid(input: {
    csr: string;
    complianceRequestId: string;
    environment: string;
    complianceCredentials: {
      csid: string;
      secret: string;
    };
  }): Promise<ComplianceCertificateMaterial> {
    if (this.shouldUseMockResponses()) {
      return this.mockCertificateMaterial(
        "production",
        input.csr,
        input.complianceRequestId,
      );
    }

    const response = await fetch(
      this.endpoint("/production/csids", input.environment),
      {
        method: "POST",
        headers: {
          authorization: this.basicAuthHeader(
          input.complianceCredentials.csid,
          input.complianceCredentials.secret,
        ),
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "en",
        "accept-version": "V2",
        currentCCSID: input.complianceCredentials.csid,
      },
        body: JSON.stringify({
          csr: this.normalizeCsrForRequest(input.csr),
          compliance_request_id: input.complianceRequestId,
        }),
      },
    );

    const payload = await this.readJsonPayload(response);
    this.throwIfNotOk(response, payload, "Production CSID activation request failed.");
    return this.parseCertificateMaterial(
      payload,
      "Production CSID activation response is missing certificate material.",
    );
  }

  async renewProductionCsid(input: {
    csr: string;
    otpCode: string;
    environment: string;
    currentCredentials: {
      csid: string;
      secret: string;
    };
  }): Promise<ComplianceCertificateMaterial> {
    if (this.shouldUseMockResponses()) {
      return this.mockCertificateMaterial("renewed", input.csr, input.otpCode);
    }

    const response = await fetch(
      this.endpoint("/production/csids", input.environment),
      {
        method: "PATCH",
        headers: {
          authorization: this.basicAuthHeader(
          input.currentCredentials.csid,
          input.currentCredentials.secret,
        ),
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "en",
        "accept-version": "V2",
        OTP: input.otpCode,
        currentCSID: input.currentCredentials.csid,
      },
        body: JSON.stringify({
          csr: this.normalizeCsrForRequest(input.csr),
        }),
      },
    );

    const payload = await this.readJsonPayload(response);
    this.throwIfNotOk(response, payload, "Production CSID renewal request failed.");
    return this.parseCertificateMaterial(
      payload,
      "Production CSID renewal response is missing certificate material.",
    );
  }

  async runComplianceCheck(input: {
    environment: string;
    credentials: {
      csid: string;
      secret: string;
    };
    invoiceHash: string;
    uuid: string;
    xmlContent: string;
  }): Promise<ComplianceCheckResult> {
    if (this.shouldUseMockResponses()) {
      return {
        passed: true,
        warnings: [],
        errors: [],
        requestId: `mock-check-${Date.now()}`,
        rawPayload: {
          stage: "compliance-check",
          mock: true,
        },
      };
    }

    const response = await fetch(
      this.endpoint("/compliance/invoices", input.environment),
      {
        method: "POST",
        headers: {
          authorization: this.basicAuthHeader(
            input.credentials.csid,
            input.credentials.secret,
          ),
          "content-type": "application/json",
          accept: "application/json",
          "accept-language": "en",
          "accept-version": "v2",
        },
        body: JSON.stringify({
          invoiceHash: input.invoiceHash,
          uuid: input.uuid,
          invoice: Buffer.from(input.xmlContent, "utf8").toString("base64"),
        }),
      },
    );

    const payload = await this.readJsonPayload(response);
    this.throwIfNotOk(response, payload, "Compliance check request failed.");

    const warnings = this.extractMessages(payload, "warnings");
    const errors = this.extractMessages(payload, "errors");
    const statusText =
      this.asText(payload?.clearanceStatus) ??
      this.asText(payload?.reportingStatus) ??
      this.asText(payload?.status) ??
      "PASSED";
    const normalizedStatus = statusText.toUpperCase();
    const passed =
      !normalizedStatus.includes("REJECT") &&
      !normalizedStatus.includes("FAIL") &&
      !normalizedStatus.includes("ERROR") &&
      errors.length === 0;

    return {
      passed,
      warnings,
      errors,
      requestId:
        this.asText(payload?.requestId) ??
        this.asText(payload?.requestID) ??
        null,
      rawPayload: payload ?? {},
    };
  }

  async revokeProductionCsid(input: {
    environment: string;
    currentCredentials: {
      csid: string;
      secret: string;
    };
    reason?: string;
  }): Promise<Record<string, unknown>> {
    if (this.shouldUseMockResponses()) {
      return {
        dispositionMessage: "REVOKED",
        reason: input.reason ?? null,
      };
    }

    const response = await fetch(
      this.endpoint("/production/csids", input.environment),
      {
        method: "DELETE",
        headers: {
          authorization: this.basicAuthHeader(
          input.currentCredentials.csid,
          input.currentCredentials.secret,
        ),
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "en",
        "accept-version": "V2",
        currentCSID: input.currentCredentials.csid,
      },
        body: JSON.stringify({
          reason: input.reason ?? null,
        }),
      },
    );

    const payload = await this.readJsonPayload(response);
    this.throwIfNotOk(response, payload, "Production CSID revocation request failed.");
    return payload ?? {};
  }

  private endpoint(path: string, environment: string) {
    const base = this.resolveEnvironmentBase(environment);
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
  }

  private shouldUseMockResponses() {
    const isVitestRuntime = process.env.VITEST === "true";
    const isTestRuntime =
      this.env.NODE_ENV === "test"
      || (isVitestRuntime && this.env.NODE_ENV !== "production");
    return isTestRuntime && !this.liveE2eEnabled;
  }

  private resolveEnvironmentBase(environment: string) {
    const target = this.environmentSegment(environment);
    const normalized = this.env.ZATCA_BASE_URL
      .replace(/\/+$/, "")
      .replace("gw-apic-gov.gazt.gov.sa", "gw-fatoora.zatca.gov.sa");
    const root = normalized.replace(/\/e-invoicing\/(core|simulation)(\/.*)?$/i, "");
    return `${root}/e-invoicing/${target}`;
  }

  private environmentSegment(environment: string) {
    const lowered = environment.toLowerCase();
    if (lowered.includes("sandbox") || lowered.includes("simulation")) {
      return "simulation";
    }
    return "core";
  }

  private basicAuthHeader(user: string, password: string) {
    return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
  }

  private normalizeCsrForRequest(csr: string) {
    const trimmed = csr.trim();
    if (!trimmed.includes("BEGIN CERTIFICATE REQUEST")) {
      return trimmed;
    }

    return trimmed
      .replace(/-----BEGIN CERTIFICATE REQUEST-----/g, "")
      .replace(/-----END CERTIFICATE REQUEST-----/g, "")
      .replace(/\s+/g, "");
  }

  private async readJsonPayload(response: Response): Promise<ParsedJsonPayload> {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private throwIfNotOk(
    response: Response,
    payload: ParsedJsonPayload,
    defaultMessage: string,
  ) {
    if (response.ok) {
      return;
    }

    const extracted = this.unwrapPayload(payload);
    const payloadMessage =
      this.asText(extracted?.message) ??
      this.errorListMessage(extracted?.errors) ??
      this.asText(payload?.message) ??
      defaultMessage;

    throw new ComplianceOnboardingClientError({
      message: payloadMessage,
      statusCode: response.status,
      payload: payload ?? null,
    });
  }

  private parseCertificateMaterial(
    payload: ParsedJsonPayload,
    missingMessage: string,
  ): ComplianceCertificateMaterial {
    const extracted = this.unwrapPayload(payload);
    const token =
      this.asText(extracted?.binarySecurityToken) ??
      this.asText(extracted?.binarysecuritytoken) ??
      this.asText(extracted?.certificate) ??
      this.asText(extracted?.csid);
    const secret =
      this.asText(extracted?.secret) ??
      this.asText(extracted?.certificateSecret) ??
      this.asText(extracted?.password);

    if (!token || !secret) {
      throw new ComplianceOnboardingClientError({
        message: missingMessage,
        statusCode: null,
        payload: payload ?? null,
      });
    }

    const certificateBase64 = this.normalizeCertificateBase64(token);
    const certificatePem = certificateBase64
      ? this.base64CertificateToPem(certificateBase64)
      : token.includes("BEGIN CERTIFICATE")
        ? token.trim()
        : null;

    return {
      requestId:
        this.asText(extracted?.requestID) ??
        this.asText(extracted?.requestId) ??
        this.asText(extracted?.request_id) ??
        null,
      csid: token,
      certificateId:
        this.asText(extracted?.certificateId) ??
        this.asText(extracted?.certificateID) ??
        this.asText(extracted?.csidId) ??
        null,
      certificatePem,
      certificateBase64,
      secret,
      dispositionMessage: this.asText(extracted?.dispositionMessage) ?? null,
      tokenType: this.asText(extracted?.tokenType) ?? null,
      issuedAt:
        this.asDate(extracted?.certificateIssuedAt) ??
        this.asDate(extracted?.issuedAt) ??
        null,
      expiresAt:
        this.asDate(extracted?.certificateExpiresAt) ??
        this.asDate(extracted?.expiresAt) ??
        this.asDate(extracted?.expiryDate) ??
        null,
      rawPayload: payload ?? {},
    };
  }

  private unwrapPayload(payload: ParsedJsonPayload) {
    if (!payload) {
      return null;
    }

    if (
      payload.value &&
      typeof payload.value === "object" &&
      !Array.isArray(payload.value)
    ) {
      return payload.value as Record<string, unknown>;
    }

    return payload;
  }

  private normalizeCertificateBase64(token: string) {
    if (!token.includes("BEGIN CERTIFICATE")) {
      return token.replace(/\s+/g, "");
    }

    const stripped = token
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s+/g, "");
    return stripped.length > 0 ? stripped : null;
  }

  private base64CertificateToPem(base64: string) {
    const chunks = base64.match(/.{1,64}/g) ?? [];
    if (chunks.length === 0) {
      return null;
    }

    return [
      "-----BEGIN CERTIFICATE-----",
      ...chunks,
      "-----END CERTIFICATE-----",
    ].join("\n");
  }

  private asText(value: unknown) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    return null;
  }

  private asDate(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private errorListMessage(value: unknown) {
    if (!Array.isArray(value) || value.length === 0) {
      return null;
    }

    const first = value[0];
    if (!first || typeof first !== "object") {
      return null;
    }

    return this.asText((first as { message?: unknown }).message);
  }

  private extractMessages(payload: ParsedJsonPayload, key: "warnings" | "errors") {
    const value = payload?.[key];
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry.trim();
        }
        if (entry && typeof entry === "object") {
          return this.asText((entry as { message?: unknown }).message) ?? "";
        }
        return "";
      })
      .filter((entry): entry is string => entry.length > 0);
  }

  private async mockCertificateMaterial(
    stage: "compliance" | "production" | "renewed",
    csr: string,
    nonce: string,
  ): Promise<ComplianceCertificateMaterial> {
    const digest = createHash("sha256").update(`${stage}:${csr}:${nonce}`).digest("hex");
    const certificate = await this.getMockCertificateMaterial();

    return {
      requestId: `${Date.now()}${digest.slice(0, 4)}`,
      csid: `${stage}-csid-${digest.slice(0, 24)}`,
      certificateId: `${stage}-certificate-${digest.slice(0, 16)}`,
      certificatePem: certificate.certificatePem,
      certificateBase64: certificate.certificateBase64,
      secret: `${stage}-secret-${digest.slice(0, 24)}`,
      dispositionMessage: "ISSUED",
      tokenType:
        "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3",
      issuedAt: new Date(),
      expiresAt: null,
      rawPayload: {
        stage,
        mock: true,
      },
    };
  }

  private async getMockCertificateMaterial() {
    if (!this.mockCertificateMaterialPromise) {
      this.mockCertificateMaterialPromise = this.generateMockCertificateMaterial();
    }

    return this.mockCertificateMaterialPromise;
  }

  private async generateMockCertificateMaterial() {
    const keys = (await webcrypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const certificate = await x509.X509CertificateGenerator.createSelfSigned(
      {
        name: "CN=Daftar Sandbox Mock,O=Daftar,C=SA",
        keys,
        signingAlgorithm: {
          name: "ECDSA",
          hash: "SHA-256",
        },
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      webcrypto as Crypto,
    );

    return {
      certificatePem: certificate.toString("pem").trim(),
      certificateBase64: Buffer.from(certificate.rawData).toString("base64"),
    };
  }
}
