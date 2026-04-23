# Runbook: Generate CSR

## Purpose

Generate CSR and key material for an onboarding record before OTP submission.

## Prerequisites

- onboarding record exists in `DRAFT` or `FAILED`
- permissions: `compliance.write` and `platform.org.manage`
- required onboarding fields are present:
  - `commonName`
  - `organizationName`
  - `vatNumber`
  - `countryCode`
  - `deviceSerial`

## Exact Steps

1. Fetch onboarding record:
   - `GET /v1/compliance/onboarding/:id`
2. Confirm status is `DRAFT` or `FAILED`.
3. Generate CSR:
   - `POST /v1/compliance/onboarding/:id/generate-csr`
4. Verify updated onboarding:
   - `status = CSR_GENERATED`
   - `certificateStatus = CSR_GENERATED`
   - `csrGeneratedAt` is populated
   - CSR/key fields are present in storage but not exposed as plaintext secrets in UI/API summaries.

## Expected Results

- new CSR generated for the onboarding record
- event `compliance.onboarding.csr_generated` is recorded
- onboarding is ready for OTP request stage

## Failure Cases

- `400` if onboarding status is not allowed
- `400` if required fields are missing
- secret/key configuration errors if encryption/decryption setup is invalid

## Escalation Notes

- if CSR generation fails repeatedly for valid inputs, escalate to compliance crypto owner
- if encryption key errors occur, escalate to deployment/config owner immediately
