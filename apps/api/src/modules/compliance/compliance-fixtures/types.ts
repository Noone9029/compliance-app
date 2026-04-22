import type { ComplianceInvoiceKind, ComplianceSubmissionFlow } from "@daftar/types";
import type {
  BuildInvoiceXmlLineInput,
  BuildInvoiceXmlPartyInput,
} from "../compliance-ubl";

export type ComplianceParityFixtureDocumentType =
  | "INVOICE"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "PREPAYMENT";

export type ComplianceParityFixture = {
  id: string;
  title: string;
  expectedValidation: "PASSED" | "FAILED";
  strictParity?: boolean;
  mutateSignedXml?: (xml: string) => string;
  invoice: {
    invoiceNumber: string;
    invoiceKind: ComplianceInvoiceKind;
    submissionFlow: ComplianceSubmissionFlow;
    issueDateIso: string;
    currencyCode: string;
    seller: BuildInvoiceXmlPartyInput;
    buyer?: BuildInvoiceXmlPartyInput | null;
    deliveryDateIso?: string | null;
    paymentMeansCode?: string | null;
    paymentInstructionNote?: string | null;
    billingReferenceId?: string | null;
    subtotal: string;
    taxTotal: string;
    total: string;
    note?: string | null;
    documentType?: ComplianceParityFixtureDocumentType;
    lines: BuildInvoiceXmlLineInput[];
  };
};
