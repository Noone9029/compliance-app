# Runbook: Onboard New Client or Device

## Purpose

Create a tenant-scoped onboarding record for a new ZATCA device and start the staged lifecycle.

## Prerequisites

- authenticated session in target organization
- permissions: `compliance.write` and `platform.org.manage`
- organization tax data configured (`organizationTaxDetail` exists)
- chosen environment (`Production` or `Sandbox`)
- device identity data:
  - `deviceSerial`
  - `commonName`
  - `organizationName`
  - `vatNumber` (15 digits)
  - optional branch/location/unit fields

## Exact Steps

1. Set integration environment if needed:
   - `PUT /v1/compliance/integration`
   - body includes `environment` and `mappings`.
2. Create onboarding draft:
   - `POST /v1/compliance/onboarding/prepare`
   - send device identity payload.
3. Verify response fields:
   - `id`
   - `status = DRAFT`
   - `certificateStatus = NOT_REQUESTED`
   - expected device identity values.
4. Verify timeline in integration response:
   - `GET /v1/compliance/integration`.

## Expected Results

- onboarding record exists for organization and device serial
- onboarding status is `DRAFT`
- event `compliance.onboarding.prepared` is present

## Failure Cases

- `400` for invalid payload (for example VAT length)
- `404` if organization context is invalid
- permission failure if caller lacks admin lifecycle permissions

## Escalation Notes

- if multiple onboarding records exist for same device serial unexpectedly, escalate to backend support
- if tax profile is missing, route to organization setup before continuing onboarding
