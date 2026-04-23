import { Injectable } from "@nestjs/common";

import { loadEnv } from "@daftar/config";
import {
  SdkParityService,
  type RuntimeSdkValidationResult,
} from "./sdk-parity.service";
import { redactSensitiveText } from "./secret-redaction";

export type LocalValidationSeverity = "warning" | "error";

export type LocalValidationIssue = {
  code: string;
  message: string;
  severity: LocalValidationSeverity;
};

export type LocalValidationCommandResult = {
  command: "validate" | "generateHash" | "qr";
  status: "PASSED" | "FAILED" | "SKIPPED";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  issues: LocalValidationIssue[];
};

export type LocalValidationResult = {
  status: "PASSED" | "FAILED" | "SKIPPED";
  commands: LocalValidationCommandResult[];
  warnings: LocalValidationIssue[];
  errors: LocalValidationIssue[];
};

type LocalValidationMode = "required" | "best-effort";

const validationCommands = ["validate", "generateHash", "qr"] as const;

@Injectable()
export class ComplianceLocalValidationService {
  private readonly env = loadEnv();
  private mode: LocalValidationMode;

  constructor(
    private readonly runner: SdkParityService = new SdkParityService(),
  ) {
    const isVitestRuntime = process.env.VITEST === "true";
    this.mode =
      isVitestRuntime ? "best-effort" : this.env.ZATCA_LOCAL_VALIDATION_MODE;
  }

  async validateInvoiceXml(input: {
    invoiceNumber: string;
    xmlContent: string;
  }): Promise<LocalValidationResult> {
    try {
      const runtimeValidation = await this.runner.runRuntimeValidation(input);
      const mapped = this.mapRuntimeValidation(runtimeValidation);
      if (mapped.status === "FAILED" && this.mode === "best-effort") {
        const downgradeWarning: LocalValidationIssue = {
          code: "SDK_VALIDATION_SKIPPED",
          message:
            "Local SDK validation reported errors, but enforcement is disabled in best-effort mode.",
          severity: "warning",
        };
        return {
          status: "SKIPPED",
          commands: mapped.commands.map((command) =>
            command.status === "FAILED"
              ? {
                  ...command,
                  status: "SKIPPED",
                  issues: [...command.issues, downgradeWarning],
                }
              : command,
          ),
          warnings: [...mapped.warnings, downgradeWarning],
          errors: [],
        };
      }
      return mapped;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Local SDK validation failed.";
      const safeMessage = redactSensitiveText(message);
      const lowered = message.toLowerCase();
      const isMissingSdkRuntime =
        lowered.includes("enoent") ||
        lowered.includes("not recognized") ||
        lowered.includes("unable to locate sdk root") ||
        lowered.includes("sdk jar not found");

      if (isMissingSdkRuntime && this.mode === "best-effort") {
        const warning: LocalValidationIssue = {
          code: "SDK_UNAVAILABLE",
          message:
            "ZATCA SDK runtime is unavailable locally. Skipping offline validation in best-effort mode.",
          severity: "warning",
        };
        return {
          status: "SKIPPED",
          commands: validationCommands.map((command) => ({
            command,
            status: "SKIPPED",
            stdout: "",
            stderr: safeMessage,
            exitCode: null,
            issues: [warning],
          })),
          warnings: [warning],
          errors: [],
        };
      }

      const failure: LocalValidationIssue = {
        code: isMissingSdkRuntime ? "SDK_UNAVAILABLE" : "SDK_EXECUTION_ERROR",
        message: isMissingSdkRuntime
          ? "ZATCA SDK runtime is required but unavailable. Ensure SDK files and Java runtime are installed."
          : message,
        severity: "error",
      };
      return {
        status: "FAILED",
        commands: validationCommands.map((command) => ({
          command,
          status: "FAILED",
          stdout: "",
          stderr: safeMessage,
          exitCode: null,
          issues: [failure],
        })),
        warnings: [],
        errors: [failure],
      };
    }
  }

  private mapRuntimeValidation(
    runtimeValidation: RuntimeSdkValidationResult,
  ): LocalValidationResult {
    const commands = runtimeValidation.commands.map<LocalValidationCommandResult>((command) => {
      const warningIssues = command.warnings.map<LocalValidationIssue>((message) => ({
        code: "SDK_WARNING",
        message: redactSensitiveText(message),
        severity: "warning",
      }));
      const errorIssues = command.errors.map<LocalValidationIssue>((message) => ({
        code: "SDK_ERROR",
        message: redactSensitiveText(message),
        severity: "error",
      }));
      return {
        command: command.command,
        status: command.status,
        stdout: redactSensitiveText(command.stdout),
        stderr: redactSensitiveText(command.stderr),
        exitCode: command.exitCode,
        issues: [...warningIssues, ...errorIssues],
      };
    });
    const warnings = runtimeValidation.warnings.map<LocalValidationIssue>((message) => ({
      code: "SDK_WARNING",
      message: redactSensitiveText(message),
      severity: "warning",
    }));
    const errors = runtimeValidation.errors.map<LocalValidationIssue>((message) => ({
      code: "SDK_ERROR",
      message: redactSensitiveText(message),
      severity: "error",
    }));

    return {
      status: runtimeValidation.status,
      commands,
      warnings,
      errors,
    };
  }

  setModeForTests(mode: LocalValidationMode) {
    this.mode = mode;
  }
}

export function createLocalValidationServiceForTests(
  runner: Pick<SdkParityService, "runRuntimeValidation">,
  mode: LocalValidationMode = "required",
) {
  const service = new ComplianceLocalValidationService(runner as SdkParityService);
  service.setModeForTests(mode);
  return service;
}
