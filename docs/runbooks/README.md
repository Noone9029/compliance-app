# Operational Runbooks

This folder contains support runbooks for compliance/onboarding operations.

Use these runbooks with current API routes under `v1/compliance` and current worker behavior in:

- `apps/api/src/modules/compliance/compliance.controller.ts`
- `apps/api/src/modules/compliance/compliance.service.ts`
- `apps/api/src/modules/compliance/compliance-processor.ts`
- `apps/worker/src/compliance-worker.ts`

## Runbooks

- [Operator Quick Reference](./operator-quick-reference.md)
- [Onboard New Client or Device](./onboarding-new-client-device.md)
- [Generate CSR](./generate-csr.md)
- [Submit OTP](./submit-otp.md)
- [Activate Onboarding](./activate-onboarding.md)
- [Renew Certificate](./renew-certificate.md)
- [Revoke Device](./revoke-device.md)
- [Handle Validation Failures](./handle-validation-failures.md)
- [Handle Rejected Submissions](./handle-rejected-submissions.md)
- [Handle Dead-Letter Items](./handle-dead-letter-items.md)
- [Safe Retry and Requeue](./safe-retry-requeue.md)
- [Deployment Smoke Checks](./deployment-smoke-checks.md)
- [Post-Deploy Verification](./post-deploy-verification.md)

## Permission Model Used by These Runbooks

- `compliance.read`: overview, integration, documents, dead-letter read
- `compliance.report`: invoice report/retry, dead-letter acknowledge/escalate/requeue
- `compliance.write` + `platform.org.manage`: onboarding lifecycle actions (prepare, CSR, OTP, activate, renew, revoke)

## Related Documentation

- [Hosted Deployment Configuration](../deployment-configuration.md)
- [Compliance Live Lane](../compliance-live-lane.md)
