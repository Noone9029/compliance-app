# Runbook: Submit OTP

## Purpose

Move onboarding from CSR stage to compliance CSID issuance by submitting OTP.

## Prerequisites

- onboarding is in `CSR_GENERATED`
- permissions: `compliance.write` and `platform.org.manage`
- valid OTP from ZATCA onboarding portal

## Exact Steps

1. Move onboarding to OTP pending:
   - `POST /v1/compliance/onboarding/:id/request-otp`
2. Verify onboarding now shows:
   - `status = OTP_PENDING`
   - `certificateStatus = OTP_PENDING`
3. Submit OTP:
   - `POST /v1/compliance/onboarding/:id/submit-otp`
   - body: `{ "otpCode": "<6-12 chars>" }`
4. Re-fetch onboarding:
   - `GET /v1/compliance/onboarding/:id`

## Expected Results

- successful path:
  - `status = CERTIFICATE_ISSUED`
  - `certificateStatus = CERTIFICATE_ISSUED`
  - `csid`, `certificateId`, `zatcaRequestId` set
  - `certificateIssuedAt` set
  - event `compliance.onboarding.compliance_csid_issued`
- failed path:
  - `status = FAILED`
  - `certificateStatus = FAILED`
  - `lastError` populated
  - event `compliance.onboarding.compliance_csid_failed`

## Failure Cases

- `400` if status is not `OTP_PENDING`
- `400` if CSR is missing
- `400` from onboarding client for invalid/expired OTP or upstream onboarding failure

## Escalation Notes

- if OTP failed, regenerate CSR and repeat OTP flow from CSR stage
- if upstream responses are inconsistent, escalate with onboarding id and `zatcaRequestId`
