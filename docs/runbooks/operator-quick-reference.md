# Operator Quick Reference

Purpose: fast incident handling for compliance operations.

## Primary API Endpoints

- `GET /v1/compliance/overview`
- `GET /v1/compliance/documents`
- `GET /v1/compliance/reported-documents`
- `POST /v1/compliance/invoices/:invoiceId/report`
- `POST /v1/compliance/invoices/:invoiceId/retry`
- `GET /v1/compliance/dead-letter`
- `GET /v1/compliance/dead-letter/:submissionId`
- `POST /v1/compliance/dead-letter/:submissionId/acknowledge`
- `POST /v1/compliance/dead-letter/:submissionId/escalate`
- `POST /v1/compliance/dead-letter/:submissionId/requeue`
- `GET /v1/compliance/onboarding/current`

## Status Interpretation

- `QUEUED`: waiting for worker
- `PROCESSING`: worker is running submission attempt
- `RETRY_SCHEDULED`: worker will retry automatically
- `ACCEPTED` or `ACCEPTED_WITH_WARNINGS`: invoice accepted by ZATCA
- `REJECTED`: validation or ZATCA rejection; operator correction needed
- `FAILED`: terminal failure; may require dead-letter workflow

## Fast Decision Path

1. Check current onboarding with `GET /v1/compliance/onboarding/current`.
2. If onboarding is not `ACTIVE`, fix onboarding first.
3. Check document/submission status in `GET /v1/compliance/documents`.
4. If `RETRY_SCHEDULED`, wait for automatic retry unless SLA risk.
5. If `REJECTED`, follow [Handle Rejected Submissions](./handle-rejected-submissions.md).
6. If dead-lettered, follow [Handle Dead-Letter Items](./handle-dead-letter-items.md).
7. If local validation failed before queueing, follow [Handle Validation Failures](./handle-validation-failures.md).

## Escalate Immediately If

- repeated authentication/configuration failures across multiple invoices
- onboarding secret decryption errors
- queue is not processing new `QUEUED` items
- `/ready` is unhealthy after deploy
