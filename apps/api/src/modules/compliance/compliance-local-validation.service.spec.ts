import { describe, expect, it, vi } from "vitest";

import { createLocalValidationServiceForTests } from "./compliance-local-validation.service";

describe("compliance local validation service", () => {
  it("runs validate/hash/qr commands and reports pass state", async () => {
    const executor = vi.fn().mockResolvedValue({
      stdout: "PASS",
      stderr: "",
      exitCode: 0,
    });
    const service = createLocalValidationServiceForTests(executor);

    const result = await service.validateInvoiceXml({
      invoiceNumber: "INV-LOCAL-0001",
      xmlContent: "<Invoice/>",
    });

    expect(executor).toHaveBeenCalledTimes(3);
    expect(result.status).toBe("PASSED");
    expect(result.commands.map((entry) => entry.command)).toEqual([
      "validate",
      "generateHash",
      "qr",
    ]);
  });

  it("fails validation when SDK is unavailable in required mode", async () => {
    const executor = vi
      .fn()
      .mockRejectedValue(new Error("spawn fatoora ENOENT"));
    const service = createLocalValidationServiceForTests(executor);

    const result = await service.validateInvoiceXml({
      invoiceNumber: "INV-LOCAL-0002",
      xmlContent: "<Invoice/>",
    });

    expect(result.status).toBe("FAILED");
    expect(result.errors.some((error) => error.code === "SDK_UNAVAILABLE")).toBe(
      true,
    );
  });

  it("supports best-effort mode where missing SDK marks validation as skipped", async () => {
    const executor = vi
      .fn()
      .mockRejectedValue(new Error("spawn fatoora ENOENT"));
    const service = createLocalValidationServiceForTests(executor, "best-effort");

    const result = await service.validateInvoiceXml({
      invoiceNumber: "INV-LOCAL-0002B",
      xmlContent: "<Invoice/>",
    });

    expect(result.status).toBe("SKIPPED");
    expect(result.warnings.some((warning) => warning.code === "SDK_UNAVAILABLE")).toBe(
      true,
    );
  });

  it("marks validation as failed when sdk output contains fatal errors", async () => {
    const executor = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "NOT PASS\nError: BR-KSA-84",
        stderr: "",
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: "PASS",
        stderr: "",
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: "PASS",
        stderr: "",
        exitCode: 0,
      });
    const service = createLocalValidationServiceForTests(executor);

    const result = await service.validateInvoiceXml({
      invoiceNumber: "INV-LOCAL-0003",
      xmlContent: "<Invoice/>",
    });

    expect(result.status).toBe("FAILED");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.severity).toBe("error");
  });
});
