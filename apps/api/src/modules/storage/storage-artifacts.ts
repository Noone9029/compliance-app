export type ZatcaArtifactKind = "sourceXml" | "signedXml" | "visualPdf" | "qrPng";

type ZatcaArtifactPathInput = {
  tenantId: string;
  orgId: string;
  invoiceId: string;
};

const artifactFileNames: Record<ZatcaArtifactKind, string> = {
  sourceXml: "source.xml",
  signedXml: "signed.xml",
  visualPdf: "visual.pdf",
  qrPng: "qr.png",
};

function pathSegment(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`${field} must be a non-empty storage path segment.`);
  }
  return trimmed;
}

export function zatcaInvoiceArtifactObjectKey(
  input: ZatcaArtifactPathInput & { artifact: ZatcaArtifactKind },
) {
  const tenantId = pathSegment(input.tenantId, "tenantId");
  const orgId = pathSegment(input.orgId, "orgId");
  const invoiceId = pathSegment(input.invoiceId, "invoiceId");

  return [
    "tenants",
    tenantId,
    "orgs",
    orgId,
    "invoices",
    invoiceId,
    artifactFileNames[input.artifact],
  ].join("/");
}

export function zatcaInvoiceArtifactObjectKeys(input: ZatcaArtifactPathInput) {
  return {
    sourceXml: zatcaInvoiceArtifactObjectKey({ ...input, artifact: "sourceXml" }),
    signedXml: zatcaInvoiceArtifactObjectKey({ ...input, artifact: "signedXml" }),
    visualPdf: zatcaInvoiceArtifactObjectKey({ ...input, artifact: "visualPdf" }),
    qrPng: zatcaInvoiceArtifactObjectKey({ ...input, artifact: "qrPng" }),
  };
}
