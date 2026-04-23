# Compliance Secret Hygiene

This module treats the following fields as protected at rest and in runtime output:

- `privateKeyPem`
- `certificateSecret`
- `otpCode`
- raw private-key PEM blocks
- authorization headers (`Basic ...`, `Bearer ...`)
- secret-bearing keys in structured payloads (for example `secret`, `password`, `clientSecret`, `accessToken`, `refreshToken`)

## Storage Rules

- `privateKeyPem` is encrypted before persistence.
- `certificateSecret` is encrypted before persistence.
- Seeded onboarding records are encrypted at insert time through `protectSeedComplianceSecrets(...)`.
- Seed insert fails if encrypted payloads do not use the `enc:v1:` envelope.

## Decrypt-On-Use Flow

- Secrets are decrypted only at call sites that require them:
  - signing path (private key use)
  - transport/onboarding auth path (certificate secret use)
- Decrypted values are not returned from API read models.
- When legacy plaintext values are encountered, they are re-encrypted immediately with the current key.

## Output/Logging Redaction

- `secret-redaction.ts` redacts protected fields recursively for:
  - onboarding metadata snapshots
  - thrown error messages surfaced to service/controller boundaries
  - transport/local-validation error and debug text
  - seed script failure logging
- API read models intentionally expose only non-secret fields (`hasCsr`, `hasCertificate`, status/timestamps/fingerprints).

