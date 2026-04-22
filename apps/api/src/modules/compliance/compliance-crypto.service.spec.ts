import { BadRequestException } from "@nestjs/common";
import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as x509 from "@peculiar/x509";

import { buildInvoiceXml } from "./compliance-core";
import { ComplianceCryptoService } from "./compliance-crypto.service";

describe("compliance-crypto.service", () => {
  const service = new ComplianceCryptoService();
  const baseInput = {
    commonName: " Nomad Events EGS ",
    organizationName: " Nomad Events Arabia Limited ",
    organizationUnitName: " Riyadh Operations ",
    vatNumber: "300123456700003",
    countryCode: "sa",
    deviceSerial: "EGS-UNIT-01",
  };

  function sampleCertificatePem() {
    const base64 = readFileSync(
      resolve(
        process.cwd(),
        "../../reference/zatca-einvoicing-sdk-Java-238-R3.4.8/Data/Certificates/cert.pem",
      ),
      "utf8",
    ).trim();
    const chunks = base64.match(/.{1,64}/g) ?? [];
    return [
      "-----BEGIN CERTIFICATE-----",
      ...chunks,
      "-----END CERTIFICATE-----",
    ].join("\n");
  }

  function sampleInvoiceXml(overrides?: { qrPayload?: string }) {
    return buildInvoiceXml({
      uuid: "77572885-4f3e-4e5a-ab6f-1f3e0db0fef4",
      invoiceNumber: "INV-NE-CRYPTO-0001",
      invoiceKind: "SIMPLIFIED",
      submissionFlow: "REPORTING",
      issueDateIso: "2026-04-18T10:00:00.000Z",
      invoiceCounter: 7,
      previousHash: "previous-hash-base64",
      qrPayload: overrides?.qrPayload ?? "qr-payload-a",
      currencyCode: "SAR",
      seller: {
        registrationName: "Nomad Events Arabia Limited",
        taxNumber: "300123456700003",
        registrationNumber: "1010010000",
        address: {
          streetName: "Prince Sultan",
          cityName: "Riyadh",
          postalZone: "12211",
          countryCode: "SA",
        },
      },
      buyer: {
        registrationName: "Al Noor Hospitality",
        taxNumber: "300765432100003",
        address: {
          streetName: "Salah Al-Din",
          cityName: "Riyadh",
          postalZone: "12222",
          countryCode: "SA",
        },
      },
      subtotal: "100.00",
      taxTotal: "15.00",
      total: "115.00",
      lines: [
        {
          description: "Event package",
          quantity: "1.00",
          unitPrice: "100.00",
          lineExtensionAmount: "100.00",
          taxAmount: "15.00",
          taxRatePercent: "15.00",
          taxRateName: "VAT 15%",
        },
      ],
    });
  }

  it("generates a real CSR and keypair with verifiable signature and subject fields", async () => {
    const generated = await service.generateCsr(baseInput);

    expect(generated.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(generated.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(generated.csrPem).toContain("BEGIN CERTIFICATE REQUEST");
    expect(generated.csrPem).not.toContain("placeholder");

    const csr = new x509.Pkcs10CertificateRequest(generated.csrPem);
    expect(await csr.verify(webcrypto as Crypto)).toBe(true);

    const subject = csr.subjectName;
    expect(subject.getField("CN")).toEqual(["Nomad Events EGS"]);
    expect(subject.getField("O")).toEqual(["Nomad Events Arabia Limited"]);
    expect(subject.getField("OU")).toEqual(["Riyadh Operations"]);
    expect(subject.getField("C")).toEqual(["SA"]);
    expect(subject.getField("2.5.4.5")).toEqual([
      "300123456700003-EGS-UNIT-01",
    ]);

    const publicKeyDer = x509.PemConverter.decodeFirst(generated.publicKeyPem);
    expect(
      Buffer.from(publicKeyDer).equals(Buffer.from(csr.publicKey.rawData)),
    ).toBe(true);

    expect(generated.csrBase64).toBe(Buffer.from(csr.rawData).toString("base64"));
  });

  it("rejects invalid VAT number and country code", async () => {
    await expect(
      service.generateCsr({
        ...baseInput,
        vatNumber: "300123",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.generateCsr({
        ...baseInput,
        countryCode: "SAU",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("generates canonical invoice hash independent from signature and QR nodes", async () => {
    const xml = sampleInvoiceXml({ qrPayload: "qr-payload-a" });
    const mutated = xml
      .replace("qr-payload-a", "qr-payload-b")
      .replace(
        "<ext:ExtensionContent/>",
        "<ext:ExtensionContent><sig:Stub xmlns:sig=\"urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2\">updated</sig:Stub></ext:ExtensionContent>",
      )
      .replace(
        "<cac:Signature>\n      <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>\n      <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>\n    </cac:Signature>",
        "<cac:Signature><cbc:ID>modified-signature</cbc:ID></cac:Signature>",
      );

    expect(service.computePhase2InvoiceHash(xml)).toBe(
      service.computePhase2InvoiceHash(mutated),
    );
  });

  it("produces xades-style signature material and injects it into invoice XML", async () => {
    const generated = await service.generateCsr(baseInput);
    const xml = sampleInvoiceXml();
    const signed = await service.signPhase2Invoice({
      xmlContent: xml,
      privateKeyPem: generated.privateKeyPem,
      certificatePem: sampleCertificatePem(),
    });

    expect(signed.invoiceHash).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(signed.xmlSignature).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(signed.publicKey).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(signed.technicalStamp).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(signed.signedXmlContent).toContain("<ds:SignatureValue>");
    expect(signed.signedXmlContent).toContain("<xades:SignedProperties");
    expect(signed.signedXmlContent).toContain("<ds:X509Certificate>");
  });
});
