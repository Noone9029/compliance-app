import { describe, expect, it } from "vitest";

import {
  certificateStatusMeta,
  complianceDocumentStatusMeta,
  deadLetterStateMeta,
  failureCategoryMeta,
  normalizeOperatorQueueStatus,
  onboardingStatusMeta,
  operatorQueueStatusMeta,
  submissionStatusMeta,
  validationStatusMeta,
} from "./compliance-status";

describe("compliance status helpers", () => {
  it("maps onboarding and certificate lifecycle states", () => {
    expect(onboardingStatusMeta("ACTIVE").tone).toBe("success");
    expect(onboardingStatusMeta("OTP_PENDING").label).toContain("OTP");
    expect(certificateStatusMeta("ACTIVE").icon).toBe("OK");
    expect(certificateStatusMeta("FAILED").tone).toBe("neutral");
  });

  it("maps compliance and submission statuses for operator/client wording", () => {
    const cleared = complianceDocumentStatusMeta("CLEARED");
    expect(cleared.label).toBe("Cleared");
    expect(cleared.clientLabel).toBe("Authority Approved");

    const retry = submissionStatusMeta("RETRY_SCHEDULED");
    expect(retry.tone).toBe("warning");
    expect(retry.operatorDescription).toContain("queue");

    const queue = normalizeOperatorQueueStatus({
      status: "PROCESSING",
      lastSubmissionStatus: "FAILED",
      submissionStatus: "RETRY_SCHEDULED",
    });
    expect(queue).toBe("PROCESSING");
    expect(operatorQueueStatusMeta(queue).label).toBe("Processing");
  });

  it("maps failure categories, dead-letter states, and validation status", () => {
    expect(failureCategoryMeta("CONNECTIVITY").tone).toBe("warning");
    expect(failureCategoryMeta("VALIDATION").clientLabel).toContain("Validation");
    expect(deadLetterStateMeta("OPEN").label).toBe("Needs Action");
    expect(deadLetterStateMeta("REQUEUED").tone).toBe("success");
    expect(validationStatusMeta("PASSED").tone).toBe("success");
    expect(validationStatusMeta("failed").label).toBe("Failed");
  });
});
