import { BadRequestException, Injectable } from "@nestjs/common";
import {
  createHash,
  createSign,
  webcrypto,
} from "node:crypto";
import * as x509 from "@peculiar/x509";
import {
  DOMParser,
  type Element as XmlElement,
  type Node as XmlNode,
} from "@xmldom/xmldom";
import { C14nCanonicalizationXml11 } from "xml-crypto-next";
import {
  buildInvoiceSignatureExtensionXml,
  injectSignatureExtensionIntoInvoiceXml,
} from "./compliance-ubl";

export type GeneratedComplianceCsr = {
  privateKeyPem: string;
  publicKeyPem: string;
  csrPem: string;
  csrBase64: string;
};

export type GeneratedCompliancePhase2Signature = {
  invoiceHash: string;
  xmlSignature: string;
  signedPropertiesHash: string;
  certificateDigest: string;
  certificateBase64: string;
  issuerName: string;
  serialNumber: string;
  signingTimeIso: string;
  publicKey: string;
  technicalStamp: string;
  signatureExtensionXml: string;
  signedXmlContent: string;
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

const xadesTimeFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const ublExtensionNamespace =
  "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2";
const ublAggregateNamespace =
  "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
const ublBasicNamespace =
  "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";

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

  computePhase2InvoiceHash(xmlContent: string) {
    const transformed = this.canonicalizedInvoiceContentForPhase2(xmlContent);
    return createHash("sha256").update(transformed, "utf8").digest("base64");
  }

  async signPhase2Invoice(input: {
    xmlContent: string;
    privateKeyPem: string;
    certificatePem: string;
    invoiceHash?: string | null;
    signingTime?: Date;
  }): Promise<GeneratedCompliancePhase2Signature> {
    const invoiceHash =
      input.invoiceHash?.trim() || this.computePhase2InvoiceHash(input.xmlContent);
    const certificate = this.parseCertificate(input.certificatePem);
    const certificateBase64 = Buffer.from(certificate.rawData).toString("base64");
    const certificateDigest = createHash("sha256")
      .update(Buffer.from(certificate.rawData))
      .digest("base64");
    const issuerName = certificate.issuer;
    const serialNumber = this.normalizeSerialNumber(certificate.serialNumber);
    const signingTimeIso = this.toXadesSigningTime(
      input.signingTime ?? new Date(),
    );

    const signedPropertiesXml = [
      '<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">',
      "  <xades:SignedSignatureProperties>",
      `    <xades:SigningTime>${this.escapeXml(signingTimeIso)}</xades:SigningTime>`,
      "    <xades:SigningCertificate>",
      "      <xades:Cert>",
      "        <xades:CertDigest>",
      '          <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
      `          <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${this.escapeXml(certificateDigest)}</ds:DigestValue>`,
      "        </xades:CertDigest>",
      "        <xades:IssuerSerial>",
      `          <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${this.escapeXml(issuerName)}</ds:X509IssuerName>`,
      `          <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${this.escapeXml(serialNumber)}</ds:X509SerialNumber>`,
      "        </xades:IssuerSerial>",
      "      </xades:Cert>",
      "    </xades:SigningCertificate>",
      "  </xades:SignedSignatureProperties>",
      "</xades:SignedProperties>",
    ].join("\n");
    const signedPropertiesHash = createHash("sha256")
      .update(this.canonicalizeXml(signedPropertiesXml), "utf8")
      .digest("base64");

    const signedInfo = [
      '<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
      '  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>',
      '  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>',
      '  <ds:Reference Id="invoiceSignedData" URI="">',
      "    <ds:Transforms>",
      '      <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
      "        <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>",
      "      </ds:Transform>",
      '      <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
      "        <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>",
      "      </ds:Transform>",
      '      <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
      "        <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>",
      "      </ds:Transform>",
      '      <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>',
      "    </ds:Transforms>",
      '    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
      `    <ds:DigestValue>${this.escapeXml(invoiceHash)}</ds:DigestValue>`,
      "  </ds:Reference>",
      '  <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">',
      '    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
      `    <ds:DigestValue>${this.escapeXml(signedPropertiesHash)}</ds:DigestValue>`,
      "  </ds:Reference>",
      "</ds:SignedInfo>",
    ].join("\n");

    const canonicalizedSignedInfo = this.canonicalizeXml(signedInfo);
    const signer = createSign("sha256");
    signer.update(canonicalizedSignedInfo, "utf8");
    signer.end();
    const xmlSignature = signer.sign(input.privateKeyPem).toString("base64");
    const publicKey = Buffer.from(certificate.publicKey.rawData).toString("base64");
    const technicalStamp = createHash("sha256")
      .update(certificateBase64)
      .digest("base64");
    const signatureExtensionXml = buildInvoiceSignatureExtensionXml({
      invoiceDigestValue: invoiceHash,
      signedPropertiesDigestValue: signedPropertiesHash,
      signatureValue: xmlSignature,
      certificateBase64,
      certificateDigestValue: certificateDigest,
      issuerName,
      serialNumber,
      signingTimeIso,
    });
    const signedXmlContent = injectSignatureExtensionIntoInvoiceXml(
      input.xmlContent,
      signatureExtensionXml,
    );

    return {
      invoiceHash,
      xmlSignature,
      signedPropertiesHash,
      certificateDigest,
      certificateBase64,
      issuerName,
      serialNumber,
      signingTimeIso,
      publicKey,
      technicalStamp,
      signatureExtensionXml,
      signedXmlContent,
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

  private canonicalizedInvoiceContentForPhase2(xmlContent: string) {
    const root = this.parseXmlRoot(xmlContent, "invoice XML");
    this.removeExcludedPhase2Nodes(root);
    return this.canonicalizeNode(root);
  }

  private canonicalizeXml(xml: string) {
    return this.canonicalizeNode(this.parseXmlRoot(xml, "XML fragment"));
  }

  private parseXmlRoot(
    xmlContent: string,
    context: string,
  ): XmlElement {
    const parseErrors: string[] = [];
    const parser = new DOMParser({
      onError: (level, message) => {
        if (level === "warning") {
          return;
        }
        parseErrors.push(String(message));
      },
    });
    const document = parser.parseFromString(xmlContent, "application/xml");
    const parserErrorNodes = document.getElementsByTagName("parsererror");
    const root = document.documentElement;

    if (
      parseErrors.length > 0 ||
      parserErrorNodes.length > 0 ||
      !root
    ) {
      const message =
        parseErrors[0] ??
        parserErrorNodes.item(0)?.textContent?.trim() ??
        "Unknown XML parse failure.";
      throw new BadRequestException(`Unable to parse ${context}: ${message}`);
    }

    return root;
  }

  private canonicalizeNode(node: XmlNode) {
    return new C14nCanonicalizationXml11().process(node as unknown as Node, {});
  }

  private removeExcludedPhase2Nodes(node: XmlNode) {
    let child = node.firstChild;
    while (child) {
      const next = child.nextSibling;
      if (child.nodeType === 1) {
        const element = child as XmlElement;
        if (this.shouldExcludeFromPhase2Hash(element)) {
          node.removeChild(child);
        } else {
          this.removeExcludedPhase2Nodes(element);
        }
      }
      child = next;
    }
  }

  private shouldExcludeFromPhase2Hash(element: XmlElement) {
    if (
      element.localName === "UBLExtensions" &&
      element.namespaceURI === ublExtensionNamespace
    ) {
      return true;
    }

    if (
      element.localName === "Signature" &&
      element.namespaceURI === ublAggregateNamespace
    ) {
      return true;
    }

    if (
      element.localName === "AdditionalDocumentReference" &&
      element.namespaceURI === ublAggregateNamespace &&
      this.isQrAdditionalDocumentReference(element)
    ) {
      return true;
    }

    return false;
  }

  private isQrAdditionalDocumentReference(element: XmlElement) {
    let child = element.firstChild;
    while (child) {
      if (child.nodeType === 1) {
        const childElement = child as XmlElement;
        if (
          childElement.localName === "ID" &&
          childElement.namespaceURI === ublBasicNamespace &&
          (childElement.textContent ?? "").trim() === "QR"
        ) {
          return true;
        }
      }
      child = child.nextSibling;
    }

    return false;
  }

  private parseCertificate(certificatePem: string) {
    const normalized = certificatePem.trim();
    if (!normalized) {
      throw new BadRequestException("certificatePem is required for Phase 2 signing.");
    }

    try {
      return new x509.X509Certificate(normalized);
    } catch (error) {
      throw new BadRequestException(
        `certificatePem is not a valid X509 certificate: ${
          error instanceof Error ? error.message : "unknown parse failure"
        }`,
      );
    }
  }

  private normalizeSerialNumber(serialNumberHex: string) {
    const normalized = serialNumberHex.replace(/^0x/i, "");
    if (!normalized) {
      return "0";
    }

    return BigInt(`0x${normalized}`).toString(10);
  }

  private toXadesSigningTime(date: Date) {
    const iso = date.toISOString().slice(0, 19);
    if (xadesTimeFormat.test(iso)) {
      return iso;
    }
    return new Date().toISOString().slice(0, 19);
  }

  private escapeXml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }
}
