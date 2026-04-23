import { Injectable } from "@nestjs/common";
import { loadEnv } from "@daftar/config";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import { ComplianceCryptoService } from "./compliance-crypto.service";
import {
  buildInvoiceXml,
  buildQrPayload,
  decodeQrTlv,
  firstPreviousInvoiceHash,
  type QrTlvField,
} from "./compliance-core";
import { injectSignatureExtensionIntoInvoiceXml } from "./compliance-ubl";
import {
  complianceParityFixtures,
  type ComplianceParityFixture,
} from "./compliance-fixtures";

const execFileAsync = promisify(execFile);

type SdkCommandName =
  | "validate"
  | "generateHash"
  | "qr"
  | "generateRequest"
  | "sign";

type CommandExecutor = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}>;

type SdkCommandExecution = {
  command: SdkCommandName;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type RuntimeSdkValidationCommandResult = {
  command: "validate" | "generateHash" | "qr";
  status: "PASSED" | "FAILED";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  warnings: string[];
  errors: string[];
};

export type RuntimeSdkValidationResult = {
  status: "PASSED" | "FAILED";
  hash: string | null;
  qr: string | null;
  warnings: string[];
  errors: string[];
  commands: RuntimeSdkValidationCommandResult[];
};

export type SdkParityMismatchArea =
  | "validation"
  | "hash"
  | "qr"
  | "request"
  | "xml-node"
  | "sdk-command";

export type SdkParityMismatch = {
  area: SdkParityMismatchArea;
  message: string;
  ours?: string | null;
  sdk?: string | null;
};

export type SdkValidationReport = {
  expected: "PASSED" | "FAILED";
  sdkStatus: "PASSED" | "FAILED";
  warnings: string[];
  errors: string[];
};

export type SdkParityFixtureReport = {
  fixtureId: string;
  fixtureTitle: string;
  strictParity: boolean;
  validation: SdkValidationReport;
  commandExecutions: SdkCommandExecution[];
  mismatches: SdkParityMismatch[];
};

export type SdkParitySuiteReport = {
  generatedAt: string;
  fixtures: SdkParityFixtureReport[];
  mismatchCount: number;
  failedFixtures: number;
};

type XmlNodeSnapshot = Record<string, string | null>;
type QrTagId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const qrTagIds: readonly QrTagId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

type SdkRuntime = {
  command: string;
  argsPrefix: string[];
  env: NodeJS.ProcessEnv;
};

type FixtureArtifacts = {
  uuid: string;
  invoiceCounter: number;
  unsignedXml: string;
  signedXml: string;
  invoiceHash: string;
  qrPayload: string;
  requestPayload: {
    invoiceHash: string;
    uuid: string;
    invoice: string;
  };
};

@Injectable()
export class SdkParityService {
  private readonly env = loadEnv();
  private readonly cryptoService: ComplianceCryptoService;

  constructor(
    cryptoService?: ComplianceCryptoService,
    private readonly executor: CommandExecutor = runCommand,
  ) {
    this.cryptoService = cryptoService ?? new ComplianceCryptoService();
  }

  async runParitySuite(
    fixtures: readonly ComplianceParityFixture[] = complianceParityFixtures,
  ): Promise<SdkParitySuiteReport> {
    const workspace = await mkdtemp(join(tmpdir(), "daftar-sdk-parity-"));
    try {
      const runtime = await this.prepareSdkRuntime(workspace);
      const signingMaterial = this.loadSigningMaterial();
      const reports: SdkParityFixtureReport[] = [];

      for (let index = 0; index < fixtures.length; index += 1) {
        const fixture = fixtures[index]!;
        const report = await this.runFixtureParity({
          fixture,
          fixtureIndex: index,
          workspace,
          runtime,
          signingMaterial,
        });
        reports.push(report);
      }

      const mismatchCount = reports.reduce(
        (count, report) => count + report.mismatches.length,
        0,
      );

      return {
        generatedAt: new Date().toISOString(),
        fixtures: reports,
        mismatchCount,
        failedFixtures: reports.filter((entry) => entry.mismatches.length > 0).length,
      };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  formatSummary(report: SdkParitySuiteReport) {
    const lines = [
      "SDK parity summary:",
      `- generatedAt: ${report.generatedAt}`,
      `- fixtures: ${report.fixtures.length}`,
      `- failedFixtures: ${report.failedFixtures}`,
      `- mismatches: ${report.mismatchCount}`,
    ];

    for (const fixture of report.fixtures) {
      lines.push(
        `\n[${fixture.fixtureId}] ${fixture.fixtureTitle} -> ${fixture.mismatches.length === 0 ? "OK" : "MISMATCH"}`,
      );
      lines.push(
        `  validation: expected=${fixture.validation.expected}, sdk=${fixture.validation.sdkStatus}`,
      );
      if (fixture.validation.errors.length > 0) {
        lines.push(`  sdkErrors: ${fixture.validation.errors[0]}`);
      }
      if (fixture.validation.warnings.length > 0) {
        lines.push(`  sdkWarnings: ${fixture.validation.warnings[0]}`);
      }
      if (fixture.mismatches.length === 0) {
        continue;
      }

      for (const mismatch of fixture.mismatches) {
        lines.push(`  - (${mismatch.area}) ${mismatch.message}`);
        if (typeof mismatch.ours === "string") {
          lines.push(`    ours: ${mismatch.ours}`);
        }
        if (typeof mismatch.sdk === "string") {
          lines.push(`    sdk: ${mismatch.sdk}`);
        }
      }
    }

    return lines.join("\n");
  }

  async runRuntimeValidation(input: {
    invoiceNumber: string;
    xmlContent: string;
  }): Promise<RuntimeSdkValidationResult> {
    const workspace = await mkdtemp(join(tmpdir(), "daftar-sdk-runtime-validation-"));
    try {
      const runtime = await this.prepareSdkRuntime(workspace);
      const invoicePath = join(workspace, `${input.invoiceNumber}.xml`);
      await writeFile(invoicePath, input.xmlContent, "utf8");

      const validateExecution = await this.runSdkCommand(
        runtime,
        workspace,
        "validate",
        ["-validate", "-invoice", invoicePath],
      );
      const hashExecution = await this.runSdkCommand(
        runtime,
        workspace,
        "generateHash",
        ["-generateHash", "-invoice", invoicePath],
      );
      const qrExecution = await this.runSdkCommand(runtime, workspace, "qr", [
        "-qr",
        "-invoice",
        invoicePath,
      ]);

      const parsedValidation = this.parseValidation(validateExecution);
      const parseCommandMessages = (execution: SdkCommandExecution) => {
        const lines = `${execution.stdout}\n${execution.stderr}`
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        const warnings = lines.filter(
          (line) =>
            line.includes("[WARN]") || line.toLowerCase().startsWith("warning"),
        );
        const errors = lines.filter(
          (line) =>
            line.includes("[ERROR]") ||
            line.toLowerCase().startsWith("error") ||
            line.toLowerCase().includes("failed") ||
            line.toLowerCase().includes("not pass"),
        );
        return { warnings, errors };
      };

      const hashMessages = parseCommandMessages(hashExecution);
      const qrMessages = parseCommandMessages(qrExecution);
      const commandResult = (
        execution: SdkCommandExecution,
        warnings: string[],
        errors: string[],
      ): RuntimeSdkValidationCommandResult => ({
        command: execution.command as "validate" | "generateHash" | "qr",
        status:
          execution.exitCode !== null && execution.exitCode !== 0
            ? "FAILED"
            : errors.length > 0
              ? "FAILED"
              : "PASSED",
        stdout: execution.stdout,
        stderr: execution.stderr,
        exitCode: execution.exitCode,
        warnings,
        errors,
      });

      const validateCommand = commandResult(
        validateExecution,
        parsedValidation.warnings,
        parsedValidation.errors,
      );
      const hashCommand = commandResult(
        hashExecution,
        hashMessages.warnings,
        hashMessages.errors,
      );
      const qrCommand = commandResult(qrExecution, qrMessages.warnings, qrMessages.errors);
      const commands = [validateCommand, hashCommand, qrCommand];
      const warnings = commands.flatMap((command) => command.warnings);
      const errors = commands.flatMap((command) => command.errors);
      const status = commands.some((command) => command.status === "FAILED")
        ? "FAILED"
        : "PASSED";

      return {
        status,
        hash: this.parseSingleValue(
          hashExecution,
          /INVOICE HASH\s*=\s*([A-Za-z0-9+/=]+)/i,
        ),
        qr: this.parseSingleValue(qrExecution, /QR code\s*=\s*([A-Za-z0-9+/=]+)/i),
        warnings,
        errors,
        commands,
      };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  private async runFixtureParity(input: {
    fixture: ComplianceParityFixture;
    fixtureIndex: number;
    workspace: string;
    runtime: SdkRuntime;
    signingMaterial: { privateKeyPem: string; certificatePem: string };
  }): Promise<SdkParityFixtureReport> {
    const { fixture, fixtureIndex, workspace, runtime, signingMaterial } = input;
    const strictParity = fixture.strictParity !== false;
    const artifacts = await this.buildArtifacts({
      fixture,
      fixtureIndex,
      signingMaterial,
    });
    const fixturePrefix = `${String(fixtureIndex + 1).padStart(2, "0")}-${fixture.id}`;
    const signedInvoicePath = join(workspace, `${fixturePrefix}.signed.xml`);
    const unsignedInvoicePath = join(workspace, `${fixturePrefix}.unsigned.xml`);
    const requestOutputPath = join(workspace, `${fixturePrefix}.request.json`);
    const sdkSignedOutputPath = join(workspace, `${fixturePrefix}.sdk-signed.xml`);

    await Promise.all([
      writeFile(signedInvoicePath, artifacts.signedXml, "utf8"),
      writeFile(unsignedInvoicePath, artifacts.unsignedXml, "utf8"),
    ]);

    const commandExecutions: SdkCommandExecution[] = [];
    const validationExecution = await this.runSdkCommand(runtime, workspace, "validate", [
      "-validate",
      "-invoice",
      signedInvoicePath,
    ]);
    commandExecutions.push(validationExecution);

    const hashExecution = await this.runSdkCommand(runtime, workspace, "generateHash", [
      "-generateHash",
      "-invoice",
      signedInvoicePath,
    ]);
    commandExecutions.push(hashExecution);

    const qrExecution = await this.runSdkCommand(runtime, workspace, "qr", [
      "-qr",
      "-invoice",
      signedInvoicePath,
    ]);
    commandExecutions.push(qrExecution);

    const requestExecution = await this.runSdkCommand(
      runtime,
      workspace,
      "generateRequest",
      [
        "-invoice",
        signedInvoicePath,
        "-invoiceRequest",
        "-apiRequest",
        requestOutputPath,
      ],
    );
    commandExecutions.push(requestExecution);

    const signExecution = await this.runSdkCommand(runtime, workspace, "sign", [
      "-sign",
      "-invoice",
      unsignedInvoicePath,
      "-signedInvoice",
      sdkSignedOutputPath,
    ]);
    commandExecutions.push(signExecution);

    const parsedValidation = this.parseValidation(validationExecution);
    const parsedHash = this.parseSingleValue(
      hashExecution,
      /INVOICE HASH\s*=\s*([A-Za-z0-9+/=]+)/i,
    );
    const parsedQr = this.parseSingleValue(
      qrExecution,
      /QR code\s*=\s*([A-Za-z0-9+/=]+)/i,
    );
    const sdkRequest = await this.readRequestPayload(requestOutputPath);

    const mismatches = this.compareFixture({
      fixture,
      strictParity,
      artifacts,
      validation: parsedValidation.status,
      sdkHash: parsedHash,
      sdkQr: parsedQr,
      sdkRequest,
      commandExecutions,
    });

    return {
      fixtureId: fixture.id,
      fixtureTitle: fixture.title,
      strictParity,
      validation: {
        expected: fixture.expectedValidation,
        sdkStatus: parsedValidation.status,
        warnings: parsedValidation.warnings,
        errors: parsedValidation.errors,
      },
      commandExecutions,
      mismatches,
    };
  }

  private compareFixture(input: {
    fixture: ComplianceParityFixture;
    strictParity: boolean;
    artifacts: FixtureArtifacts;
    validation: "PASSED" | "FAILED";
    sdkHash: string | null;
    sdkQr: string | null;
    sdkRequest: {
      invoiceHash: string | null;
      uuid: string | null;
      invoice: string | null;
    };
    commandExecutions: SdkCommandExecution[];
  }): SdkParityMismatch[] {
    const mismatches: SdkParityMismatch[] = [];

    if (input.validation !== input.fixture.expectedValidation) {
      mismatches.push({
        area: "validation",
        message: "SDK validation status does not match fixture expectation.",
        ours: input.fixture.expectedValidation,
        sdk: input.validation,
      });
    }

    const failedCommands = input.commandExecutions.filter(
      (execution) => execution.exitCode !== 0 && execution.command !== "validate",
    );
    for (const failed of failedCommands) {
      mismatches.push({
        area: "sdk-command",
        message: `SDK command '${failed.command}' returned non-zero exit code.`,
        ours: "0",
        sdk: String(failed.exitCode),
      });
    }

    if (!input.strictParity) {
      return mismatches;
    }

    if (input.artifacts.invoiceHash !== input.sdkHash) {
      mismatches.push({
        area: "hash",
        message: "Invoice hash mismatch.",
        ours: input.artifacts.invoiceHash,
        sdk: input.sdkHash ?? "<missing>",
      });
    }

    if (input.artifacts.qrPayload !== input.sdkQr) {
      mismatches.push(
        ...this.compareQrPayloads({
          ours: input.artifacts.qrPayload,
          sdk: input.sdkQr,
        }),
      );
    }

    if (input.artifacts.requestPayload.invoiceHash !== input.sdkRequest.invoiceHash) {
      mismatches.push({
        area: "request",
        message: "API request payload invoiceHash mismatch.",
        ours: input.artifacts.requestPayload.invoiceHash,
        sdk: input.sdkRequest.invoiceHash ?? "<missing>",
      });
    }

    if (input.artifacts.requestPayload.uuid !== input.sdkRequest.uuid) {
      mismatches.push({
        area: "request",
        message: "API request payload uuid mismatch.",
        ours: input.artifacts.requestPayload.uuid,
        sdk: input.sdkRequest.uuid ?? "<missing>",
      });
    }

    if (input.artifacts.requestPayload.invoice !== input.sdkRequest.invoice) {
      mismatches.push({
        area: "request",
        message: "API request payload invoice(base64) mismatch.",
      });
    }

    const oursInvoiceFromRequest = this.decodeInvoiceBase64(
      input.artifacts.requestPayload.invoice,
    );
    const sdkInvoiceFromRequest = this.decodeInvoiceBase64(input.sdkRequest.invoice);
    if (oursInvoiceFromRequest && sdkInvoiceFromRequest) {
      const nodeDiffs = this.diffXmlNodes(oursInvoiceFromRequest, sdkInvoiceFromRequest);
      mismatches.push(...nodeDiffs);
    }

    return mismatches;
  }

  private compareQrPayloads(input: {
    ours: string;
    sdk: string | null;
  }): SdkParityMismatch[] {
    const mismatches: SdkParityMismatch[] = [];
    if (!input.sdk) {
      mismatches.push({
        area: "qr",
        message: "SDK QR payload is missing.",
        ours: input.ours,
        sdk: "<missing>",
      });
      return mismatches;
    }

    let oursTlv: QrTlvField[];
    let sdkTlv: QrTlvField[];
    try {
      oursTlv = decodeQrTlv(input.ours);
    } catch (error) {
      mismatches.push({
        area: "qr",
        message: `Unable to decode QR TLV payload generated by our pipeline: ${
          error instanceof Error ? error.message : "unknown parse error"
        }`,
      });
      return mismatches;
    }

    try {
      sdkTlv = decodeQrTlv(input.sdk);
    } catch (error) {
      mismatches.push({
        area: "qr",
        message: `Unable to decode QR TLV payload generated by SDK: ${
          error instanceof Error ? error.message : "unknown parse error"
        }`,
      });
      return mismatches;
    }

    const oursOrder = oursTlv.map((entry) => String(entry.tag)).join(",");
    const sdkOrder = sdkTlv.map((entry) => String(entry.tag)).join(",");
    if (oursOrder !== sdkOrder) {
      mismatches.push({
        area: "qr",
        message: "QR TLV field ordering mismatch.",
        ours: oursOrder,
        sdk: sdkOrder,
      });
    }

    const oursMap = new Map(oursTlv.map((entry) => [entry.tag, entry.value]));
    const sdkMap = new Map(sdkTlv.map((entry) => [entry.tag, entry.value]));
    for (const tag of qrTagIds) {
      const oursValue = oursMap.get(tag);
      const sdkValue = sdkMap.get(tag);
      if (!oursValue && !sdkValue) {
        continue;
      }

      if (!oursValue || !sdkValue) {
        mismatches.push({
          area: "qr",
          message: `QR tag ${tag} (${this.describeQrTag(tag)}) presence mismatch.`,
          ours: oursValue ? this.describeQrTagValue(oursValue) : "<missing>",
          sdk: sdkValue ? this.describeQrTagValue(sdkValue) : "<missing>",
        });
        continue;
      }

      if (oursValue.equals(sdkValue)) {
        continue;
      }

      const classification = this.classifyQrTagMismatch(tag, oursValue, sdkValue);
      mismatches.push({
        area: "qr",
        message: `QR tag ${tag} (${this.describeQrTag(tag)}) mismatch: ${classification.reason}`,
        ours: classification.ours,
        sdk: classification.sdk,
      });
    }

    return mismatches;
  }

  private classifyQrTagMismatch(tag: QrTagId, ours: Buffer, sdk: Buffer) {
    const oursBase64TextDecoded = this.decodeBase64TextBuffer(ours);
    const sdkBase64TextDecoded = this.decodeBase64TextBuffer(sdk);

    if (oursBase64TextDecoded && oursBase64TextDecoded.equals(sdk)) {
      return {
        reason:
          "value encoding mismatch (ours appears base64-text encoded while SDK uses raw bytes).",
        ours: this.describeQrTagValue(ours),
        sdk: this.describeQrTagValue(sdk),
      };
    }

    if (sdkBase64TextDecoded && sdkBase64TextDecoded.equals(ours)) {
      return {
        reason:
          "value encoding mismatch (SDK appears base64-text encoded while ours uses raw bytes).",
        ours: this.describeQrTagValue(ours),
        sdk: this.describeQrTagValue(sdk),
      };
    }

    const oursUtf8 = this.tryDecodeUtf8(ours);
    const sdkUtf8 = this.tryDecodeUtf8(sdk);
    if (tag === 3 && oursUtf8 && sdkUtf8) {
      return {
        reason: "timestamp formatting mismatch.",
        ours: oursUtf8,
        sdk: sdkUtf8,
      };
    }

    if (tag === 6) {
      return {
        reason: "hash bytes mismatch (tag 6).",
        ours: this.describeQrTagValue(ours),
        sdk: this.describeQrTagValue(sdk),
      };
    }

    if (tag === 7) {
      return {
        reason: "signature bytes mismatch (tag 7).",
        ours: this.describeQrTagValue(ours),
        sdk: this.describeQrTagValue(sdk),
      };
    }

    if (tag === 8) {
      return {
        reason: "public key bytes mismatch (tag 8).",
        ours: this.describeQrTagValue(ours),
        sdk: this.describeQrTagValue(sdk),
      };
    }

    if (tag === 9) {
      return {
        reason: "technical stamp bytes mismatch (tag 9).",
        ours: this.describeQrTagValue(ours),
        sdk: this.describeQrTagValue(sdk),
      };
    }

    if (oursUtf8 && sdkUtf8) {
      return {
        reason: "UTF-8 text value mismatch.",
        ours: oursUtf8,
        sdk: sdkUtf8,
      };
    }

    return {
      reason: "raw byte mismatch.",
      ours: this.describeQrTagValue(ours),
      sdk: this.describeQrTagValue(sdk),
    };
  }

  private describeQrTag(tag: QrTagId) {
    switch (tag) {
      case 1:
        return "sellerName";
      case 2:
        return "sellerVatNumber";
      case 3:
        return "timestamp";
      case 4:
        return "invoiceTotalWithVat";
      case 5:
        return "vatTotal";
      case 6:
        return "invoiceHash";
      case 7:
        return "invoiceSignature";
      case 8:
        return "publicKey";
      case 9:
        return "technicalStamp";
      default:
        return `tag-${tag}`;
    }
  }

  private describeQrTagValue(value: Buffer) {
    const utf8 = this.tryDecodeUtf8(value);
    if (utf8) {
      return `${utf8} [bytes:b64=${value.toString("base64")}]`;
    }
    return `bytes:b64=${value.toString("base64")}`;
  }

  private tryDecodeUtf8(value: Buffer) {
    const text = value.toString("utf8");
    if (!text) {
      return null;
    }
    if (text.includes("\u0000") || text.includes("\ufffd")) {
      return null;
    }
    const roundTrip = Buffer.from(text, "utf8");
    if (!roundTrip.equals(value)) {
      return null;
    }
    return text;
  }

  private decodeBase64TextBuffer(value: Buffer) {
    const text = this.tryDecodeUtf8(value)?.trim();
    if (!text || text.length % 4 !== 0) {
      return null;
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
      return null;
    }

    const decoded = Buffer.from(text, "base64");
    if (decoded.length === 0) {
      return null;
    }
    const canonicalInput = text.replace(/=+$/u, "");
    const canonicalDecoded = decoded.toString("base64").replace(/=+$/u, "");
    if (canonicalInput !== canonicalDecoded) {
      return null;
    }

    return decoded;
  }

  private decodeInvoiceBase64(base64: string | null) {
    if (!base64) {
      return null;
    }

    try {
      return Buffer.from(base64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }

  private diffXmlNodes(oursXml: string, sdkXml: string): SdkParityMismatch[] {
    const oursSnapshot = this.extractXmlSnapshot(oursXml);
    const sdkSnapshot = this.extractXmlSnapshot(sdkXml);
    const allKeys = [...new Set([...Object.keys(oursSnapshot), ...Object.keys(sdkSnapshot)])];
    const mismatches: SdkParityMismatch[] = [];

    for (const key of allKeys) {
      const ours = oursSnapshot[key] ?? null;
      const sdk = sdkSnapshot[key] ?? null;
      if (ours === sdk) {
        continue;
      }

      mismatches.push({
        area: "xml-node",
        message: `XML node snapshot mismatch on '${key}'.`,
        ours: ours ?? "<missing>",
        sdk: sdk ?? "<missing>",
      });
    }

    return mismatches;
  }

  private extractXmlSnapshot(xml: string): XmlNodeSnapshot {
    const parser = new DOMParser();
    const document = parser.parseFromString(xml, "application/xml");
    const parserError = document.getElementsByTagName("parsererror");
    const root = document.documentElement;
    if (parserError.length > 0) {
      return {
        parserError: parserError.item(0)?.textContent?.trim() ?? "Unknown parse error",
      };
    }

    if (!root) {
      return {
        parserError: "XML document does not include a root element.",
      };
    }

    const refs = this.extractAdditionalDocumentReferences(root);
    return {
      profileId: this.firstTagText(root, "cbc:ProfileID"),
      invoiceId: this.firstTagText(root, "cbc:ID"),
      uuid: this.firstTagText(root, "cbc:UUID"),
      issueDate: this.firstTagText(root, "cbc:IssueDate"),
      issueTime: this.firstTagText(root, "cbc:IssueTime"),
      invoiceTypeCode: this.firstTagText(root, "cbc:InvoiceTypeCode"),
      invoiceTypeName: this.firstTagAttribute(root, "cbc:InvoiceTypeCode", "name"),
      icv: refs.ICV ?? null,
      pih: refs.PIH ?? null,
      qr: refs.QR ?? null,
      lineCount: String(document.getElementsByTagName("cac:InvoiceLine").length),
      documentCurrencyCode: this.firstTagText(root, "cbc:DocumentCurrencyCode"),
      taxCurrencyCode: this.firstTagText(root, "cbc:TaxCurrencyCode"),
    };
  }

  private extractAdditionalDocumentReferences(root: XmlElement) {
    const map: Record<string, string | null> = {
      ICV: null,
      PIH: null,
      QR: null,
    };
    const references = root.getElementsByTagName("cac:AdditionalDocumentReference");
    for (let index = 0; index < references.length; index += 1) {
      const reference = references.item(index);
      if (!reference) {
        continue;
      }

      const id = this.firstTagText(reference, "cbc:ID");
      if (!id || !(id in map)) {
        continue;
      }

      if (id === "ICV") {
        map.ICV = this.firstTagText(reference, "cbc:UUID");
        continue;
      }

      map[id] = this.firstTagText(reference, "cbc:EmbeddedDocumentBinaryObject");
    }

    return map;
  }

  private firstTagText(parent: XmlElement, tagName: string) {
    const nodes = parent.getElementsByTagName(tagName);
    const node = nodes.item(0);
    if (!node) {
      return null;
    }
    return (node.textContent ?? "").trim() || null;
  }

  private firstTagAttribute(parent: XmlElement, tagName: string, attribute: string) {
    const nodes = parent.getElementsByTagName(tagName);
    const node = nodes.item(0);
    if (!node) {
      return null;
    }
    const value = node.getAttribute(attribute);
    return value?.trim() || null;
  }

  private async buildArtifacts(input: {
    fixture: ComplianceParityFixture;
    fixtureIndex: number;
    signingMaterial: { privateKeyPem: string; certificatePem: string };
  }): Promise<FixtureArtifacts> {
    const { fixture, fixtureIndex, signingMaterial } = input;
    const uuid = this.fixtureUuid(fixtureIndex);
    const invoiceCounter = fixtureIndex + 1;
    const previousHash = firstPreviousInvoiceHash();
    const provisionalQrPayload = buildQrPayload({
      sellerName: fixture.invoice.seller.registrationName,
      taxNumber: fixture.invoice.seller.taxNumber ?? "",
      issuedAtIso: fixture.invoice.issueDateIso,
      total: fixture.invoice.total,
      taxTotal: fixture.invoice.taxTotal,
    });

    const unsignedXml = buildInvoiceXml({
      uuid,
      invoiceNumber: fixture.invoice.invoiceNumber,
      invoiceKind: fixture.invoice.invoiceKind,
      submissionFlow: fixture.invoice.submissionFlow,
      issueDateIso: fixture.invoice.issueDateIso,
      invoiceCounter,
      previousHash,
      qrPayload: provisionalQrPayload,
      currencyCode: fixture.invoice.currencyCode,
      seller: fixture.invoice.seller,
      buyer: fixture.invoice.buyer ?? null,
      deliveryDateIso: fixture.invoice.deliveryDateIso ?? null,
      paymentMeansCode: fixture.invoice.paymentMeansCode ?? null,
      paymentInstructionNote: fixture.invoice.paymentInstructionNote ?? null,
      billingReferenceId: fixture.invoice.billingReferenceId ?? null,
      subtotal: fixture.invoice.subtotal,
      taxTotal: fixture.invoice.taxTotal,
      total: fixture.invoice.total,
      lines: fixture.invoice.lines,
      note: fixture.invoice.note ?? null,
      documentType: fixture.invoice.documentType,
    });

    const signed = await this.cryptoService.signPhase2Invoice({
      xmlContent: unsignedXml,
      privateKeyPem: signingMaterial.privateKeyPem,
      certificatePem: signingMaterial.certificatePem,
    });

    const qrPayload = buildQrPayload({
      sellerName: fixture.invoice.seller.registrationName,
      taxNumber: fixture.invoice.seller.taxNumber ?? "",
      issuedAtIso: fixture.invoice.issueDateIso,
      total: fixture.invoice.total,
      taxTotal: fixture.invoice.taxTotal,
      invoiceHash: signed.invoiceHash,
      xmlSignature: signed.xmlSignature,
      publicKey: signed.publicKey,
      technicalStamp:
        fixture.invoice.invoiceKind === "SIMPLIFIED" ? signed.technicalStamp : null,
    });

    const unsignedXmlWithQr = buildInvoiceXml({
      uuid,
      invoiceNumber: fixture.invoice.invoiceNumber,
      invoiceKind: fixture.invoice.invoiceKind,
      submissionFlow: fixture.invoice.submissionFlow,
      issueDateIso: fixture.invoice.issueDateIso,
      invoiceCounter,
      previousHash,
      qrPayload,
      currencyCode: fixture.invoice.currencyCode,
      seller: fixture.invoice.seller,
      buyer: fixture.invoice.buyer ?? null,
      deliveryDateIso: fixture.invoice.deliveryDateIso ?? null,
      paymentMeansCode: fixture.invoice.paymentMeansCode ?? null,
      paymentInstructionNote: fixture.invoice.paymentInstructionNote ?? null,
      billingReferenceId: fixture.invoice.billingReferenceId ?? null,
      subtotal: fixture.invoice.subtotal,
      taxTotal: fixture.invoice.taxTotal,
      total: fixture.invoice.total,
      lines: fixture.invoice.lines,
      note: fixture.invoice.note ?? null,
      documentType: fixture.invoice.documentType,
    });

    let signedXml = injectSignatureExtensionIntoInvoiceXml(
      unsignedXmlWithQr,
      signed.signatureExtensionXml,
    );
    if (fixture.mutateSignedXml) {
      signedXml = fixture.mutateSignedXml(signedXml);
    }

    return {
      uuid,
      invoiceCounter,
      unsignedXml,
      signedXml,
      invoiceHash: signed.invoiceHash,
      qrPayload,
      requestPayload: {
        invoiceHash: signed.invoiceHash,
        uuid,
        invoice: Buffer.from(signedXml, "utf8").toString("base64"),
      },
    };
  }

  private fixtureUuid(index: number) {
    const suffix = String(index + 1).padStart(12, "0");
    return `00000000-0000-4000-8000-${suffix}`;
  }

  private parseValidation(execution: SdkCommandExecution) {
    const combined = `${execution.stdout}\n${execution.stderr}`;
    const globalStatus = this.extractValidationStatus(combined, {
      labels: ["GLOBAL VALIDATION RESULT"],
    });
    const structuralStatuses = [
      this.extractValidationStatus(combined, {
        tags: ["XSD"],
        labels: ["XSD VALIDATION RESULT"],
      }),
      this.extractValidationStatus(combined, {
        tags: ["EN"],
        labels: ["EN_16931 VALIDATION RESULT", "EN VALIDATION RESULT"],
      }),
      this.extractValidationStatus(combined, {
        tags: ["KSA"],
        labels: ["KSA VALIDATION RESULT"],
      }),
      this.extractValidationStatus(combined, {
        tags: ["PIH"],
        labels: ["PIH VALIDATION RESULT"],
      }),
    ].filter((status): status is "PASSED" | "FAILED" => status !== null);
    const status: "PASSED" | "FAILED" =
      structuralStatuses.length > 0
        ? structuralStatuses.every((entry) => entry === "PASSED")
          ? "PASSED"
          : "FAILED"
        : (globalStatus ?? "FAILED");
    const lines = combined
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const warnings = lines.filter(
      (line) => line.includes("[WARN]") || line.toLowerCase().startsWith("warning"),
    );
    const errors = lines.filter(
      (line) => line.includes("[ERROR]") || line.toLowerCase().startsWith("error"),
    );

    return {
      status,
      warnings,
      errors,
    };
  }

  private extractValidationStatus(
    content: string,
    input: {
      tags?: readonly string[];
      labels?: readonly string[];
    },
  ): "PASSED" | "FAILED" | null {
    for (const tag of input.tags ?? []) {
      const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const bracketPattern = new RegExp(
        `\\[${escapedTag}\\]\\s*validation\\s*result\\s*:\\s*(PASSED|FAILED)`,
        "i",
      );
      const bracketMatch = content.match(bracketPattern);
      const bracketValue = bracketMatch?.[1]?.toUpperCase();
      if (bracketValue === "PASSED" || bracketValue === "FAILED") {
        return bracketValue;
      }
    }

    for (const label of input.labels ?? []) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`${escapedLabel}\\s*=\\s*(PASSED|FAILED)`, "i");
      const match = content.match(pattern);
      const value = match?.[1]?.toUpperCase();
      if (value === "PASSED" || value === "FAILED") {
        return value;
      }
    }

    return null;
  }

  private parseSingleValue(execution: SdkCommandExecution, pattern: RegExp) {
    const combined = `${execution.stdout}\n${execution.stderr}`;
    const match = combined.match(pattern);
    return match?.[1]?.trim() ?? null;
  }

  private async readRequestPayload(path: string): Promise<{
    invoiceHash: string | null;
    uuid: string | null;
    invoice: string | null;
  }> {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as {
        invoiceHash?: unknown;
        uuid?: unknown;
        invoice?: unknown;
      };

      return {
        invoiceHash:
          typeof parsed.invoiceHash === "string" ? parsed.invoiceHash.trim() : null,
        uuid: typeof parsed.uuid === "string" ? parsed.uuid.trim() : null,
        invoice: typeof parsed.invoice === "string" ? parsed.invoice.trim() : null,
      };
    } catch {
      return {
        invoiceHash: null,
        uuid: null,
        invoice: null,
      };
    }
  }

  private async runSdkCommand(
    runtime: SdkRuntime,
    cwd: string,
    command: SdkCommandName,
    args: string[],
  ): Promise<SdkCommandExecution> {
    const finalArgs = [...runtime.argsPrefix, ...args];
    const result = await this.executor(runtime.command, finalArgs, {
      cwd,
      env: runtime.env,
    });

    return {
      command,
      args: finalArgs,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  private async prepareSdkRuntime(workspace: string): Promise<SdkRuntime> {
    const sdkRoot = this.resolveSdkRoot();
    const appsPath = join(sdkRoot, "Apps");
    const jarPath = join(appsPath, "zatca-einvoicing-sdk-238-R3.4.8.jar");
    if (!existsSync(jarPath)) {
      throw new Error(`ZATCA SDK jar not found at ${jarPath}`);
    }

    const globalJsonPath = join(appsPath, "global.json");
    const version = this.readSdkVersion(globalJsonPath);
    const sdkConfigPath = await this.writeRuntimeSdkConfig(sdkRoot, workspace);
    const env = {
      ...process.env,
      SDK_CONFIG: sdkConfigPath,
      FATOORA_HOME: `${appsPath}${appsPath.endsWith("\\") ? "" : "\\"}`,
      ZATCA_SDK_CLI_PATH: this.env.ZATCA_SDK_CLI_PATH,
    };

    return {
      command: "java",
      argsPrefix: ["-jar", jarPath, "--globalVersion", version],
      env,
    };
  }

  private readSdkVersion(globalJsonPath: string) {
    const raw = readFileSync(globalJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version !== "string" || parsed.version.trim().length === 0) {
      throw new Error(`Unable to resolve SDK version from ${globalJsonPath}`);
    }
    return parsed.version.trim();
  }

  private async writeRuntimeSdkConfig(sdkRoot: string, workspace: string) {
    const normalize = (path: string) => path.replaceAll("\\", "/");
    const pihPath = join(workspace, "pih.txt");
    await writeFile(pihPath, firstPreviousInvoiceHash(), "utf8");
    const config = {
      xsdPath: normalize(
        join(
          sdkRoot,
          "Data",
          "Schemas",
          "xsds",
          "UBL2.1",
          "xsd",
          "maindoc",
          "UBL-Invoice-2.1.xsd",
        ),
      ),
      enSchematron: normalize(
        join(sdkRoot, "Data", "Rules", "Schematrons", "CEN-EN16931-UBL.xsl"),
      ),
      zatcaSchematron: normalize(
        join(
          sdkRoot,
          "Data",
          "Rules",
          "Schematrons",
          "20210819_ZATCA_E-invoice_Validation_Rules.xsl",
        ),
      ),
      certPath: normalize(join(sdkRoot, "Data", "Certificates", "cert.pem")),
      privateKeyPath: normalize(
        join(sdkRoot, "Data", "Certificates", "ec-secp256k1-priv-key.pem"),
      ),
      pihPath: normalize(pihPath),
      inputPath: normalize(join(sdkRoot, "Data", "Input")),
      usagePathFile: normalize(join(sdkRoot, "Configuration", "usage.txt")),
    };
    const filePath = join(workspace, "sdk-config.json");
    await writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
    return filePath;
  }

  private resolveSdkRoot() {
    const suffix = join("reference", "zatca-einvoicing-sdk-Java-238-R3.4.8");
    const candidates = [
      resolve(process.cwd(), suffix),
      resolve(process.cwd(), "..", suffix),
      resolve(process.cwd(), "..", "..", suffix),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      `Unable to locate SDK root. Looked for '${suffix}' relative to ${process.cwd()}.`,
    );
  }

  private loadSigningMaterial() {
    const sdkRoot = this.resolveSdkRoot();
    const certBase64 = readFileSync(
      join(sdkRoot, "Data", "Certificates", "cert.pem"),
      "utf8",
    ).trim();
    const privateKeyBase64 = readFileSync(
      join(sdkRoot, "Data", "Certificates", "ec-secp256k1-priv-key.pem"),
      "utf8",
    ).trim();

    const certificatePem = [
      "-----BEGIN CERTIFICATE-----",
      ...(certBase64.match(/.{1,64}/g) ?? []),
      "-----END CERTIFICATE-----",
    ].join("\n");
    const privateKeyPem = [
      "-----BEGIN EC PRIVATE KEY-----",
      ...(privateKeyBase64.match(/.{1,64}/g) ?? []),
      "-----END EC PRIVATE KEY-----",
    ].join("\n");

    return {
      privateKeyPem,
      certificatePem,
    };
  }
}

async function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 16,
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

export function createSdkParityServiceForTests(
  executor: CommandExecutor,
  cryptoService?: ComplianceCryptoService,
) {
  return new SdkParityService(cryptoService, executor);
}
