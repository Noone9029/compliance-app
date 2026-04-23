import { describe, expect, it, vi } from "vitest";

import { createLocalValidationServiceForTests } from "./compliance-local-validation.service";

describe("compliance local validation service", () => {
  it("runs validate/hash/qr commands and reports pass state", async () => {
    const runner = {
      runRuntimeValidation: vi.fn().mockResolvedValue({
        status: "PASSED",
        hash: "hash",
        qr: "qr",
        warnings: [],
        errors: [],
        commands: [
          {
            command: "validate",
            status: "PASSED",
            stdout: "PASS",
            stderr: "",
            exitCode: 0,
            warnings: [],
            errors: [],
          },
          {
            command: "generateHash",
            status: "PASSED",
            stdout: "PASS",
            stderr: "",
            exitCode: 0,
            warnings: [],
            errors: [],
          },
          {
            command: "qr",
            status: "PASSED",
            stdout: "PASS",
            stderr: "",
            exitCode: 0,
            warnings: [],
            errors: [],
          },
        ],
      }),
    };
    const service = createLocalValidationServiceForTests(runner);

    const result = await service.validateInvoiceXml({
      invoiceNumber: "INV-LOCAL-0001",
      xmlContent: "<Invoice/>",
    });

    expect(runner.runRuntimeValidation).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("PASSED");
    expect(result.commands.map((entry) => entry.command)).toEqual([
      "validate",
      "generateHash",
      "qr",
    ]);
  });

  it("fails validation when SDK is unavailable in required mode", async () => {
    const runner = {
      runRuntimeValidation: vi
        .fn()
        .mockRejectedValue(new Error("spawn java ENOENT")),
    };
    const service = createLocalValidationServiceForTests(runner);

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
    const runner = {
      runRuntimeValidation: vi
        .fn()
        .mockRejectedValue(new Error("Unable to locate SDK root")),
    };
    const service = createLocalValidationServiceForTests(runner, "best-effort");

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
    const runner = {
      runRuntimeValidation: vi.fn().mockResolvedValue({
        status: "FAILED",
        hash: null,
        qr: null,
        warnings: [],
        errors: ["Error: BR-KSA-84"],
        commands: [
          {
            command: "validate",
            status: "FAILED",
            stdout: "NOT PASS\nError: BR-KSA-84",
            stderr: "",
            exitCode: 0,
            warnings: [],
            errors: ["Error: BR-KSA-84"],
          },
          {
            command: "generateHash",
            status: "PASSED",
            stdout: "PASS",
            stderr: "",
            exitCode: 0,
            warnings: [],
            errors: [],
          },
          {
            command: "qr",
            status: "PASSED",
            stdout: "PASS",
            stderr: "",
            exitCode: 0,
            warnings: [],
            errors: [],
          },
        ],
      }),
    };
    const service = createLocalValidationServiceForTests(runner);

    const result = await service.validateInvoiceXml({
      invoiceNumber: "INV-LOCAL-0003",
      xmlContent: "<Invoice/>",
    });

    expect(result.status).toBe("FAILED");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.severity).toBe("error");
  });

  it("tracks warnings without blocking validation", async () => {
    const runner = {
      runRuntimeValidation: vi.fn().mockResolvedValue({
        status: "PASSED",
        hash: "hash",
        qr: "qr",
        warnings: ["Warning: Minor formatting issue"],
        errors: [],
        commands: [
          {
            command: "validate",
            status: "PASSED",
            stdout: "[WARN] Minor formatting issue",
            stderr: "",
            exitCode: 0,
            warnings: ["Warning: Minor formatting issue"],
            errors: [],
          },
          {
            command: "generateHash",
            status: "PASSED",
            stdout: "PASS",
            stderr: "",
            exitCode: 0,
            warnings: [],
            errors: [],
          },
          {
            command: "qr",
            status: "PASSED",
            stdout: "PASS",
            stderr: "",
            exitCode: 0,
            warnings: [],
            errors: [],
          },
        ],
      }),
    };
    const service = createLocalValidationServiceForTests(runner);

    const result = await service.validateInvoiceXml({
      invoiceNumber: "INV-LOCAL-0004",
      xmlContent: "<Invoice/>",
    });

    expect(result.status).toBe("PASSED");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
  });
});
