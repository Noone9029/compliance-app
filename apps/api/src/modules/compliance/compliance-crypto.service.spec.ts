import { BadRequestException } from "@nestjs/common";
import { Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as x509 from "@peculiar/x509";

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
});
