import { Prisma, type PrismaClient } from "@prisma/client";
import {
  ComplianceTransportError,
  type ComplianceTransportClient,
  type ComplianceTransportRequest,
} from "../modules/compliance/compliance-transport";

export async function prepareSubmissionForManualProcessing(
  prisma: PrismaClient,
  submissionId: string,
) {
  await prisma.zatcaSubmission.updateMany({
    where: {
      id: submissionId,
    },
    data: {
      status: "QUEUED",
      retryable: false,
      errorMessage: null,
      failureCategory: null,
      responsePayload: Prisma.JsonNull,
      finishedAt: null,
      nextRetryAt: null,
      lockedAt: null,
    },
  });
}

export function createDeterministicComplianceTransport(): ComplianceTransportClient {
  return {
    endpointFor(flow) {
      return flow === "CLEARANCE"
        ? "test://zatca/clearance"
        : "test://zatca/reporting";
    },
    async submit(request: ComplianceTransportRequest) {
      if (
        request.invoiceNumber.includes("FAIL-CONNECT-ONCE") &&
        request.attemptNumber === 1
      ) {
        throw new ComplianceTransportError({
          message: "Sandbox transport is temporarily unavailable.",
          category: "CONNECTIVITY",
          retryable: true,
        });
      }

      if (
        request.invoiceNumber.includes("FAIL-CONNECT") &&
        !request.invoiceNumber.includes("FAIL-CONNECT-ONCE")
      ) {
        throw new ComplianceTransportError({
          message: "Sandbox transport is unavailable.",
          category: "CONNECTIVITY",
          retryable: true,
        });
      }

      if (request.invoiceNumber.includes("FAIL-REJECT")) {
        throw new ComplianceTransportError({
          message: "Invoice payload was rejected by ZATCA validation.",
          category: "ZATCA_REJECTION",
          retryable: false,
          responsePayload: {
            errors: ["Invoice payload rejected by deterministic test transport."],
          },
          statusCode: 400,
        });
      }

      const acceptedWithWarnings = request.invoiceNumber.includes("WARN");
      return {
        status: acceptedWithWarnings ? "ACCEPTED_WITH_WARNINGS" : "ACCEPTED",
        responseCode: request.flow === "CLEARANCE" ? "CLEARED" : "REPORTED",
        responseMessage:
          request.flow === "CLEARANCE"
            ? acceptedWithWarnings
              ? "Invoice cleared with warnings in sandbox."
              : "Invoice cleared in sandbox."
            : acceptedWithWarnings
              ? "Invoice reported with warnings in sandbox."
              : "Invoice reported in sandbox.",
        requestId: `${request.flow.toLowerCase()}-${request.uuid.slice(0, 8)}`,
        warnings: acceptedWithWarnings ? ["Sandbox deterministic warning"] : [],
        errors: [],
        stampedXmlContent: null,
        responsePayload: {
          invoiceHash: request.invoiceHash,
          flow: request.flow,
        },
        externalSubmissionId: `${request.flow.toLowerCase()}-${request.uuid.slice(0, 8)}`,
      };
    },
  };
}
