# Runbook: Revoke Device

## Purpose

Revoke active credential material for a device and prevent further submission use.

## Prerequisites

- onboarding record exists with credential material (`csid`, certificate secret)
- permissions: `compliance.write` and `platform.org.manage`
- optional business reason string for audit context

## Exact Steps

1. Fetch onboarding:
   - `GET /v1/compliance/onboarding/:id`
2. Trigger revoke:
   - `POST /v1/compliance/onboarding/:id/revoke`
   - optional body: `{ "reason": "<text>" }`
3. Re-fetch onboarding:
   - `GET /v1/compliance/onboarding/:id`
4. Confirm current active onboarding view:
   - `GET /v1/compliance/onboarding/current`

## Expected Results

- onboarding transitions to:
  - `status = REVOKED`
  - `certificateStatus = REVOKED`
  - `revokedAt` set
- event `compliance.onboarding.revoked` recorded
- worker submission guard blocks use of revoked onboarding

## Failure Cases

- `400` when credential material is missing
- `400` when certificate secret cannot be decrypted
- upstream revocation failure records `lastError` and event `compliance.onboarding.revocation_failed`

## Escalation Notes

- if revocation fails but device must be disabled urgently, disable operational submission usage at org level and escalate to admin/compliance owner
