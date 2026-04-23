import { describe, expect, it, vi } from "vitest";

import { ComplianceService } from "./compliance.service";

function createServiceForEnvironmentSelectionTests() {
  const prisma = {
    salesInvoice: {
      findFirst: vi.fn(),
    },
    organizationTaxDetail: {
      findUnique: vi.fn(),
    },
    complianceDocument: {
      findFirst: vi.fn(),
    },
    organizationSetting: {
      findUnique: vi.fn(),
    },
  };

  const service = new ComplianceService(
    prisma as any,
    { enqueueSubmission: vi.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return {
    service,
    prisma,
  };
}

describe("ComplianceService environment-scoped onboarding selection", () => {
  it("uses sandbox onboarding selection for submission flow", async () => {
    const { service, prisma } = createServiceForEnvironmentSelectionTests();
    prisma.salesInvoice.findFirst.mockResolvedValue({
      id: "inv_1",
      status: "ISSUED",
      complianceDocument: null,
    });
    prisma.organizationTaxDetail.findUnique.mockResolvedValue({
      legalName: "Nomad Events",
      taxNumber: "300123456700003",
    });
    prisma.complianceDocument.findFirst.mockResolvedValue(null);
    prisma.organizationSetting.findUnique.mockResolvedValue({
      value: {
        environment: "Sandbox",
        mappings: {},
      },
    });

    const activeOnboardingSpy = vi
      .spyOn(service as any, "findActiveOnboardingForEnvironment")
      .mockResolvedValue(null);

    await expect(service.reportInvoice("org_1", "user_1", "inv_1")).rejects.toThrow(
      "ZATCA onboarding is not active for Sandbox environment",
    );
    expect(activeOnboardingSpy).toHaveBeenCalledWith("org_1", "Sandbox");
  });

  it("uses production onboarding selection for retry flow", async () => {
    const { service, prisma } = createServiceForEnvironmentSelectionTests();
    prisma.complianceDocument.findFirst.mockResolvedValue({
      id: "doc_1",
      status: "FAILED",
      salesInvoiceId: "inv_1",
      onboarding: {
        environment: "Production",
      },
      submission: {
        id: "sub_1",
      },
      salesInvoice: {
        status: "ISSUED",
      },
    });

    const activeOnboardingSpy = vi
      .spyOn(service as any, "findActiveOnboardingForEnvironment")
      .mockResolvedValue(null);

    await expect(
      service.retryInvoiceSubmission("org_1", "user_1", "inv_1"),
    ).rejects.toThrow("ZATCA onboarding is not active for Production environment");
    expect(activeOnboardingSpy).toHaveBeenCalledWith("org_1", "Production");
  });

  it("uses dead-letter document environment for requeue selection", async () => {
    const { service } = createServiceForEnvironmentSelectionTests();
    vi.spyOn(service as any, "deadLetterContextOrThrow").mockResolvedValue({
      submission: {
        id: "sub_1",
        complianceDocument: {
          onboarding: {
            environment: "Sandbox",
          },
        },
      },
      lifecycle: {
        state: "OPEN",
      },
      canRequeue: true,
    });
    const activeOnboardingSpy = vi
      .spyOn(service as any, "findActiveOnboardingForEnvironment")
      .mockResolvedValue(null);

    await expect(
      service.requeueDeadLetterItem("org_1", "user_1", "sub_1"),
    ).rejects.toThrow("ZATCA onboarding is not active for Sandbox environment");
    expect(activeOnboardingSpy).toHaveBeenCalledWith("org_1", "Sandbox");
  });
});

