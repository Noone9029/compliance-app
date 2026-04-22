import type { ComplianceParityFixture } from "./types";

export const simplifiedFixture: ComplianceParityFixture = {
  id: "simplified-invoice",
  title: "Simplified Invoice",
  expectedValidation: "PASSED",
  strictParity: true,
  invoice: {
    invoiceNumber: "INV-PARITY-SIM-0001",
    invoiceKind: "SIMPLIFIED",
    submissionFlow: "REPORTING",
    issueDateIso: "2026-04-22T11:00:00",
    currencyCode: "SAR",
    seller: {
      registrationName: "Maximum Speed Tech Supply LTD",
      taxNumber: "399999999900003",
      registrationNumber: "1010010000",
      address: {
        streetName: "Prince Sultan",
        buildingNumber: "2322",
        citySubdivisionName: "Al Murabba",
        additionalStreetName: "Al Murabba",
        cityName: "Riyadh",
        postalZone: "23333",
        countryCode: "SA",
      },
    },
    buyer: null,
    deliveryDateIso: "2026-04-22T11:00:00.000Z",
    paymentMeansCode: "10",
    subtotal: "100.00",
    taxTotal: "15.00",
    total: "115.00",
    note: "Simplified parity fixture",
    lines: [
      {
        description: "Retail sale item",
        quantity: "1.00",
        unitPrice: "100.00",
        lineExtensionAmount: "100.00",
        taxAmount: "15.00",
        taxRatePercent: "15.00",
        taxRateName: "VAT 15%",
      },
    ],
  },
};
