# Runbook: Handle Dead-Letter Items

## Purpose

Operate the dead-letter workflow for compliance submissions that exhausted retry attempts.

## Prerequisites

- permissions:
  - `compliance.read` for listing/details
  - `compliance.report` for acknowledge/escalate/requeue
- worker and API connectivity to Redis/Postgres

## Exact Steps

1. List active dead-letter items:
   - `GET /v1/compliance/dead-letter`
2. Open one item:
   - `GET /v1/compliance/dead-letter/:submissionId`
3. Review:
   - `failureCategory`
   - `state`
   - `reason` and `lastError`
   - attempt count and timeline.
4. Choose action:
   - acknowledge: `POST /v1/compliance/dead-letter/:submissionId/acknowledge`
   - escalate: `POST /v1/compliance/dead-letter/:submissionId/escalate`
   - requeue (only if eligible): `POST /v1/compliance/dead-letter/:submissionId/requeue`
5. Recheck item state and document status.

## Expected Results

- `acknowledge` sets lifecycle state to `ACKNOWLEDGED`
- `escalate` sets lifecycle state to `ESCALATED`
- `requeue` sets lifecycle state to `REQUEUED`, resets submission/document to `QUEUED`, and enqueues worker job
- requeued items are hidden from active dead-letter list

## Failure Cases

- `400` requeue rejected when `canRequeue` is false (terminal case)
- `400` requeue rejected when no active onboarding exists
- `404` when dead-letter submission id is invalid

## Escalation Notes

- escalate immediately for authentication/configuration failures affecting many invoices
- include lifecycle timeline and failure category in support handoff
