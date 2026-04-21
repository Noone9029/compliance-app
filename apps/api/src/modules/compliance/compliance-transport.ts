import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type {
  ComplianceFailureCategory,
  ComplianceSubmissionFlow,
  SubmissionStatus,
} from "@daftar/types";

import { loadEnv, type DaftarEnv } from "@daftar/config";

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
    super(input.message);
    this.category = input.category;
    this.retryable = input.retryable;
    this.responsePayload = input.responsePayload ?? null;
    this.statusCode = input.statusCode ?? null;
    this.externalSubmissionId = input.externalSubmissionId ?? null;
  }
}

export interface ComplianceTransportClient {
  endpointFor(flow: ComplianceSubmissionFlow): string;
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

export function fallbackComplianceTransportCredentialsFromEnv(
  env = loadEnv(),
): ComplianceTransportCredentials | null {
  if (
    env.ZATCA_CLIENT_ID === "placeholder" ||
    env.ZATCA_CLIENT_SECRET === "placeholder" ||
    env.ZATCA_BASE_URL.includes("sandbox.example")
  ) {
    return null;
  }

  return {
    clientId: env.ZATCA_CLIENT_ID,
    clientSecret: env.ZATCA_CLIENT_SECRET,
  };
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
      responsePayload: {
        invoiceHash: request.invoiceHash,
        flow: request.flow,
      },
      externalSubmissionId: `${request.flow.toLowerCase()}-${request.uuid.slice(0, 8)}`,
    };
  }
}

class LiveComplianceTransportClient implements ComplianceTransportClient {
  constructor(
    private readonly env: DaftarEnv,
    private readonly fallbackCredentials: ComplianceTransportCredentials | null,
  ) {}

  endpointFor(flow: ComplianceSubmissionFlow) {
    return flow === "CLEARANCE"
      ? `${this.env.ZATCA_BASE_URL}/invoices/clearance/single`
      : `${this.env.ZATCA_BASE_URL}/invoices/reporting/single`;
  }

  async submit(request: ComplianceTransportRequest): Promise<ComplianceTransportResponse> {
    const credentials = request.credentials ?? this.fallbackCredentials;
    if (!credentials || !isConfiguredComplianceCredentials(credentials)) {
      throw new ComplianceTransportError({
        message: "Compliance transport credentials are not available for this onboarding.",
        category: "CONFIGURATION",
        retryable: false,
      });
    }

    const response = await fetch(this.endpointFor(request.flow), {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(
          `${credentials.clientId}:${credentials.clientSecret}`,
        ).toString("base64")}`,
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "en",
      },
      body: JSON.stringify({
        invoiceHash: request.invoiceHash,
        uuid: request.uuid,
        invoice: Buffer.from(request.xmlContent, "utf8").toString("base64"),
      }),
    });

    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const category: ComplianceFailureCategory =
        response.status >= 500
          ? "CONNECTIVITY"
          : response.status === 401 || response.status === 403
            ? "AUTHENTICATION"
            : response.status === 400 || response.status === 422
              ? "ZATCA_REJECTION"
              : "UNKNOWN";

      throw new ComplianceTransportError({
        message:
          typeof payload?.message === "string"
            ? payload.message
            : `ZATCA request failed with status ${response.status}.`,
        category,
        retryable: response.status >= 500,
        responsePayload: payload,
        statusCode: response.status,
        externalSubmissionId:
          typeof payload?.requestId === "string" ? payload.requestId : null,
      });
    }

    const warningList = Array.isArray(payload?.warnings) ? payload.warnings : [];
    return {
      status: warningList.length > 0 ? "ACCEPTED_WITH_WARNINGS" : "ACCEPTED",
      responseCode:
        typeof payload?.clearanceStatus === "string"
          ? payload.clearanceStatus
          : typeof payload?.reportingStatus === "string"
            ? payload.reportingStatus
            : request.flow === "CLEARANCE"
              ? "CLEARED"
              : "REPORTED",
      responseMessage:
        typeof payload?.message === "string"
          ? payload.message
          : request.flow === "CLEARANCE"
            ? "Invoice cleared by ZATCA."
            : "Invoice reported to ZATCA.",
      responsePayload: payload ?? {},
      externalSubmissionId:
        typeof payload?.requestId === "string" ? payload.requestId : null,
    };
  }
}

export function createComplianceTransportClient(input?: {
  env?: DaftarEnv;
  fallbackCredentials?: ComplianceTransportCredentials | null;
}): ComplianceTransportClient {
  const env = input?.env ?? loadEnv();
  if (env.NODE_ENV === "test") {
    return new TestComplianceTransportClient();
  }

  return new LiveComplianceTransportClient(env, input?.fallbackCredentials ?? null);
}
