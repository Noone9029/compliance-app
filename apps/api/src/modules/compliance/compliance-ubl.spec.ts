import { describe, expect, it } from "vitest";

import { buildInvoiceXml, type BuildInvoiceXmlInput } from "./compliance-ubl";

function createInput(
  overrides?: Partial<BuildInvoiceXmlInput>,
): BuildInvoiceXmlInput {
  return {
    uuid: "bde6f49d-0cd8-4a09-8f50-f57d4c9b6368",
    invoiceNumber: "INV-2026-0001",
    invoiceKind: "STANDARD",
    submissionFlow: "CLEARANCE",
    issueDateIso: "2026-04-12T09:00:00.000Z",
    invoiceCounter: 23,
    previousHash: "previous-invoice-hash-base64",
    qrPayload: "qr-payload-base64",
    currencyCode: "SAR",
    seller: {
      registrationName: "Nomad Events Arabia Limited",
      taxNumber: "300123456700003",
      registrationNumber: "1010010000",
      address: {
        streetName: "Prince Sultan",
        buildingNumber: "2322",
        citySubdivisionName: "Al-Murabba",
        additionalStreetName: "Al-Murabba",
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
        buildingNumber: "1111",
        citySubdivisionName: "Al-Murooj",
        cityName: "Riyadh",
        postalZone: "12222",
        countryCode: "SA",
      },
    },
    deliveryDateIso: "2026-04-12T09:00:00.000Z",
    paymentMeansCode: "10",
    subtotal: "100.00",
    taxTotal: "15.00",
    total: "115.00",
    lines: [
      {
        description: "Event service package",
        quantity: "2.00",
        unitPrice: "50.00",
        lineExtensionAmount: "100.00",
        taxAmount: "15.00",
        taxRatePercent: "15.00",
        taxRateName: "VAT 15%",
      },
    ],
    ...overrides,
  };
}

describe("compliance-ubl", () => {
  it("generates structurally valid standard invoice UBL XML", () => {
    const xml = buildInvoiceXml(createInput());

    expect(xml).toContain(
      'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
    );
    expect(xml).toContain(
      'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    );
    expect(xml).toContain(
      'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
    );
    expect(xml).toContain("<cbc:ProfileID>reporting:1.0</cbc:ProfileID>");
    expect(xml).toContain(
      '<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>',
    );
    expect(xml).toContain("<cac:AccountingSupplierParty>");
    expect(xml).toContain("<cbc:BuildingNumber>2322</cbc:BuildingNumber>");
    expect(xml).toContain("<cbc:CitySubdivisionName>Al-Murabba</cbc:CitySubdivisionName>");
    expect(xml).toContain("<cbc:IdentificationCode>SA</cbc:IdentificationCode>");
    expect(xml).toContain("<cac:AccountingCustomerParty>");
    expect(xml).toContain("<cac:TaxTotal>");
    expect(xml).toContain("<cac:LegalMonetaryTotal>");
    expect(xml).toContain("<cac:InvoiceLine>");
  });

  it("generates simplified invoice XML with reporting invoice type", () => {
    const xml = buildInvoiceXml(
      createInput({
        invoiceKind: "SIMPLIFIED",
        submissionFlow: "REPORTING",
        deliveryDateIso: null,
        paymentMeansCode: null,
      }),
    );

    expect(xml).toContain(
      '<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>',
    );
    expect(xml).toContain("<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>");
    expect(xml).not.toContain("<cac:PaymentMeans>");
    expect(xml).not.toContain("<cbc:ActualDeliveryDate>");
  });

  it("embeds invoiceCounter, previous hash, and QR references", () => {
    const xml = buildInvoiceXml(createInput());

    expect(xml).toContain("<cbc:ID>ICV</cbc:ID>");
    expect(xml).toContain("<cbc:UUID>23</cbc:UUID>");
    expect(xml).toContain("<cbc:ID>PIH</cbc:ID>");
    expect(xml).toContain("previous-invoice-hash-base64");
    expect(xml).toContain("<cbc:ID>QR</cbc:ID>");
    expect(xml).toContain("qr-payload-base64");
  });

  it("maps credit and debit note type codes when requested", () => {
    const creditXml = buildInvoiceXml(
      createInput({
        documentType: "CREDIT_NOTE",
      }),
    );
    const debitXml = buildInvoiceXml(
      createInput({
        documentType: "DEBIT_NOTE",
      }),
    );

    expect(creditXml).toContain(
      '<cbc:InvoiceTypeCode name="0100000">381</cbc:InvoiceTypeCode>',
    );
    expect(debitXml).toContain(
      '<cbc:InvoiceTypeCode name="0100000">383</cbc:InvoiceTypeCode>',
    );
  });

  it("is deterministic for the same input", () => {
    const input = createInput();
    const first = buildInvoiceXml(input);
    const second = buildInvoiceXml(input);

    expect(first).toBe(second);
  });
});
