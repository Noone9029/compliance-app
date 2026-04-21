import { BadRequestException, Injectable } from "@nestjs/common";
import { webcrypto } from "node:crypto";
import * as x509 from "@peculiar/x509";

export type GeneratedComplianceCsr = {
  privateKeyPem: string;
  publicKeyPem: string;
  csrPem: string;
  csrBase64: string;
};

type ComplianceCsrInput = {
  commonName: string;
  organizationName: string;
  organizationUnitName?: string;
  vatNumber: string;
  countryCode: string;
  deviceSerial: string;
};

const ecdsaKeyAlgorithm = {
  name: "ECDSA",
  namedCurve: "P-256",
} as const;

const ecdsaSigningAlgorithm = {
  name: "ECDSA",
  hash: "SHA-256",
} as const;

@Injectable()
export class ComplianceCryptoService {
  async generateCsr(input: ComplianceCsrInput): Promise<GeneratedComplianceCsr> {
    const normalized = this.normalizeInput(input);
    const keys = (await webcrypto.subtle.generateKey(
      ecdsaKeyAlgorithm,
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;

    const subjectName = [
      `CN=${this.escapeRdn(normalized.commonName)}`,
      `O=${this.escapeRdn(normalized.organizationName)}`,
      normalized.organizationUnitName
        ? `OU=${this.escapeRdn(normalized.organizationUnitName)}`
        : null,
      `C=${this.escapeRdn(normalized.countryCode)}`,
      `2.5.4.5=${this.escapeRdn(
        `${normalized.vatNumber}-${normalized.deviceSerial}`,
      )}`,
    ]
      .filter((segment): segment is string => Boolean(segment))
      .join(", ");

    const csr = await x509.Pkcs10CertificateRequestGenerator.create(
      {
        name: subjectName,
        keys,
        signingAlgorithm: ecdsaSigningAlgorithm,
      },
      webcrypto as Crypto,
    );

    const [pkcs8PrivateKey, spkiPublicKey] = await Promise.all([
      webcrypto.subtle.exportKey("pkcs8", keys.privateKey),
      webcrypto.subtle.exportKey("spki", keys.publicKey),
    ]);

    const privateKeyPem = x509.PemConverter.encode(
      pkcs8PrivateKey,
      x509.PemConverter.PrivateKeyTag,
    ).trim();
    const publicKeyPem = x509.PemConverter.encode(
      spkiPublicKey,
      x509.PemConverter.PublicKeyTag,
    ).trim();
    const csrPem = csr.toString("pem").trim();
    const csrBase64 = Buffer.from(csr.rawData).toString("base64");

    return {
      privateKeyPem,
      publicKeyPem,
      csrPem,
      csrBase64,
    };
  }

  private normalizeInput(input: ComplianceCsrInput) {
    const commonName = this.requireText(input.commonName, "commonName");
    const organizationName = this.requireText(
      input.organizationName,
      "organizationName",
    );
    const organizationUnitName = input.organizationUnitName?.trim() || undefined;
    const vatNumber = this.requireText(input.vatNumber, "vatNumber");
    const countryCode = this.requireText(input.countryCode, "countryCode")
      .toUpperCase();
    const deviceSerial = this.requireText(input.deviceSerial, "deviceSerial");

    if (!/^\d{15}$/.test(vatNumber)) {
      throw new BadRequestException(
        "vatNumber must contain exactly 15 numeric digits.",
      );
    }

    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new BadRequestException(
        "countryCode must be a 2-letter ISO country code.",
      );
    }

    if (deviceSerial.length < 3 || deviceSerial.length > 128) {
      throw new BadRequestException(
        "deviceSerial must be between 3 and 128 characters.",
      );
    }

    return {
      commonName,
      organizationName,
      organizationUnitName,
      vatNumber,
      countryCode,
      deviceSerial,
    };
  }

  private requireText(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }
    return normalized;
  }

  private escapeRdn(value: string) {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/([,=+<>#;])/g, "\\$1");
  }
}
