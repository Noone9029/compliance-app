import { Injectable } from "@nestjs/common";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadEnv } from "@daftar/config";

const execFileAsync = promisify(execFile);

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

type CommandExecutor = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}>;

function parseIssues(stdout: string, stderr: string): LocalValidationIssue[] {
  const combined = [stdout, stderr].filter(Boolean).join("\n");
  if (!combined.trim()) {
    return [];
  }

  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const issues: LocalValidationIssue[] = [];

  for (const line of lines) {
    const normalized = line.toLowerCase();
    if (normalized.includes("warning")) {
      issues.push({
        code: "SDK_WARNING",
        message: line,
        severity: "warning",
      });
      continue;
    }

    if (
      normalized.includes("error") ||
      normalized.includes("not pass") ||
      normalized.includes("failed")
    ) {
      issues.push({
        code: "SDK_ERROR",
        message: line,
        severity: "error",
      });
    }
  }

  return issues;
}

function aggregateStatus(commands: LocalValidationCommandResult[]) {
  if (commands.every((command) => command.status === "SKIPPED")) {
    return "SKIPPED" as const;
  }

  if (commands.some((command) => command.status === "FAILED")) {
    return "FAILED" as const;
  }

  return "PASSED" as const;
}

@Injectable()
export class ComplianceLocalValidationService {
  private readonly env = loadEnv();
  private readonly mode: LocalValidationMode;

  constructor(
    private readonly executor: CommandExecutor = runCommand,
    mode?: LocalValidationMode,
  ) {
    const isVitestRuntime = process.env.VITEST === "true";
    this.mode = mode
      ?? (isVitestRuntime ? "best-effort" : this.env.ZATCA_LOCAL_VALIDATION_MODE);
  }

  async validateInvoiceXml(input: {
    invoiceNumber: string;
    xmlContent: string;
  }): Promise<LocalValidationResult> {
    const workspace = await mkdtemp(join(tmpdir(), "daftar-zatca-sdk-"));
    const invoiceFile = join(workspace, `${input.invoiceNumber}.xml`);

    try {
      await writeFile(invoiceFile, input.xmlContent, "utf8");

      const command = this.env.ZATCA_SDK_CLI_PATH ?? "fatoora";
      const commands: Array<{
        key: "validate" | "generateHash" | "qr";
        args: string[];
      }> = [
        { key: "validate", args: ["-validate", "-invoice", invoiceFile] },
        { key: "generateHash", args: ["-generateHash", "-invoice", invoiceFile] },
        { key: "qr", args: ["-qr", "-invoice", invoiceFile] },
      ];

      const results: LocalValidationCommandResult[] = [];
      for (const spec of commands) {
        const result = await this.runSingleCommand({
          command,
          args: spec.args,
          cwd: workspace,
          mode: spec.key,
        });
        results.push(result);
      }

      const warnings = results.flatMap((result) =>
        result.issues.filter((issue) => issue.severity === "warning"),
      );
      const errors = results.flatMap((result) =>
        result.issues.filter((issue) => issue.severity === "error"),
      );

      return {
        status: aggregateStatus(results),
        commands: results,
        warnings,
        errors,
      };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  private async runSingleCommand(input: {
    command: string;
    args: readonly string[];
    cwd: string;
    mode: "validate" | "generateHash" | "qr";
  }): Promise<LocalValidationCommandResult> {
    try {
      const result = await this.executor(input.command, input.args, input.cwd);
      const issues = parseIssues(result.stdout, result.stderr);
      const hasError = issues.some((issue) => issue.severity === "error");

      return {
        command: input.mode,
        status:
          result.exitCode !== null && result.exitCode !== 0
            ? "FAILED"
            : hasError
              ? "FAILED"
              : "PASSED",
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        issues,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Local SDK command failed.";
      const isMissingTool =
        message.includes("ENOENT") ||
        message.toLowerCase().includes("not recognized");

      if (isMissingTool && this.mode === "required") {
        return {
          command: input.mode,
          status: "FAILED",
          stdout: "",
          stderr: message,
          exitCode: null,
          issues: [
            {
              code: "SDK_UNAVAILABLE",
              message:
                "ZATCA SDK CLI is required but was not found locally. Install SDK and expose `fatoora` or set ZATCA_SDK_CLI_PATH.",
              severity: "error",
            },
          ],
        };
      }

      return {
        command: input.mode,
        status: isMissingTool ? "SKIPPED" : "FAILED",
        stdout: "",
        stderr: message,
        exitCode: null,
        issues: isMissingTool
          ? [
              {
                code: "SDK_UNAVAILABLE",
                message:
                  "ZATCA SDK CLI was not found locally. Skipping offline validation.",
                severity: "warning",
              },
            ]
          : [
              {
                code: "SDK_EXECUTION_ERROR",
                message,
                severity: "error",
              },
            ],
      };
    }
  }
}

async function runCommand(command: string, args: readonly string[], cwd: string) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 8,
    });
    return {
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
      exitCode: 0,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      "stderr" in error
    ) {
      const err = error as {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        code?: number;
      };
      return {
        stdout: Buffer.isBuffer(err.stdout)
          ? err.stdout.toString("utf8")
          : String(err.stdout ?? ""),
        stderr: Buffer.isBuffer(err.stderr)
          ? err.stderr.toString("utf8")
          : String(err.stderr ?? ""),
        exitCode: typeof err.code === "number" ? err.code : null,
      };
    }

    throw error;
  }
}

export function createLocalValidationServiceForTests(
  executor: CommandExecutor,
  mode: LocalValidationMode = "required",
) {
  return new ComplianceLocalValidationService(executor, mode);
}
