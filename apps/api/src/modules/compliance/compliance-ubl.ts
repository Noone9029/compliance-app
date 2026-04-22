import type {
  ComplianceInvoiceKind,
  ComplianceSubmissionFlow,
} from "@daftar/types";

type InvoiceDocumentType = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "PREPAYMENT";

type InvoiceTypeFlags = {
  thirdParty?: boolean;
  nominal?: boolean;
  export?: boolean;
  summary?: boolean;
  selfBilled?: boolean;
};

export type BuildInvoiceXmlAddressInput = {
  streetName?: string | null;
  buildingNumber?: string | null;
  citySubdivisionName?: string | null;
  additionalStreetName?: string | null;
  cityName?: string | null;
  postalZone?: string | null;
  countryCode?: string | null;
};

export type BuildInvoiceXmlPartyInput = {
  registrationName: string;
  taxNumber?: string | null;
  registrationNumber?: string | null;
  address?: BuildInvoiceXmlAddressInput | null;
};

export type BuildInvoiceXmlLineInput = {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  lineExtensionAmount: number | string;
  taxAmount: number | string;
  taxRatePercent: number | string;
  taxRateName?: string | null;
  taxExemptionReasonCode?: string | null;
  taxExemptionReason?: string | null;
  unitCode?: string | null;
};

export type BuildInvoiceXmlInput = {
  uuid: string;
  invoiceNumber: string;
  invoiceKind: ComplianceInvoiceKind;
  submissionFlow: ComplianceSubmissionFlow;
  issueDateIso: string;
  invoiceCounter: number;
  previousHash: string;
  qrPayload: string;
  currencyCode: string;
  seller: BuildInvoiceXmlPartyInput;
  buyer?: BuildInvoiceXmlPartyInput | null;
  deliveryDateIso?: string | null;
  paymentMeansCode?: string | null;
  paymentInstructionNote?: string | null;
  billingReferenceId?: string | null;
  subtotal: number | string;
  taxTotal: number | string;
  total: number | string;
  lines: BuildInvoiceXmlLineInput[];
  note?: string | null;
  documentType?: InvoiceDocumentType;
  typeFlags?: InvoiceTypeFlags;
};

export type UblInvoiceSignatureInput = {
  invoiceDigestValue: string;
  signedPropertiesDigestValue: string;
  signatureValue: string;
  certificateBase64: string;
  certificateDigestValue: string;
  issuerName: string;
  serialNumber: string;
  signingTimeIso: string;
};

type XmlNode = {
  name: string;
  attributes?: Record<string, string>;
  children?: Array<XmlNode | string>;
};

type UblInvoiceTypeCode = {
  code: "388" | "381" | "383" | "386";
  name: string;
};

type UblTaxSubtotal = {
  categoryCode: "S" | "Z" | "E" | "O";
  percent: string;
  taxableAmount: string;
  taxAmount: string;
  taxExemptionReasonCode: string | null;
  taxExemptionReason: string | null;
};

type UblInvoiceLine = {
  id: string;
  quantity: string;
  unitCode: string;
  lineExtensionAmount: string;
  taxAmount: string;
  roundingAmount: string;
  itemName: string;
  taxCategoryCode: "S" | "Z" | "E" | "O";
  taxPercent: string;
  taxExemptionReasonCode: string | null;
  taxExemptionReason: string | null;
  priceAmount: string;
};

type UblAddress = {
  streetName: string | null;
  buildingNumber: string | null;
  citySubdivisionName: string | null;
  additionalStreetName: string | null;
  cityName: string | null;
  postalZone: string | null;
  countryCode: string;
};

type UblParty = {
  registrationName: string;
  taxNumber: string | null;
  registrationNumber: string | null;
  address: UblAddress | null;
};

type UblInvoiceModel = {
  profileId: string;
  id: string;
  uuid: string;
  issueDate: string;
  issueTime: string;
  invoiceTypeCode: UblInvoiceTypeCode;
  currencyCode: string;
  invoiceCounter: string;
  previousInvoiceHash: string;
  qrPayload: string;
  seller: UblParty;
  buyer: UblParty | null;
  deliveryDate: string | null;
  paymentMeansCode: string | null;
  paymentInstructionNote: string | null;
  billingReferenceId: string | null;
  taxTotal: string;
  legalMonetaryTotal: {
    lineExtensionAmount: string;
    taxExclusiveAmount: string;
    taxInclusiveAmount: string;
    allowanceTotalAmount: string;
    prepaidAmount: string;
    payableAmount: string;
  };
  taxSubtotals: UblTaxSubtotal[];
  lines: UblInvoiceLine[];
  note: string | null;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null | undefined) {
  return asNumber(value).toFixed(2);
}

function quantity(value: number | string | null | undefined) {
  return asNumber(value).toFixed(6);
}

function normalizeIssueDateParts(issueDateIso: string) {
  const explicitSecondPrecision = issueDateIso.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})$/,
  );
  if (explicitSecondPrecision) {
    return {
      issueDate: explicitSecondPrecision[1],
      issueTime: explicitSecondPrecision[2],
    };
  }

  const issuedAt = new Date(issueDateIso);
  if (Number.isNaN(issuedAt.valueOf())) {
    return {
      issueDate: issueDateIso.slice(0, 10),
      issueTime: issueDateIso.slice(11, 19) || "00:00:00",
    };
  }

  const iso = issuedAt.toISOString();
  return {
    issueDate: iso.slice(0, 10),
    issueTime: iso.slice(11, 19),
  };
}

function normalizeCountryCode(value: string | null | undefined) {
  return (value ?? "SA").trim().toUpperCase() || "SA";
}

type NormalizeAddressOptions = {
  requireKsaCoreFields?: boolean;
  forceCountryCode?: string | null;
};

function normalizeAddress(
  input: BuildInvoiceXmlAddressInput | null | undefined,
  options: NormalizeAddressOptions = {},
): UblAddress | null {
  const streetName = input?.streetName?.trim() || null;
  const buildingNumber = input?.buildingNumber?.trim() || null;
  const citySubdivisionName = input?.citySubdivisionName?.trim() || null;
  const additionalStreetName = input?.additionalStreetName?.trim() || null;
  const cityName = input?.cityName?.trim() || null;
  const postalZone = input?.postalZone?.trim() || null;
  const countryCode = normalizeCountryCode(options.forceCountryCode ?? input?.countryCode);

  if (options.requireKsaCoreFields) {
    return {
      streetName: streetName ?? "Unknown Street",
      buildingNumber: buildingNumber ?? "0000",
      citySubdivisionName:
        citySubdivisionName ?? additionalStreetName ?? cityName ?? "Unknown District",
      additionalStreetName,
      cityName: cityName ?? "Riyadh",
      postalZone: postalZone ?? "00000",
      countryCode: normalizeCountryCode(options.forceCountryCode ?? "SA"),
    };
  }

  const hasDetails = Boolean(
    streetName
      || buildingNumber
      || citySubdivisionName
      || additionalStreetName
      || cityName
      || postalZone,
  );

  if (!hasDetails) {
    return null;
  }

  return {
    streetName,
    buildingNumber,
    citySubdivisionName,
    additionalStreetName,
    cityName,
    postalZone,
    countryCode,
  };
}

type NormalizePartyOptions = {
  requireAddress?: boolean;
  requireKsaCoreFields?: boolean;
  forceCountryCode?: string | null;
};

function normalizeParty(
  input: BuildInvoiceXmlPartyInput | null | undefined,
  options: NormalizePartyOptions = {},
): UblParty | null {
  if (!input) {
    return null;
  }

  const address = normalizeAddress(input.address, {
    requireKsaCoreFields: options.requireKsaCoreFields,
    forceCountryCode: options.forceCountryCode,
  });
  if (options.requireAddress && !address) {
    throw new Error("Seller address details are required for invoice XML generation.");
  }

  return {
    registrationName: input.registrationName.trim() || "Unknown",
    taxNumber: input.taxNumber?.trim() || null,
    registrationNumber: input.registrationNumber?.trim() || null,
    address,
  };
}

function vatCategoryCode(percent: number, taxRateName: string | null | undefined) {
  if (percent > 0) {
    return "S" as const;
  }

  const normalized = (taxRateName ?? "").toLowerCase();
  if (normalized.includes("exempt")) {
    return "E" as const;
  }
  if (normalized.includes("out of scope") || normalized.includes("outside scope")) {
    return "O" as const;
  }

  return "Z" as const;
}

function defaultTaxExemptionForCategory(categoryCode: "Z" | "E" | "O") {
  if (categoryCode === "E") {
    return {
      code: "VATEX-SA-29",
      reason: "VAT exempt supply",
    };
  }

  if (categoryCode === "O") {
    return {
      code: "VATEX-SA-OOS",
      reason: "Services outside scope of tax",
    };
  }

  return {
    code: "VATEX-SA-35",
    reason: "Medicines and medical equipment",
  };
}

function invoiceTypeName(invoiceKind: ComplianceInvoiceKind, flags?: InvoiceTypeFlags) {
  const prefix = invoiceKind === "STANDARD" ? "01" : "02";
  const suffix = [
    flags?.thirdParty ? "1" : "0",
    flags?.nominal ? "1" : "0",
    flags?.export ? "1" : "0",
    flags?.summary ? "1" : "0",
    flags?.selfBilled ? "1" : "0",
  ].join("");
  return `${prefix}${suffix}`;
}

function invoiceTypeCode(input: {
  documentType: InvoiceDocumentType;
  invoiceKind: ComplianceInvoiceKind;
  typeFlags?: InvoiceTypeFlags;
}): UblInvoiceTypeCode {
  const code: UblInvoiceTypeCode["code"] =
    input.documentType === "CREDIT_NOTE"
      ? "381"
      : input.documentType === "DEBIT_NOTE"
        ? "383"
        : input.documentType === "PREPAYMENT"
          ? "386"
          : "388";

  return {
    code,
    name: invoiceTypeName(input.invoiceKind, input.typeFlags),
  };
}

function buildTaxSubtotals(lines: UblInvoiceLine[]) {
  const groups = new Map<
    string,
    {
      categoryCode: UblTaxSubtotal["categoryCode"];
      percent: number;
      taxableAmount: number;
      taxAmount: number;
      taxExemptionReasonCode: string | null;
      taxExemptionReason: string | null;
    }
  >();

  for (const line of lines) {
    const percent = asNumber(line.taxPercent);
    const key = [
      line.taxCategoryCode,
      percent.toFixed(2),
      line.taxExemptionReasonCode ?? "",
      line.taxExemptionReason ?? "",
    ].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.taxableAmount += asNumber(line.lineExtensionAmount);
      existing.taxAmount += asNumber(line.taxAmount);
      continue;
    }

    groups.set(key, {
      categoryCode: line.taxCategoryCode,
      percent,
      taxableAmount: asNumber(line.lineExtensionAmount),
      taxAmount: asNumber(line.taxAmount),
      taxExemptionReasonCode: line.taxExemptionReasonCode,
      taxExemptionReason: line.taxExemptionReason,
    });
  }

  return [...groups.values()]
    .sort((left, right) => {
      if (left.percent !== right.percent) {
        return left.percent - right.percent;
      }
      return left.categoryCode.localeCompare(right.categoryCode);
    })
    .map((group) => ({
      categoryCode: group.categoryCode,
      percent: group.percent.toFixed(2),
      taxableAmount: group.taxableAmount.toFixed(2),
      taxAmount: group.taxAmount.toFixed(2),
      taxExemptionReasonCode: group.taxExemptionReasonCode,
      taxExemptionReason: group.taxExemptionReason,
    }));
}

function normalizeModel(input: BuildInvoiceXmlInput): UblInvoiceModel {
  if (input.lines.length === 0) {
    throw new Error("Invoice XML generation requires at least one invoice line.");
  }

  const seller = normalizeParty(input.seller, {
    requireAddress: true,
    requireKsaCoreFields: true,
    forceCountryCode: "SA",
  });
  if (!seller) {
    throw new Error("Seller details are required for invoice XML generation.");
  }

  const buyer = normalizeParty(input.buyer);
  const issueDateParts = normalizeIssueDateParts(input.issueDateIso);
  const documentType = input.documentType ?? "INVOICE";
  const typeCode = invoiceTypeCode({
    documentType,
    invoiceKind: input.invoiceKind,
    typeFlags: input.typeFlags,
  });
  const normalizedNote = input.note?.trim() || null;
  const normalizedPaymentInstructionNote = input.paymentInstructionNote?.trim() || null;
  const isCreditOrDebit =
    documentType === "CREDIT_NOTE" || documentType === "DEBIT_NOTE";
  const paymentInstructionNote =
    normalizedPaymentInstructionNote ?? (isCreditOrDebit ? normalizedNote : null);

  const lines = input.lines.map((line, index) => {
    const lineTaxPercent = asNumber(line.taxRatePercent);
    const lineTaxAmount = money(line.taxAmount);
    const lineExtensionAmount = money(line.lineExtensionAmount);
    const lineTotal = money(asNumber(line.lineExtensionAmount) + asNumber(line.taxAmount));
    const unitCode = line.unitCode?.trim() || "PCE";
    const categoryCode = vatCategoryCode(lineTaxPercent, line.taxRateName ?? null);
    let taxExemptionReasonCode = line.taxExemptionReasonCode?.trim() || null;
    let taxExemptionReason = line.taxExemptionReason?.trim() || null;

    if (categoryCode !== "S" && !taxExemptionReasonCode) {
      const defaults = defaultTaxExemptionForCategory(categoryCode);
      taxExemptionReasonCode = defaults.code;
      taxExemptionReason = taxExemptionReason ?? defaults.reason;
    }

    if (categoryCode === "S") {
      taxExemptionReasonCode = null;
      taxExemptionReason = null;
    }

    return {
      id: String(index + 1),
      quantity: quantity(line.quantity),
      unitCode,
      lineExtensionAmount,
      taxAmount: lineTaxAmount,
      roundingAmount: lineTotal,
      itemName: line.description.trim() || `Item ${index + 1}`,
      taxCategoryCode: categoryCode,
      taxPercent: lineTaxPercent.toFixed(2),
      taxExemptionReasonCode,
      taxExemptionReason,
      priceAmount: money(line.unitPrice),
    };
  });

  const taxSubtotals = buildTaxSubtotals(lines);
  const issueDate = issueDateParts.issueDate;
  const deliveryDate = input.deliveryDateIso
    ? normalizeIssueDateParts(input.deliveryDateIso).issueDate
    : input.invoiceKind === "STANDARD"
      ? issueDate
      : null;
  const currencyCode = (input.currencyCode || "SAR").trim().toUpperCase() || "SAR";
  const lineExtensionAmount = money(input.subtotal);
  const taxTotalAmount = money(input.taxTotal);
  const taxInclusiveAmount = money(input.total);

  return {
    profileId: "reporting:1.0",
    id: input.invoiceNumber.trim(),
    uuid: input.uuid.trim(),
    issueDate,
    issueTime: issueDateParts.issueTime,
    invoiceTypeCode: typeCode,
    currencyCode,
    invoiceCounter: String(Math.max(1, Math.trunc(input.invoiceCounter))),
    previousInvoiceHash: input.previousHash.trim(),
    qrPayload: input.qrPayload.trim(),
    seller,
    buyer,
    deliveryDate,
    paymentMeansCode: input.paymentMeansCode?.trim() || null,
    paymentInstructionNote,
    billingReferenceId: input.billingReferenceId?.trim() || null,
    taxTotal: taxTotalAmount,
    legalMonetaryTotal: {
      lineExtensionAmount,
      taxExclusiveAmount: lineExtensionAmount,
      taxInclusiveAmount,
      allowanceTotalAmount: "0.00",
      prepaidAmount: "0.00",
      payableAmount: taxInclusiveAmount,
    },
    taxSubtotals,
    lines,
    note: normalizedNote,
  };
}

function node(
  name: string,
  children?: Array<XmlNode | string | null | undefined>,
  attributes?: Record<string, string>,
): XmlNode {
  return {
    name,
    attributes,
    children: (children ?? []).filter(
      (child): child is XmlNode | string =>
        child !== null && child !== undefined && child !== "",
    ),
  };
}

function serializeNode(value: XmlNode, level = 0): string {
  const indent = "  ".repeat(level);
  const attributeEntries = value.attributes
    ? Object.entries(value.attributes).filter(([, attrValue]) => attrValue.length > 0)
    : [];
  const attributes =
    attributeEntries.length === 0
      ? ""
      : " " +
        attributeEntries
          .map(([key, attrValue]) => `${key}="${escapeXml(attrValue)}"`)
          .join(" ");
  const children = value.children ?? [];

  if (children.length === 0) {
    return `${indent}<${value.name}${attributes}/>`;
  }

  if (children.length === 1 && typeof children[0] === "string") {
    return `${indent}<${value.name}${attributes}>${escapeXml(children[0])}</${value.name}>`;
  }

  const renderedChildren = children
    .map((child) => {
      if (typeof child === "string") {
        return `${"  ".repeat(level + 1)}${escapeXml(child)}`;
      }
      return serializeNode(child, level + 1);
    })
    .join("\n");

  return `${indent}<${value.name}${attributes}>\n${renderedChildren}\n${indent}</${value.name}>`;
}

function partyNode(party: UblParty | null) {
  if (!party) {
    return node("cac:Party");
  }

  return node("cac:Party", [
    party.registrationNumber
      ? node("cac:PartyIdentification", [
          node("cbc:ID", [party.registrationNumber], { schemeID: "CRN" }),
        ])
      : null,
    party.address
      ? node("cac:PostalAddress", [
          party.address.streetName
            ? node("cbc:StreetName", [party.address.streetName])
            : null,
          party.address.additionalStreetName
            ? node("cbc:AdditionalStreetName", [party.address.additionalStreetName])
            : null,
          party.address.buildingNumber
            ? node("cbc:BuildingNumber", [party.address.buildingNumber])
            : null,
          party.address.citySubdivisionName
            ? node("cbc:CitySubdivisionName", [party.address.citySubdivisionName])
            : null,
          party.address.cityName ? node("cbc:CityName", [party.address.cityName]) : null,
          party.address.postalZone ? node("cbc:PostalZone", [party.address.postalZone]) : null,
          node("cac:Country", [
            node("cbc:IdentificationCode", [party.address.countryCode]),
          ]),
        ])
      : null,
    party.taxNumber
      ? node("cac:PartyTaxScheme", [
          node("cbc:CompanyID", [party.taxNumber]),
          node("cac:TaxScheme", [node("cbc:ID", ["VAT"])]),
        ])
      : null,
    node("cac:PartyLegalEntity", [
      node("cbc:RegistrationName", [party.registrationName]),
    ]),
  ]);
}

function taxCategoryNode(input: {
  code: "S" | "Z" | "E" | "O";
  percent: string;
  taxExemptionReasonCode?: string | null;
  taxExemptionReason?: string | null;
  includeSchemeAttributes: boolean;
}) {
  return node("cac:TaxCategory", [
    node(
      "cbc:ID",
      [input.code],
      input.includeSchemeAttributes
        ? {
            schemeID: "UN/ECE 5305",
            schemeAgencyID: "6",
          }
        : undefined,
    ),
    node("cbc:Percent", [input.percent]),
    input.taxExemptionReasonCode
      ? node("cbc:TaxExemptionReasonCode", [input.taxExemptionReasonCode])
      : null,
    input.taxExemptionReason
      ? node("cbc:TaxExemptionReason", [input.taxExemptionReason])
      : null,
    node("cac:TaxScheme", [
      node(
        "cbc:ID",
        ["VAT"],
        input.includeSchemeAttributes
          ? {
              schemeID: "UN/ECE 5153",
              schemeAgencyID: "6",
            }
          : undefined,
      ),
    ]),
  ]);
}

function invoiceNode(model: UblInvoiceModel): XmlNode {
  const currency = model.currencyCode;
  const taxSubtotals = model.taxSubtotals.map((taxSubtotal) =>
    node("cac:TaxSubtotal", [
      node("cbc:TaxableAmount", [taxSubtotal.taxableAmount], { currencyID: currency }),
      node("cbc:TaxAmount", [taxSubtotal.taxAmount], { currencyID: currency }),
      taxCategoryNode({
        code: taxSubtotal.categoryCode,
        percent: taxSubtotal.percent,
        taxExemptionReasonCode: taxSubtotal.taxExemptionReasonCode,
        taxExemptionReason: taxSubtotal.taxExemptionReason,
        includeSchemeAttributes: true,
      }),
    ]),
  );

  const invoiceLines = model.lines.map((line) =>
    node("cac:InvoiceLine", [
      node("cbc:ID", [line.id]),
      node("cbc:InvoicedQuantity", [line.quantity], { unitCode: line.unitCode }),
      node("cbc:LineExtensionAmount", [line.lineExtensionAmount], {
        currencyID: currency,
      }),
      node("cac:TaxTotal", [
        node("cbc:TaxAmount", [line.taxAmount], { currencyID: currency }),
        node("cbc:RoundingAmount", [line.roundingAmount], { currencyID: currency }),
      ]),
      node("cac:Item", [
        node("cbc:Name", [line.itemName]),
        node("cac:ClassifiedTaxCategory", [
          node("cbc:ID", [line.taxCategoryCode]),
          node("cbc:Percent", [line.taxPercent]),
          line.taxExemptionReasonCode
            ? node("cbc:TaxExemptionReasonCode", [line.taxExemptionReasonCode])
            : null,
          line.taxExemptionReason
            ? node("cbc:TaxExemptionReason", [line.taxExemptionReason])
            : null,
          node("cac:TaxScheme", [node("cbc:ID", ["VAT"])]),
        ]),
      ]),
      node("cac:Price", [
        node("cbc:PriceAmount", [line.priceAmount], { currencyID: currency }),
        node("cbc:BaseQuantity", ["1.000000"], { unitCode: line.unitCode }),
      ]),
    ]),
  );

  return node(
    "Invoice",
    [
      node("ext:UBLExtensions", [
        node("ext:UBLExtension", [
          node("ext:ExtensionURI", [
            "urn:oasis:names:specification:ubl:dsig:enveloped:xades",
          ]),
          node("ext:ExtensionContent"),
        ]),
      ]),
      node("cbc:ProfileID", [model.profileId]),
      node("cbc:ID", [model.id]),
      node("cbc:UUID", [model.uuid]),
      node("cbc:IssueDate", [model.issueDate]),
      node("cbc:IssueTime", [model.issueTime]),
      node("cbc:InvoiceTypeCode", [model.invoiceTypeCode.code], {
        name: model.invoiceTypeCode.name,
      }),
      model.note ? node("cbc:Note", [model.note], { languageID: "ar" }) : null,
      node("cbc:DocumentCurrencyCode", [currency]),
      node("cbc:TaxCurrencyCode", [currency]),
      model.billingReferenceId
        ? node("cac:BillingReference", [
            node("cac:InvoiceDocumentReference", [
              node("cbc:ID", [model.billingReferenceId]),
            ]),
          ])
        : null,
      node("cac:AdditionalDocumentReference", [
        node("cbc:ID", ["ICV"]),
        node("cbc:UUID", [model.invoiceCounter]),
      ]),
      node("cac:AdditionalDocumentReference", [
        node("cbc:ID", ["PIH"]),
        node("cac:Attachment", [
          node(
            "cbc:EmbeddedDocumentBinaryObject",
            [model.previousInvoiceHash],
            { mimeCode: "text/plain" },
          ),
        ]),
      ]),
      node("cac:AdditionalDocumentReference", [
        node("cbc:ID", ["QR"]),
        node("cac:Attachment", [
          node("cbc:EmbeddedDocumentBinaryObject", [model.qrPayload], {
            mimeCode: "text/plain",
          }),
        ]),
      ]),
      node("cac:Signature", [
        node("cbc:ID", ["urn:oasis:names:specification:ubl:signature:Invoice"]),
        node("cbc:SignatureMethod", [
          "urn:oasis:names:specification:ubl:dsig:enveloped:xades",
        ]),
      ]),
      node("cac:AccountingSupplierParty", [partyNode(model.seller)]),
      node("cac:AccountingCustomerParty", [partyNode(model.buyer)]),
      model.deliveryDate
        ? node("cac:Delivery", [node("cbc:ActualDeliveryDate", [model.deliveryDate])])
        : null,
      model.paymentMeansCode
        ? node("cac:PaymentMeans", [
            node("cbc:PaymentMeansCode", [model.paymentMeansCode]),
            model.paymentInstructionNote
              ? node("cbc:InstructionNote", [model.paymentInstructionNote])
              : null,
          ])
        : null,
      node("cac:TaxTotal", [
        node("cbc:TaxAmount", [model.taxTotal], { currencyID: currency }),
      ]),
      node("cac:TaxTotal", [
        node("cbc:TaxAmount", [model.taxTotal], { currencyID: currency }),
        ...taxSubtotals,
      ]),
      node("cac:LegalMonetaryTotal", [
        node(
          "cbc:LineExtensionAmount",
          [model.legalMonetaryTotal.lineExtensionAmount],
          { currencyID: currency },
        ),
        node(
          "cbc:TaxExclusiveAmount",
          [model.legalMonetaryTotal.taxExclusiveAmount],
          { currencyID: currency },
        ),
        node(
          "cbc:TaxInclusiveAmount",
          [model.legalMonetaryTotal.taxInclusiveAmount],
          { currencyID: currency },
        ),
        node(
          "cbc:AllowanceTotalAmount",
          [model.legalMonetaryTotal.allowanceTotalAmount],
          { currencyID: currency },
        ),
        node("cbc:PrepaidAmount", [model.legalMonetaryTotal.prepaidAmount], {
          currencyID: currency,
        }),
        node("cbc:PayableAmount", [model.legalMonetaryTotal.payableAmount], {
          currencyID: currency,
        }),
      ]),
      ...invoiceLines,
    ],
    {
      xmlns: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
      "xmlns:cac":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      "xmlns:cbc":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
      "xmlns:ext":
        "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
    },
  );
}

export function mapInvoiceToUblModel(input: BuildInvoiceXmlInput): UblInvoiceModel {
  return normalizeModel(input);
}

export function serializeUblInvoice(model: UblInvoiceModel) {
  return ['<?xml version="1.0" encoding="UTF-8"?>', serializeNode(invoiceNode(model))].join(
    "\n",
  );
}

export function buildInvoiceXml(input: BuildInvoiceXmlInput) {
  return serializeUblInvoice(mapInvoiceToUblModel(input));
}

export function buildInvoiceSignatureExtensionXml(input: UblInvoiceSignatureInput) {
  return [
    '<sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">',
    "  <sac:SignatureInformation>",
    "    <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>",
    "    <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>",
    '    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">',
    "      <ds:SignedInfo>",
    '        <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>',
    '        <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>',
    '        <ds:Reference Id="invoiceSignedData" URI="">',
    "          <ds:Transforms>",
    '            <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
    "              <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>",
    "            </ds:Transform>",
    '            <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
    "              <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>",
    "            </ds:Transform>",
    '            <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">',
    "              <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>",
    "            </ds:Transform>",
    '            <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>',
    "          </ds:Transforms>",
    '          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `          <ds:DigestValue>${escapeXml(input.invoiceDigestValue)}</ds:DigestValue>`,
    "        </ds:Reference>",
    '        <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">',
    '          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `          <ds:DigestValue>${escapeXml(input.signedPropertiesDigestValue)}</ds:DigestValue>`,
    "        </ds:Reference>",
    "      </ds:SignedInfo>",
    `      <ds:SignatureValue>${escapeXml(input.signatureValue)}</ds:SignatureValue>`,
    "      <ds:KeyInfo>",
    "        <ds:X509Data>",
    `          <ds:X509Certificate>${escapeXml(input.certificateBase64)}</ds:X509Certificate>`,
    "        </ds:X509Data>",
    "      </ds:KeyInfo>",
    "      <ds:Object>",
    '        <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">',
    '          <xades:SignedProperties Id="xadesSignedProperties">',
    "            <xades:SignedSignatureProperties>",
    `              <xades:SigningTime>${escapeXml(input.signingTimeIso)}</xades:SigningTime>`,
    "              <xades:SigningCertificate>",
    "                <xades:Cert>",
    "                  <xades:CertDigest>",
    '                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `                    <ds:DigestValue>${escapeXml(input.certificateDigestValue)}</ds:DigestValue>`,
    "                  </xades:CertDigest>",
    "                  <xades:IssuerSerial>",
    `                    <ds:X509IssuerName>${escapeXml(input.issuerName)}</ds:X509IssuerName>`,
    `                    <ds:X509SerialNumber>${escapeXml(input.serialNumber)}</ds:X509SerialNumber>`,
    "                  </xades:IssuerSerial>",
    "                </xades:Cert>",
    "              </xades:SigningCertificate>",
    "            </xades:SignedSignatureProperties>",
    "          </xades:SignedProperties>",
    "        </xades:QualifyingProperties>",
    "      </ds:Object>",
    "    </ds:Signature>",
    "  </sac:SignatureInformation>",
    "</sig:UBLDocumentSignatures>",
  ].join("\n");
}

export function injectSignatureExtensionIntoInvoiceXml(
  invoiceXml: string,
  extensionXml: string,
) {
  if (invoiceXml.includes("<ext:ExtensionContent/>")) {
    return invoiceXml.replace(
      "<ext:ExtensionContent/>",
      `<ext:ExtensionContent>\n${extensionXml}\n</ext:ExtensionContent>`,
    );
  }

  return invoiceXml.replace(
    /<ext:ExtensionContent>[\s\S]*?<\/ext:ExtensionContent>/,
    `<ext:ExtensionContent>\n${extensionXml}\n</ext:ExtensionContent>`,
  );
}
