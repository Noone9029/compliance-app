# Compliance Live Lane (Opt-In)

This repository includes an opt-in non-mocked ZATCA onboarding lane:

- Test file: `apps/api/src/week12-compliance-onboarding-live.e2e.spec.ts`
- Enabled only when `LIVE_ZATCA_E2E=1`
- Disabled by default for CI and local runs without credentials

## Required Environment Variables

- `LIVE_ZATCA_E2E=1`
- `LIVE_ZATCA_ORG_SLUG`
- `LIVE_ZATCA_DEVICE_SERIAL`
- `LIVE_ZATCA_COMMON_NAME`
- `LIVE_ZATCA_ORGANIZATION_NAME`
- `LIVE_ZATCA_VAT_NUMBER` (15 digits)
- `LIVE_ZATCA_OTP`

Optional:

- `LIVE_ZATCA_TEST_EMAIL` (default: `admin@daftar.local`)
- `LIVE_ZATCA_COUNTRY_CODE` (default: `SA`)
- `LIVE_ZATCA_ORGANIZATION_UNIT_NAME`
- `LIVE_ZATCA_BRANCH_NAME`
- `LIVE_ZATCA_LOCATION_ADDRESS`
- `LIVE_ZATCA_INDUSTRY`
- `LIVE_ZATCA_RENEW_OTP` (enables renewal step)
- `LIVE_ZATCA_ALLOW_REVOKE=1` (enables revoke step, destructive)

## Run

```bash
pnpm --filter @daftar/api exec vitest run src/week12-compliance-onboarding-live.e2e.spec.ts
```

## Notes

- `ZATCA_BASE_URL` should be `https://gw-fatoora.zatca.gov.sa`.
- Do not set global `ZATCA_CLIENT_ID` / `ZATCA_CLIENT_SECRET`; onboarding credentials are per device.
- Endpoint routing is derived from onboarding environment:
  - `Production` -> `/e-invoicing/core`
  - `Sandbox` -> `/e-invoicing/simulation`
- In test mode, onboarding client stays mocked **unless** `LIVE_ZATCA_E2E=1`.
