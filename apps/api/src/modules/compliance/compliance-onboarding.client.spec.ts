import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ComplianceOnboardingClient,
  ComplianceOnboardingClientError,
} from "./compliance-onboarding.client";

describe("compliance onboarding client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns deterministic local responses in test mode", async () => {
    vi.stubEnv("NODE_ENV", "test");

    const client = new ComplianceOnboardingClient();
    const compliance = await client.submitComplianceCsid({
      csr: "dummy-csr",
      otpCode: "123456",
      environment: "Sandbox",
    });
    const activated = await client.activateProductionCsid({
      csr: "dummy-csr",
      complianceRequestId: "1234567890",
      environment: "Sandbox",
      complianceCredentials: {
        csid: compliance.csid,
        secret: compliance.secret,
      },
    });

    expect(compliance.requestId).toBeTruthy();
    expect(compliance.secret).toContain("compliance-secret-");
    expect(activated.csid).toContain("production-csid-");
    expect(activated.certificatePem).toContain("BEGIN CERTIFICATE");
  });

  it("calls compliance CSID endpoint and parses certificate response in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZATCA_BASE_URL", "https://zatca.example");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestID: 1234567890,
        dispositionMessage: "ISSUED",
        binarySecurityToken: "Y2VydGlmaWNhdGU=",
        secret: "super-secret",
        certificateId: "cert-1",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ComplianceOnboardingClient();
    const result = await client.submitComplianceCsid({
      csr: "PEM_OR_BASE64_CSR",
      otpCode: "123456",
      environment: "Production",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://zatca.example/e-invoicing/core/compliance");
    expect(request.method).toBe("POST");
    expect(request.headers.OTP).toBe("123456");
    expect(result.requestId).toBe("1234567890");
    expect(result.csid).toBe("Y2VydGlmaWNhdGU=");
    expect(result.secret).toBe("super-secret");
    expect(result.certificatePem).toContain("BEGIN CERTIFICATE");
  });

  it("raises a typed error when onboarding API call fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZATCA_BASE_URL", "https://zatca.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          errors: [{ message: "Invalid OTP" }],
        }),
      }),
    );

    const client = new ComplianceOnboardingClient();

    await expect(
      client.submitComplianceCsid({
        csr: "csr",
        otpCode: "bad-otp",
        environment: "Sandbox",
      }),
    ).rejects.toBeInstanceOf(ComplianceOnboardingClientError);
  });

  it("routes onboarding calls to simulation endpoint for sandbox devices", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZATCA_BASE_URL", "https://gw-fatoora.zatca.gov.sa");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestID: 123,
        binarySecurityToken: "Y2VydA==",
        secret: "secret",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ComplianceOnboardingClient();
    await client.submitComplianceCsid({
      csr: "csr",
      otpCode: "123456",
      environment: "Sandbox",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/compliance",
    );
  });

  it("sends required headers and payload for production activation", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZATCA_BASE_URL", "https://gw-fatoora.zatca.gov.sa");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestID: 123,
        binarySecurityToken: "Y2VydA==",
        secret: "secret",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ComplianceOnboardingClient();
    await client.activateProductionCsid({
      csr: "csr",
      complianceRequestId: "123456789",
      environment: "Production",
      complianceCredentials: {
        csid: "compliance-csid",
        secret: "compliance-secret",
      },
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://gw-fatoora.zatca.gov.sa/e-invoicing/core/production/csids",
    );
    expect(request.method).toBe("POST");
    expect(request.headers.currentCCSID).toBe("compliance-csid");
    expect(String(request.headers.authorization)).toMatch(/^Basic /);
    const parsedBody = JSON.parse(String(request.body)) as {
      compliance_request_id: string;
      csr: string;
    };
    expect(parsedBody.compliance_request_id).toBe("123456789");
    expect(parsedBody.csr).toBe("csr");
  });

  it("sends required headers for renewal and revocation contracts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZATCA_BASE_URL", "https://gw-fatoora.zatca.gov.sa");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestID: 123,
        binarySecurityToken: "Y2VydA==",
        secret: "secret",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ComplianceOnboardingClient();
    await client.renewProductionCsid({
      csr: "renew-csr",
      otpCode: "123456",
      environment: "Sandbox",
      currentCredentials: {
        csid: "production-csid",
        secret: "production-secret",
      },
    });
    await client.revokeProductionCsid({
      environment: "Sandbox",
      currentCredentials: {
        csid: "production-csid",
        secret: "production-secret",
      },
      reason: "contract-check",
    });

    const [renewUrl, renewRequest] = fetchMock.mock.calls[0]!;
    expect(renewUrl).toBe(
      "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/production/csids",
    );
    expect(renewRequest.method).toBe("PATCH");
    expect(renewRequest.headers.currentCSID).toBe("production-csid");
    expect(renewRequest.headers.OTP).toBe("123456");

    const [revokeUrl, revokeRequest] = fetchMock.mock.calls[1]!;
    expect(revokeUrl).toBe(
      "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/production/csids",
    );
    expect(revokeRequest.method).toBe("DELETE");
    expect(revokeRequest.headers.currentCSID).toBe("production-csid");
  });

  it("calls compliance-check endpoint with invoice payload and compliance credentials", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZATCA_BASE_URL", "https://gw-fatoora.zatca.gov.sa");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        requestId: "check-1",
        reportingStatus: "REPORTED",
        warnings: [{ message: "Minor warning" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ComplianceOnboardingClient();
    const result = await client.runComplianceCheck({
      environment: "Sandbox",
      credentials: {
        csid: "compliance-csid",
        secret: "compliance-secret",
      },
      invoiceHash: "invoice-hash",
      uuid: "invoice-uuid",
      xmlContent: "<Invoice/>",
    });

    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/compliance/invoices",
    );
    expect(request.method).toBe("POST");
    expect(request.headers["accept-version"]).toBe("v2");
    expect(String(request.headers.authorization)).toMatch(/^Basic /);
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual(["Minor warning"]);
    expect(result.errors).toEqual([]);
  });
});
