# Runbook: Renew Certificate

## Purpose

Renew an active production credential for a device using a new OTP.

## Prerequisites

- onboarding is `ACTIVE` or `RENEWAL_REQUIRED`
- `certificateStatus = ACTIVE`
- onboarding not revoked
- permissions: `compliance.write` and `platform.org.manage`
- renewal OTP available

## Exact Steps

1. Fetch onboarding:
   - `GET /v1/compliance/onboarding/:id`
2. Confirm status and certificate status are eligible.
3. Renew:
   - `POST /v1/compliance/onboarding/:id/renew`
   - body: `{ "otpCode": "<6-12 chars>" }`
4. Re-fetch onboarding and integration summary.

## Expected Results

- onboarding stays `ACTIVE` with new credential material
- `lastRenewedAt` updated
- archived credential metadata is appended in lifecycle metadata
- event `compliance.onboarding.renewed` recorded

## Failure Cases

- `400` if onboarding is not active
- `400` if onboarding is revoked
- `400` if active credential material is missing or undecryptable
- renewal API failure sets `lastError` and records `compliance.onboarding.renewal_failed`

## Escalation Notes

- if renewal fails after multiple OTP attempts, create a new onboarding cycle instead of forcing retries on stale OTP
- if renewal failures are environment-wide, escalate as provider integration incident
