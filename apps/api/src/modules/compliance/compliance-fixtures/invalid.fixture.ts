import type { ComplianceParityFixture } from "./types";

export const invalidFixture: ComplianceParityFixture = {
  id: "invalid-case",
  title: "Invalid Invoice (Missing UUID Node)",
  expectedValidation: "FAILED",
  strictParity: false,
  mutateSignedXml: (xml) => xml.replace(/<cbc:UUID>[\s\S]*?<\/cbc:UUID>/, ""),
  invoice: {
    invoiceNumber: "INV-PARITY-INVALID-0001",
    invoiceKind: "SIMPLIFIED",
    submissionFlow: "REPORTING",
    issueDateIso: "2026-04-22T15:00:00.000Z",
    currencyCode: "SAR",
    seller: {
      registrationName: "Maximum Speed Tech Supply LTD",
      taxNumber: "399999999900003",
      registrationNumber: "1010010000",
      address: {
        streetName: "Prince Sultan",
        cityName: "Riyadh",
        postalZone: "23333",
        countryCode: "SA",
      },
    },
    buyer: null,
    deliveryDateIso: "2026-04-22T15:00:00.000Z",
    paymentMeansCode: "10",
    subtotal: "25.00",
    taxTotal: "3.75",
    total: "28.75",
    note: "Invalid parity fixture",
    lines: [
      {
        description: "Broken fixture line",
        quantity: "1.00",
        unitPrice: "25.00",
        lineExtensionAmount: "25.00",
        taxAmount: "3.75",
        taxRatePercent: "15.00",
        taxRateName: "VAT 15%",
      },
    ],
  },
};
