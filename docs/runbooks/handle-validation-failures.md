# Runbook: Handle Validation Failures

## Purpose

Resolve local SDK validation failures that block queueing before transport submission.

## Prerequisites

- permissions: `compliance.report` to retry/report
- access to invoice and compliance document details
- access to SDK/runtime environment logs on API host

## Exact Steps

1. Identify failed invoice:
   - `GET /v1/compliance/documents`
   - find `status = FAILED` with validation context.
2. Inspect detailed compliance record in UI/API response:
   - check `localValidation.status`, `warnings`, `errors`, and `localValidationMetadata`.
3. Confirm failure mode:
   - `FAILED`: blocking validation errors
   - `SKIPPED`: best-effort mode fallback (not blocking)
4. Correct invoice data issues (tax/address/UBL content) or SDK runtime issues.
5. Retry after correction:
   - `POST /v1/compliance/invoices/:invoiceId/retry`
6. Confirm queueing:
   - document status moves to `QUEUED`
   - event `compliance.validation.passed` appears on successful re-run.

## Expected Results

- blocking validation errors are cleared
- invoice reaches queue and worker processing path
- validation metadata is persisted for audit history

## Failure Cases

- validation keeps failing due to unchanged invoice content
- SDK unavailable in required mode causes hard failure
- retry blocked because onboarding is not active

## Escalation Notes

- if SDK runtime is missing in production, escalate to platform/deployment owner
- if invoice content appears correct but validation remains blocked, escalate to compliance XML/signing owner with stored validation metadata
