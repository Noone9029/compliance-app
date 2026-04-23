# Runbook: Handle Rejected Submissions

## Purpose

Resolve terminal `REJECTED` submissions returned by validation or ZATCA rejection paths.

## Prerequisites

- permissions: `compliance.read` and `compliance.report`
- affected invoice id and organization context
- onboarding currently active

## Exact Steps

1. Find rejected document:
   - `GET /v1/compliance/documents`
2. Inspect rejection details:
   - check `lastError`, `failureCategory`, request id, warnings/errors in submission attempt payloads.
3. Confirm category:
   - `VALIDATION` means local/pre-submit issue
   - `ZATCA_REJECTION` means transport accepted request but rejected payload
4. Correct root cause in invoice/tax/onboarding context.
5. Request manual retry:
   - `POST /v1/compliance/invoices/:invoiceId/retry`
6. Monitor status transition through:
   - `QUEUED` -> `PROCESSING` -> accepted or further failure.

## Expected Results

- rejected invoice is re-queued with clean submission state
- new attempt records are created
- success ends in `CLEARED`/`REPORTED` (with or without warnings)

## Failure Cases

- retry denied when onboarding is not active
- rejection persists due to unresolved invoice content problems
- onboarding/certificate issues trigger configuration failures

## Escalation Notes

- if repeated rejections occur for the same rule class across many invoices, escalate as a systemic mapping/UBL regression
- include `submissionId`, `requestId`, and attempt metadata in escalation handoff
