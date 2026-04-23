# Runbook: Activate Onboarding

## Purpose

Activate production credentials for a device and make it eligible for invoice submissions.

## Prerequisites

- onboarding has issued certificate material (`CERTIFICATE_ISSUED` lifecycle)
- permissions: `compliance.write` and `platform.org.manage`
- onboarding has:
  - CSR data
  - `zatcaRequestId`
  - compliance credentials (`csid`, encrypted certificate secret)
  - encrypted private key

## Exact Steps

1. Fetch onboarding:
   - `GET /v1/compliance/onboarding/:id`
2. Trigger activation:
   - `POST /v1/compliance/onboarding/:id/activate`
3. Re-fetch onboarding:
   - `GET /v1/compliance/onboarding/:id`
4. Verify integration summary:
   - `GET /v1/compliance/integration`

## Expected Results

- onboarding becomes:
  - `status = ACTIVE`
  - `certificateStatus = ACTIVE`
  - `lastActivatedAt` set
- pre-activation compliance check passes and event `compliance.onboarding.compliance_check_passed` is recorded
- activation event `compliance.onboarding.activated` is recorded
- if another device was active in same environment, it is deactivated to `CERTIFICATE_ISSUED` with event `compliance.onboarding.deactivated`

## Failure Cases

- `400` for missing required materials (`csr`, `zatcaRequestId`, credentials, key)
- `400` if compliance-check fails before activation
- `400` if secret decryption fails due to encryption key mismatch
- activation failure leaves onboarding at issued state with `lastError`

## Escalation Notes

- if compliance-check fails repeatedly, escalate with onboarding id and compliance-check response metadata
- if decryption failures occur, treat as deployment secret incident and escalate immediately
