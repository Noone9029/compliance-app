# Runbook: Safe Retry and Requeue Process

## Purpose

Provide a safe, repeatable retry process that avoids infinite loops and unsafe requeue actions.

## Prerequisites

- permissions: `compliance.report`
- active onboarding available for the organization
- identified affected invoice or dead-letter submission

## Exact Steps

1. Classify the failure source.
2. If document status is `FAILED` or `REJECTED` and root cause is fixed, use:
   - `POST /v1/compliance/invoices/:invoiceId/retry`
3. If submission is in dead-letter list:
   - inspect `canRequeue` from dead-letter detail
   - only requeue when `canRequeue = true`
   - run `POST /v1/compliance/dead-letter/:submissionId/requeue`
4. After retry/requeue, verify:
   - document and submission move back to `QUEUED`
   - new worker attempt starts
   - no repeated immediate terminal failure for same root cause.

## Expected Results

- retries happen only after corrective action
- no duplicate/manual queue flooding
- dead-letter requeue is used only for retryable exhausted cases

## Failure Cases

- retry called without fixing root cause causes repeated failure loops
- requeue called on terminal dead-letter item returns `400`
- retry/requeue without active onboarding returns `400`

## Escalation Notes

- if the same failure repeats after one controlled retry, stop further manual retries and escalate
- if retries stall in `QUEUED`, check worker service health and Redis connectivity before additional actions
