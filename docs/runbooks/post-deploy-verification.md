# Runbook: Post-Deploy Verification

## Purpose

Validate critical end-to-end compliance operations after deployment.

## Prerequisites

- smoke checks completed successfully
- admin test account and operator test account available
- at least one organization with onboarding history

## Exact Steps

1. Admin lifecycle verification:
   - `GET /v1/compliance/onboarding/current`
   - `GET /v1/compliance/integration`
   - confirm onboarding visibility and timeline render correctly.
2. Operator monitoring verification:
   - `GET /v1/compliance/documents`
   - verify statuses, warnings, errors, and request metadata are returned.
3. Dead-letter operations verification:
   - `GET /v1/compliance/dead-letter`
   - if test item exists, validate detail endpoint and lifecycle action endpoints.
4. Controlled invoice submission verification:
   - choose non-draft issued invoice
   - trigger `POST /v1/compliance/invoices/:invoiceId/report`
   - verify transitions in documents list and attempts timeline.
5. Retry path verification:
   - if a non-terminal test failure exists, run `POST /v1/compliance/invoices/:invoiceId/retry`
   - verify requeue and processing.

## Expected Results

- onboarding, monitoring, and operational endpoints behave as before deployment
- worker still processes queue transitions correctly
- event/timeline data is being written and visible

## Failure Cases

- report endpoint blocked by inactive onboarding
- queueing works but worker does not process
- retry endpoints return unexpected permission/config errors

## Escalation Notes

- if regressions appear in core compliance transitions, freeze further release promotion
- include affected org slug, invoice id, submission id, and exact failing endpoint in escalation
