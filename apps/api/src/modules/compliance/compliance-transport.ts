import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type {
  ComplianceFailureCategory,
  ComplianceSubmissionFlow,
  SubmissionStatus,
} from "@daftar/types";

import { loadEnv, type DaftarEnv } from "@daftar/config";
import {
  redactSensitiveText,
  sanitizeSensitiveObject,
} from "./secret-redaction";

export type ComplianceTransportCredentials = {
  clientId: string;
  clientSecret: string;
  certificatePem?: string | null;
  certificateSecret?: string | null;
};

export type ComplianceTransportRequest = {
  flow: ComplianceSubmissionFlow;
  invoiceId: string;
  invoiceNumber: string;
  uuid: string;
  attemptNumber: number;
  invoiceHash: string;
  xmlContent: string;
  onboarding: {
    environment: string;
    csid: string | null;
    certificateId: string | null;
  } | null;
  credentials: ComplianceTransportCredentials | null;
};

export type ComplianceTransportResponse = {
  status: Extract<SubmissionStatus, "ACCEPTED" | "ACCEPTED_WITH_WARNINGS">;
  responseCode: string;
  responseMessage: string;
  requestId: string | null;
  warnings: string[];
  errors: string[];
  stampedXmlContent: string | null;
  responsePayload: Record<string, unknown>;
  externalSubmissionId: string | null;
};

export class ComplianceTransportError extends Error {
  readonly category: ComplianceFailureCategory;
  readonly retryable: boolean;
  readonly responsePayload: Record<string, unknown> | null;
  readonly statusCode: number | null;
  readonly externalSubmissionId: string | null;

  constructor(input: {
    message: string;
    category: ComplianceFailureCategory;
    retryable: boolean;
    responsePayload?: Record<string, unknown> | null;
    statusCode?: number | null;
    externalSubmissionId?: string | null;
  }) {
    super(redactSensitiveText(input.message));
    this.category = input.category;
    this.retryable = input.retryable;
    this.responsePayload = sanitizeSensitiveObject(input.responsePayload ?? null);
    this.statusCode = input.statusCode ?? null;
    this.externalSubmissionId = input.externalSubmissionId ?? null;
  }
}

export interface ComplianceTransportClient {
  endpointFor(
    flow: ComplianceSubmissionFlow,
    environment?: string | null,
  ): string;
  submit(request: ComplianceTransportRequest): Promise<ComplianceTransportResponse>;
}

export function isConfiguredComplianceCredentials(
  credentials?: ComplianceTransportCredentials | null,
) {
  if (!credentials) {
    return false;
  }

  return Boolean(credentials.clientId && credentials.clientSecret);
}

export function fingerprintSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

class TestComplianceTransportClient implements ComplianceTransportClient {
  endpointFor(flow: ComplianceSubmissionFlow) {
    return flow === "CLEARANCE"
      ? "test://zatca/clearance"
      : "test://zatca/reporting";
  }

  async submit(request: ComplianceTransportRequest): Promise<ComplianceTransportResponse> {
    if (
      request.invoiceNumber.includes("FAIL-CONNECT-ONCE") &&
      request.attemptNumber === 1
    ) {
      throw new ComplianceTransportError({
        message: "Sandbox transport is temporarily unavailable.",
        category: "CONNECTIVITY",
        retryable: true,
      });
    }

    if (
      request.invoiceNumber.includes("FAIL-CONNECT") &&
      !request.invoiceNumber.includes("FAIL-CONNECT-ONCE")
    ) {
      throw new ComplianceTransportError({
        message: "Sandbox transport is unavailable.",
        category: "CONNECTIVITY",
        retryable: true,
      });
    }

    if (request.invoiceNumber.includes("FAIL-REJECT")) {
      throw new ComplianceTransportError({
        message: "Invoice payload was rejected by ZATCA validation.",
        category: "ZATCA_REJECTION",
        retryable: false,
        responsePayload: {
          errors: ["Invoice payload rejected by deterministic test transport."],
        },
        statusCode: 400,
      });
    }

    const acceptedWithWarnings = request.invoiceNumber.includes("WARN");
    return {
      status: acceptedWithWarnings ? "ACCEPTED_WITH_WARNINGS" : "ACCEPTED",
      responseCode: request.flow === "CLEARANCE" ? "CLEARED" : "REPORTED",
      responseMessage:
        request.flow === "CLEARANCE"
          ? acceptedWithWarnings
            ? "Invoice cleared with warnings in sandbox."
            : "Invoice cleared in sandbox."
          : acceptedWithWarnings
            ? "Invoice reported with warnings in sandbox."
            : "Invoice reported in sandbox.",
      requestId: `${request.flow.toLowerCase()}-${request.uuid.slice(0, 8)}`,
      warnings: acceptedWithWarnings ? ["Sandbox deterministic warning"] : [],
      errors: [],
      stampedXmlContent: null,
      responsePayload: {
        invoiceHash: request.invoiceHash,
        flow: request.flow,
      },
      externalSubmissionId: `${request.flow.toLowerCase()}-${request.uuid.slice(0, 8)}`,
    };
  }
}

class LiveComplianceTransportClient implements ComplianceTransportClient {
  private static readonly requestTimeoutMs = 30_000;

  constructor(private readonly env: DaftarEnv) {}

  endpointFor(flow: ComplianceSubmissionFlow, environment?: string | null) {
    const base = this.resolveEnvironmentBase(environment);
    return flow === "CLEARANCE"
      ? `${base}/invoices/clearance/single`
      : `${base}/invoices/reporting/single`;
  }

  async submit(request: ComplianceTransportRequest): Promise<ComplianceTransportResponse> {
    const credentials = request.credentials;
    if (!credentials || !isConfiguredComplianceCredentials(credentials)) {
      throw new ComplianceTransportError({
        message: "Compliance transport credentials are not available for this onboarding.",
        category: "CONFIGURATION",
        retryable: false,
      });
    }

    const endpoint = this.endpointFor(request.flow, request.onboarding?.environment ?? null);
    const requestHeaders = {
      authorization: `Basic ${Buffer.from(
        `${credentials.clientId}:${credentials.clientSecret}`,
      ).toString("base64")}`,
      "content-type": "application/json",
      accept: "application/json",
      "accept-language": "en",
      "accept-version": "v2",
    } as const;
    const requestBody = {
      invoiceHash: request.invoiceHash,
      uuid: request.uuid,
      invoice: Buffer.from(request.xmlContent, "utf8").toString("base64"),
    };
    const firstLeg = await this.fetchJson(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
      redirect: "manual",
    });
    const firstPayload = firstLeg.payload ?? {};

    let finalResponse = firstLeg.response;
    let payload = firstPayload;
    if (firstLeg.response.status === 303) {
      const location = firstLeg.response.headers.get("location");
      if (!location) {
        throw new ComplianceTransportError({
          message: "ZATCA returned redirect without a location header.",
          category: "CONNECTIVITY",
          retryable: true,
          responsePayload: firstPayload,
          statusCode: firstLeg.response.status,
          externalSubmissionId: this.extractRequestId(firstPayload),
        });
      }

      const redirectUrl = new URL(location, endpoint).toString();
      const secondLeg = await this.fetchJson(redirectUrl, {
        method: "GET",
        headers: {
          authorization: requestHeaders.authorization,
          accept: requestHeaders.accept,
          "accept-language": requestHeaders["accept-language"],
          "accept-version": requestHeaders["accept-version"],
        },
      });
      finalResponse = secondLeg.response;
      payload = {
        ...firstPayload,
        ...(secondLeg.payload ?? {}),
      };
    }

    if (!finalResponse.ok) {
      const category = this.classifyFailureCategory(finalResponse.status);
      const retryAfter = finalResponse.headers.get("retry-after");
      throw new ComplianceTransportError({
        message:
          this.pickString(payload, ["message", "error", "errorMessage"]) ??
          `ZATCA request failed with status ${finalResponse.status}.`,
        category,
        retryable: category === "CONNECTIVITY",
        responsePayload: retryAfter
          ? {
              ...(payload ?? {}),
              retryAfter,
            }
          : payload,
        statusCode: finalResponse.status,
        externalSubmissionId: this.extractRequestId(payload),
      });
    }

    const warnings = this.extractMessages(payload, "warnings");
    const errors = this.extractMessages(payload, "errors");
    const statusCodeText = this.resolveStatusCode(payload, request.flow);
    const normalizedStatus = statusCodeText.toUpperCase();
    const warned =
      warnings.length > 0 ||
      normalizedStatus.includes("WARNING") ||
      normalizedStatus.includes("WARN");
    const rejectedByPayload =
      errors.length > 0 ||
      normalizedStatus.includes("REJECT") ||
      normalizedStatus.includes("FAIL") ||
      normalizedStatus.includes("ERROR");

    if (rejectedByPayload) {
      throw new ComplianceTransportError({
        message:
          errors[0] ??
          this.pickString(payload, ["message", "error"]) ??
          "Invoice rejected by ZATCA payload validation.",
        category: "ZATCA_REJECTION",
        retryable: false,
        responsePayload: payload,
        statusCode: finalResponse.status,
        externalSubmissionId: this.extractRequestId(payload),
      });
    }

    return {
      status: warned ? "ACCEPTED_WITH_WARNINGS" : "ACCEPTED",
      responseCode: statusCodeText,
      responseMessage: redactSensitiveText(
        this.pickString(payload, ["message", "dispositionMessage"]) ??
          (request.flow === "CLEARANCE"
            ? warned
              ? "Invoice cleared with warnings by ZATCA."
              : "Invoice cleared by ZATCA."
            : warned
              ? "Invoice reported with warnings to ZATCA."
              : "Invoice reported to ZATCA."),
      ),
      requestId: this.extractRequestId(payload),
      warnings,
      errors,
      stampedXmlContent: this.extractStampedXml(payload),
      responsePayload: sanitizeSensitiveObject(payload) ?? {},
      externalSubmissionId: this.extractRequestId(payload),
    };
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
  ): Promise<{ response: Response; payload: Record<string, unknown> | null }> {
    const timeoutSignal =
      typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(LiveComplianceTransportClient.requestTimeoutMs)
        : undefined;
    const requestInit = timeoutSignal
      ? {
          ...init,
          signal: timeoutSignal,
        }
      : init;
    let response: Response;

    try {
      response = await fetch(url, requestInit);
    } catch (error) {
      if (error instanceof ComplianceTransportError) {
        throw error;
      }

      const isTimeout =
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Network request to ZATCA failed.";
      throw new ComplianceTransportError({
        message: isTimeout
          ? "ZATCA request timed out."
          : `Unable to reach ZATCA transport: ${message}`,
        category: "CONNECTIVITY",
        retryable: true,
      });
    }

    let payload: Record<string, unknown> | null = null;

    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    return { response, payload };
  }

  private classifyFailureCategory(status: number): ComplianceFailureCategory {
    if (status === 408 || status === 429) {
      return "CONNECTIVITY";
    }
    if (status >= 500) {
      return "CONNECTIVITY";
    }
    if (status === 401 || status === 403) {
      return "AUTHENTICATION";
    }
    if (status === 400 || status === 404 || status === 409 || status === 422) {
      return "ZATCA_REJECTION";
    }
    return "UNKNOWN";
  }

  private pickString(
    payload: Record<string, unknown> | null,
    keys: readonly string[],
  ) {
    if (!payload) {
      return null;
    }

    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return redactSensitiveText(value.trim());
      }
    }

    return null;
  }

  private extractMessages(
    payload: Record<string, unknown> | null,
    key: "warnings" | "errors",
  ) {
    const value = payload?.[key];
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return redactSensitiveText(entry.trim());
        }
        if (entry && typeof entry === "object") {
          const message = (entry as { message?: unknown }).message;
          return typeof message === "string"
            ? redactSensitiveText(message.trim())
            : "";
        }
        return "";
      })
      .filter((entry): entry is string => entry.length > 0);
  }

  private resolveStatusCode(
    payload: Record<string, unknown> | null,
    flow: ComplianceSubmissionFlow,
  ) {
    const preferred =
      this.pickString(payload, ["clearanceStatus", "reportingStatus", "status"]) ??
      (flow === "CLEARANCE" ? "CLEARED" : "REPORTED");
    return preferred;
  }

  private extractRequestId(payload: Record<string, unknown> | null) {
    return (
      this.pickString(payload, ["requestId", "requestID", "clearanceRequestId"]) ??
      null
    );
  }

  private extractStampedXml(payload: Record<string, unknown> | null) {
    const candidates = [
      payload?.clearedInvoice,
      payload?.clearedInvoiceBase64,
      payload?.invoice,
      payload?.invoiceBase64,
      payload?.clearedInvoiceXml,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== "string" || candidate.trim().length === 0) {
        continue;
      }

      const trimmed = candidate.trim();
      if (trimmed.startsWith("<")) {
        return trimmed;
      }

      try {
        const decoded = Buffer.from(trimmed, "base64").toString("utf8");
        if (decoded.trim().startsWith("<")) {
          return decoded;
        }
      } catch {
        // ignore decode failures and keep searching
      }
    }

    return null;
  }

  private resolveEnvironmentBase(environment?: string | null) {
    const target = this.environmentSegment(environment);
    const normalized = this.env.ZATCA_BASE_URL
      .replace(/\/+$/, "")
      .replace("gw-apic-gov.gazt.gov.sa", "gw-fatoora.zatca.gov.sa");
    const root = normalized.replace(/\/e-invoicing\/(core|simulation)(\/.*)?$/i, "");
    return `${root}/e-invoicing/${target}`;
  }

  private environmentSegment(environment?: string | null) {
    if (typeof environment !== "string") {
      return "core";
    }

    const lowered = environment.toLowerCase();
    if (lowered.includes("sandbox") || lowered.includes("simulation")) {
      return "simulation";
    }

    return "core";
  }
}

export function createComplianceTransportClient(input?: {
  env?: DaftarEnv;
}): ComplianceTransportClient {
  const env = input?.env ?? loadEnv();
  const liveE2eEnabled = process.env.LIVE_ZATCA_E2E === "1";
  if (env.NODE_ENV === "test" && !liveE2eEnabled) {
    return new TestComplianceTransportClient();
  }

  return new LiveComplianceTransportClient(env);
}
