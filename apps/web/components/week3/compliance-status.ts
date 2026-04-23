import type {
  ComplianceCertificateStatus,
  ComplianceDeadLetterState,
  ComplianceDocumentStatus,
  ComplianceFailureCategory,
  ComplianceOnboardingStatus,
  SubmissionStatus,
} from "@daftar/types";

type StatusTone = "success" | "warning" | "neutral";

export type ComplianceStatusMeta = {
  label: string;
  tone: StatusTone;
  icon: "OK" | "PEND" | "WARN" | "ERR" | "INFO";
  description: string;
  operatorDescription: string;
  clientLabel: string;
  clientDescription: string;
};

type OperatorQueueStatus =
  | "QUEUED"
  | "PROCESSING"
  | "ACCEPTED"
  | "ACCEPTED_WITH_WARNINGS"
  | "REJECTED";

const defaultMeta: ComplianceStatusMeta = {
  label: "Not available",
  tone: "neutral",
  icon: "INFO",
  description: "Status information is currently unavailable.",
  operatorDescription: "No status code was provided by the backend.",
  clientLabel: "Not available",
  clientDescription: "Status information is currently unavailable.",
};

function formatStatusLabel(value: string | null | undefined) {
  if (!value || value.trim().length === 0) {
    return "Not available";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeOperatorQueueStatus(input: {
  status: ComplianceDocumentStatus;
  lastSubmissionStatus: SubmissionStatus | null;
  submissionStatus: SubmissionStatus | null;
}): OperatorQueueStatus {
  const status = input.submissionStatus ?? input.lastSubmissionStatus ?? input.status;

  if (status === "ACCEPTED_WITH_WARNINGS") {
    return "ACCEPTED_WITH_WARNINGS";
  }

  if (status === "ACCEPTED" || status === "CLEARED" || status === "REPORTED") {
    return "ACCEPTED";
  }

  if (
    status === "CLEARED_WITH_WARNINGS" ||
    status === "REPORTED_WITH_WARNINGS"
  ) {
    return "ACCEPTED_WITH_WARNINGS";
  }

  if (status === "QUEUED" || status === "READY") {
    return "QUEUED";
  }

  if (status === "PROCESSING" || status === "RETRY_SCHEDULED") {
    return "PROCESSING";
  }

  return "REJECTED";
}

export function onboardingStatusMeta(
  status: ComplianceOnboardingStatus | null | undefined,
): ComplianceStatusMeta {
  switch (status) {
    case "DRAFT":
      return {
        label: "Draft Prepared",
        tone: "warning",
        icon: "PEND",
        description: "Device identity is saved and ready for CSR generation.",
        operatorDescription:
          "Required business/device fields are available, but no CSR has been generated yet.",
        clientLabel: "Setup In Progress",
        clientDescription: "The invoicing device setup has started.",
      };
    case "CSR_GENERATED":
      return {
        label: "CSR Generated",
        tone: "warning",
        icon: "PEND",
        description: "CSR is ready. Request OTP and submit onboarding.",
        operatorDescription:
          "Cryptographic material is prepared and the onboarding flow can move to OTP.",
        clientLabel: "Setup In Progress",
        clientDescription: "The device identity was prepared and is awaiting authorization.",
      };
    case "OTP_PENDING":
      return {
        label: "Waiting For OTP",
        tone: "warning",
        icon: "PEND",
        description: "OTP is required to issue compliance credentials.",
        operatorDescription:
          "CSR was generated and the onboarding flow is blocked until OTP submission.",
        clientLabel: "Waiting For Authorization",
        clientDescription: "Activation is waiting for the authority OTP code.",
      };
    case "CSR_SUBMITTED":
      return {
        label: "CSR Submitted",
        tone: "warning",
        icon: "PEND",
        description: "Credential issuance is in progress.",
        operatorDescription:
          "OTP submission completed and the onboarding request is being processed.",
        clientLabel: "Activation In Progress",
        clientDescription: "Activation is being processed.",
      };
    case "CERTIFICATE_ISSUED":
      return {
        label: "Certificate Issued",
        tone: "warning",
        icon: "PEND",
        description: "Certificate is issued and can now be activated.",
        operatorDescription:
          "Compliance certificate material exists but device activation has not been completed.",
        clientLabel: "Ready To Activate",
        clientDescription: "Credentials are issued and pending activation.",
      };
    case "ACTIVE":
      return {
        label: "Active",
        tone: "success",
        icon: "OK",
        description: "Device is active and ready for invoice submissions.",
        operatorDescription:
          "This device can be used by the worker pipeline for reporting/clearance submissions.",
        clientLabel: "Connected",
        clientDescription: "Compliance connection is active.",
      };
    case "RENEWAL_REQUIRED":
      return {
        label: "Renewal Required",
        tone: "warning",
        icon: "WARN",
        description: "Certificate is approaching expiry and should be renewed.",
        operatorDescription:
          "Renewal is needed to avoid submission interruptions when certificate validity ends.",
        clientLabel: "Renewal Needed",
        clientDescription: "Connection remains active but renewal is required soon.",
      };
    case "REVOKED":
      return {
        label: "Revoked",
        tone: "neutral",
        icon: "ERR",
        description: "Device certificate was revoked and can no longer submit.",
        operatorDescription:
          "Submissions are blocked until a new onboarding record is activated.",
        clientLabel: "Disconnected",
        clientDescription: "Compliance connection is no longer active.",
      };
    case "EXPIRED":
      return {
        label: "Expired",
        tone: "neutral",
        icon: "ERR",
        description: "Certificate validity expired and submissions are blocked.",
        operatorDescription:
          "Device must be renewed or re-onboarded before submitting invoices again.",
        clientLabel: "Expired",
        clientDescription: "Connection expired and needs renewal.",
      };
    case "FAILED":
    case "ERROR":
      return {
        label: "Action Required",
        tone: "neutral",
        icon: "ERR",
        description: "Onboarding failed. Review error details and retry the stage.",
        operatorDescription:
          "The latest onboarding operation failed and needs operator/admin remediation.",
        clientLabel: "Needs Attention",
        clientDescription: "Compliance connection requires admin intervention.",
      };
    case "NOT_STARTED":
    case "PENDING_CONFIGURATION":
      return {
        label: "Not Started",
        tone: "neutral",
        icon: "INFO",
        description: "Prepare onboarding to create the first device record.",
        operatorDescription:
          "No onboarding record exists yet for this environment/device slot.",
        clientLabel: "Not Connected",
        clientDescription: "Compliance connection has not been set up.",
      };
    default:
      return {
        ...defaultMeta,
        label: formatStatusLabel(status),
        clientLabel: formatStatusLabel(status),
      };
  }
}

export function certificateStatusMeta(
  status: ComplianceCertificateStatus | null | undefined,
): ComplianceStatusMeta {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Certificate Active",
        tone: "success",
        icon: "OK",
        description: "Certificate is valid for submission and signing flows.",
        operatorDescription:
          "Certificate/secret pair is available and considered active for this device.",
        clientLabel: "Certificate Active",
        clientDescription: "Compliance certificate is active.",
      };
    case "CERTIFICATE_ISSUED":
      return {
        label: "Certificate Issued",
        tone: "warning",
        icon: "PEND",
        description: "Certificate exists but is not active until activation step finishes.",
        operatorDescription:
          "Credential material is present but lifecycle activation still needs completion.",
        clientLabel: "Certificate Ready",
        clientDescription: "Certificate issued and awaiting activation.",
      };
    case "CSR_GENERATED":
    case "OTP_PENDING":
    case "CSR_SUBMITTED":
      return {
        label: formatStatusLabel(status),
        tone: "warning",
        icon: "PEND",
        description: "Certificate issuance is currently in progress.",
        operatorDescription:
          "Lifecycle is mid-flight and will become active after successful onboarding steps.",
        clientLabel: "In Progress",
        clientDescription: "Certificate setup is in progress.",
      };
    case "EXPIRED":
    case "REVOKED":
    case "FAILED":
    case "ERROR":
      return {
        label: formatStatusLabel(status),
        tone: "neutral",
        icon: "ERR",
        description: "Certificate cannot be used for new submissions.",
        operatorDescription:
          "Renewal/revocation path has completed or failed; operator action is required.",
        clientLabel: "Not Active",
        clientDescription: "Certificate is not active.",
      };
    case "NOT_REQUESTED":
      return {
        label: "Not Requested",
        tone: "neutral",
        icon: "INFO",
        description: "Certificate request has not started yet.",
        operatorDescription: "No CSR submission has occurred for this onboarding record.",
        clientLabel: "Not Requested",
        clientDescription: "Certificate setup has not started.",
      };
    default:
      return {
        ...defaultMeta,
        label: formatStatusLabel(status),
        clientLabel: formatStatusLabel(status),
      };
  }
}

export function complianceDocumentStatusMeta(
  status: ComplianceDocumentStatus | null | undefined,
): ComplianceStatusMeta {
  switch (status) {
    case "CLEARED":
      return {
        label: "Cleared",
        tone: "success",
        icon: "OK",
        description: "Invoice cleared through the authority clearance flow.",
        operatorDescription: "Standard invoice clearance succeeded.",
        clientLabel: "Authority Approved",
        clientDescription: "The invoice was approved by the authority.",
      };
    case "REPORTED":
      return {
        label: "Reported",
        tone: "success",
        icon: "OK",
        description: "Invoice reported through the reporting flow.",
        operatorDescription: "Simplified invoice reporting succeeded.",
        clientLabel: "Reported",
        clientDescription: "The invoice was reported successfully.",
      };
    case "CLEARED_WITH_WARNINGS":
    case "REPORTED_WITH_WARNINGS":
      return {
        label: formatStatusLabel(status),
        tone: "success",
        icon: "WARN",
        description: "Submission succeeded with non-blocking warnings.",
        operatorDescription:
          "Authority accepted the document but returned warnings that should be reviewed.",
        clientLabel: "Accepted With Notes",
        clientDescription: "The invoice was accepted with warnings.",
      };
    case "READY":
    case "QUEUED":
    case "PROCESSING":
    case "RETRY_SCHEDULED":
      return {
        label: formatStatusLabel(status),
        tone: "warning",
        icon: "PEND",
        description: "Submission is in progress and has not reached final state.",
        operatorDescription: "Worker queue is still processing this compliance document.",
        clientLabel: "In Progress",
        clientDescription: "Submission is currently in progress.",
      };
    case "REJECTED":
    case "FAILED":
      return {
        label: formatStatusLabel(status),
        tone: "neutral",
        icon: "ERR",
        description: "Submission did not complete successfully.",
        operatorDescription:
          "Document needs correction or operational remediation before resubmission.",
        clientLabel: "Needs Attention",
        clientDescription: "Submission failed and needs correction.",
      };
    case "DRAFT":
      return {
        label: "Draft",
        tone: "neutral",
        icon: "INFO",
        description: "Compliance document has not been queued yet.",
        operatorDescription: "No submission was attempted yet.",
        clientLabel: "Draft",
        clientDescription: "Submission has not started.",
      };
    default:
      return {
        ...defaultMeta,
        label: formatStatusLabel(status),
        clientLabel: formatStatusLabel(status),
      };
  }
}

export function submissionStatusMeta(
  status: SubmissionStatus | null | undefined,
): ComplianceStatusMeta {
  switch (status) {
    case "ACCEPTED":
      return {
        label: "Accepted",
        tone: "success",
        icon: "OK",
        description: "Submission accepted by authority.",
        operatorDescription: "Submission completed successfully.",
        clientLabel: "Accepted",
        clientDescription: "Submission accepted.",
      };
    case "ACCEPTED_WITH_WARNINGS":
      return {
        label: "Accepted With Warnings",
        tone: "success",
        icon: "WARN",
        description: "Submission accepted with non-blocking warnings.",
        operatorDescription: "Review warnings but no retry is required.",
        clientLabel: "Accepted With Notes",
        clientDescription: "Accepted with warnings.",
      };
    case "QUEUED":
    case "PROCESSING":
    case "RETRY_SCHEDULED":
      return {
        label: formatStatusLabel(status),
        tone: "warning",
        icon: "PEND",
        description: "Submission is in queue or currently processing.",
        operatorDescription: "Await queue completion before operator action.",
        clientLabel: "In Progress",
        clientDescription: "Submission is in progress.",
      };
    case "REJECTED":
    case "FAILED":
      return {
        label: formatStatusLabel(status),
        tone: "neutral",
        icon: "ERR",
        description: "Submission failed or was rejected.",
        operatorDescription: "Review error details before retrying.",
        clientLabel: "Failed",
        clientDescription: "Submission failed.",
      };
    default:
      return {
        ...defaultMeta,
        label: formatStatusLabel(status),
        clientLabel: formatStatusLabel(status),
      };
  }
}

export function deadLetterStateMeta(
  state: ComplianceDeadLetterState | null | undefined,
): ComplianceStatusMeta {
  switch (state) {
    case "OPEN":
      return {
        label: "Needs Action",
        tone: "neutral",
        icon: "WARN",
        description: "Submission is in dead-letter and waiting for operator action.",
        operatorDescription:
          "Choose acknowledge/escalate/requeue after reviewing failure details.",
        clientLabel: "Needs Attention",
        clientDescription: "Submission requires support action.",
      };
    case "ACKNOWLEDGED":
      return {
        label: "Acknowledged",
        tone: "warning",
        icon: "INFO",
        description: "Issue is acknowledged and pending remediation.",
        operatorDescription: "The team is aware of the dead-letter issue.",
        clientLabel: "Under Review",
        clientDescription: "Issue is being reviewed.",
      };
    case "ESCALATED":
      return {
        label: "Escalated",
        tone: "warning",
        icon: "WARN",
        description: "Issue was escalated for deeper investigation.",
        operatorDescription: "Escalation path was initiated for this dead-letter item.",
        clientLabel: "Escalated",
        clientDescription: "Issue was escalated for support.",
      };
    case "REQUEUED":
      return {
        label: "Requeued",
        tone: "success",
        icon: "OK",
        description: "Submission was requeued back into the processing pipeline.",
        operatorDescription: "Queue processing resumed for this item.",
        clientLabel: "Processing Again",
        clientDescription: "Submission is being retried.",
      };
    default:
      return {
        ...defaultMeta,
        label: formatStatusLabel(state),
        clientLabel: formatStatusLabel(state),
      };
  }
}

export function failureCategoryMeta(
  category: ComplianceFailureCategory | null | undefined,
): ComplianceStatusMeta {
  switch (category) {
    case "CONFIGURATION":
      return {
        label: "Configuration",
        tone: "neutral",
        icon: "ERR",
        description: "Configuration data is missing or invalid.",
        operatorDescription: "Fix onboarding, environment, or mapping configuration.",
        clientLabel: "Configuration Issue",
        clientDescription: "System configuration needs correction.",
      };
    case "AUTHENTICATION":
      return {
        label: "Authentication",
        tone: "neutral",
        icon: "ERR",
        description: "Credential authentication failed.",
        operatorDescription: "Check certificate/secret validity and onboarding status.",
        clientLabel: "Credential Issue",
        clientDescription: "Credentials need attention.",
      };
    case "CONNECTIVITY":
      return {
        label: "Connectivity",
        tone: "warning",
        icon: "WARN",
        description: "Network or remote availability interrupted the submission.",
        operatorDescription: "Usually retryable; verify service health and retry policy.",
        clientLabel: "Temporary Connectivity Issue",
        clientDescription: "Submission is impacted by a temporary network issue.",
      };
    case "VALIDATION":
      return {
        label: "Validation",
        tone: "neutral",
        icon: "ERR",
        description: "Invoice payload failed validation checks.",
        operatorDescription: "Correct invoice data/UBL structure and resubmit.",
        clientLabel: "Validation Issue",
        clientDescription: "Invoice data requires correction.",
      };
    case "ZATCA_REJECTION":
      return {
        label: "Authority Rejection",
        tone: "neutral",
        icon: "ERR",
        description: "Authority explicitly rejected the submission.",
        operatorDescription: "Review rejection messages and correct source data.",
        clientLabel: "Rejected By Authority",
        clientDescription: "Submission was rejected and must be corrected.",
      };
    case "TERMINAL":
      return {
        label: "Terminal Failure",
        tone: "neutral",
        icon: "ERR",
        description: "Submission reached a terminal non-retryable state.",
        operatorDescription: "Do not auto-retry. Manual remediation is required.",
        clientLabel: "Needs Manual Review",
        clientDescription: "Submission requires manual review.",
      };
    case "UNKNOWN":
      return {
        label: "Unknown",
        tone: "warning",
        icon: "WARN",
        description: "Failure category is unknown.",
        operatorDescription: "Inspect transport payload and attempt timeline for root cause.",
        clientLabel: "Unknown Issue",
        clientDescription: "Submission encountered an unknown issue.",
      };
    default:
      return {
        ...defaultMeta,
        label: "Not classified",
        clientLabel: "Not classified",
      };
  }
}

export function operatorQueueStatusMeta(
  status: OperatorQueueStatus | null | undefined,
): ComplianceStatusMeta {
  switch (status) {
    case "QUEUED":
      return {
        label: "Queued",
        tone: "warning",
        icon: "PEND",
        description: "Waiting in queue for worker pickup.",
        operatorDescription: "No action required unless queue stalls.",
        clientLabel: "Queued",
        clientDescription: "Submission is waiting in queue.",
      };
    case "PROCESSING":
      return {
        label: "Processing",
        tone: "warning",
        icon: "PEND",
        description: "Submission is currently being processed.",
        operatorDescription: "Worker execution in progress.",
        clientLabel: "Processing",
        clientDescription: "Submission is processing.",
      };
    case "ACCEPTED":
      return {
        label: "Accepted",
        tone: "success",
        icon: "OK",
        description: "Submission accepted successfully.",
        operatorDescription: "No retry/remediation required.",
        clientLabel: "Accepted",
        clientDescription: "Submission accepted.",
      };
    case "ACCEPTED_WITH_WARNINGS":
      return {
        label: "Accepted With Warnings",
        tone: "success",
        icon: "WARN",
        description: "Submission accepted with warnings that should be reviewed.",
        operatorDescription: "Track warning trend; no immediate retry needed.",
        clientLabel: "Accepted With Notes",
        clientDescription: "Accepted with warnings.",
      };
    case "REJECTED":
      return {
        label: "Rejected",
        tone: "neutral",
        icon: "ERR",
        description: "Submission failed and needs correction or intervention.",
        operatorDescription: "Review validation/transport diagnostics and retry policy.",
        clientLabel: "Rejected",
        clientDescription: "Submission was rejected.",
      };
    default:
      return defaultMeta;
  }
}

export function validationStatusMeta(
  status: string | null | undefined,
): ComplianceStatusMeta {
  if (!status) {
    return {
      ...defaultMeta,
      label: "Not Run",
      description: "Validation was not executed for this invoice.",
      operatorDescription: "No local SDK validation record is stored.",
      clientLabel: "Not Run",
      clientDescription: "Validation not executed yet.",
    };
  }

  const normalized = status.toUpperCase();
  if (normalized === "PASSED") {
    return {
      label: "Passed",
      tone: "success",
      icon: "OK",
      description: "Local validation checks passed.",
      operatorDescription: "SDK validation succeeded.",
      clientLabel: "Passed",
      clientDescription: "Validation passed.",
    };
  }

  if (normalized === "SKIPPED") {
    return {
      label: "Skipped",
      tone: "warning",
      icon: "INFO",
      description: "Validation was skipped in this environment.",
      operatorDescription: "SDK validation was not available or intentionally skipped.",
      clientLabel: "Skipped",
      clientDescription: "Validation skipped.",
    };
  }

  return {
    label: formatStatusLabel(status),
    tone: "neutral",
    icon: "ERR",
    description: "Local validation reported errors.",
    operatorDescription: "Fix validation failures before submission.",
    clientLabel: "Failed",
    clientDescription: "Validation failed.",
  };
}

export function formatGeneralStatusLabel(value: string | null | undefined) {
  return formatStatusLabel(value);
}
