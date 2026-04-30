# Daftar Hosted Deployment Configuration

This document is the deployment reference for the current codebase.

Operational support procedures are documented in:

- `docs/runbooks/README.md`

## Service Responsibilities

- `apps/api`
  - HTTP API, auth/session, business modules
  - compliance orchestration and queue scheduling
  - connector OAuth endpoints
- `apps/worker`
  - compliance queue consumer
  - submission retries, dead-letter handling, event progression
- `apps/web`
  - admin/operator/client UI
  - browser traffic and server-side rendering
- Infrastructure
  - PostgreSQL: primary persistence
  - Redis: queue transport/backoff/dead-letter
  - S3-compatible private object storage: attachments/artifacts

## Production Startup Checks

- API startup (`apps/api/src/main.ts`) enforces required production env via `loadServiceEnv("api")`.
- Worker startup (`apps/worker/src/compliance-worker.ts`) enforces required production env via `loadServiceEnv("worker")`.
- Web build/start scripts (`apps/web/scripts/build.mjs`, `apps/web/scripts/start.mjs`) enforce required web env in production mode.

If required production values are missing, services fail fast with explicit messages.

## Local Environment Files

| File | Gitignored | Loaded by |
|---|---|---|
| `.env` (root) | ✅ | preview compose, workspace scripts |
| `.env.local` (root) | ✅ | workspace scripts only |
| `apps/api/.env` | ✅ | workspace scripts only |
| `apps/api/.env.local` | ✅ | workspace scripts only |
| `.env.example` (root) | ❌ tracked | template only — never loaded at runtime |

**Do not commit any `.env` file.** Use `.env.example` as the reference template.  
For local development, copy `.env.example` to `.env` at the repo root, or work  
directly from `apps/api/.env` — both paths are supported.

## Required Environment Variables by Service

### API (`apps/api`)

Required in production:

- `NODE_ENV=production`
- `APP_BASE_URL`
- `NEXT_PUBLIC_API_URL`
- `INTERNAL_API_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_COOKIE_NAME`
- `SESSION_COOKIE_SAME_SITE`
- `SESSION_COOKIE_SECURE`
- `SESSION_TTL_HOURS`
- `AUTH_BCRYPT_ROUNDS`
- `COMPLIANCE_ENCRYPTION_KEY`
- `CONNECTOR_SECRETS_KEY`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

Recommended:

- `LOG_LEVEL=info`
- `ZATCA_BASE_URL=https://gw-fatoora.zatca.gov.sa`
- `ZATCA_SDK_CLI_PATH=fatoora`
- `ZATCA_LOCAL_VALIDATION_MODE=required` (or `best-effort`)

Optional feature vars:

- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Connectors: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`

Production startup rejects local/default storage values such as `http://localhost:9000`, `daftar-local`, and `minioadmin`.

Storage is provider-neutral and uses the S3-compatible API configured through the endpoint and credentials above. Supported deployment targets include AWS S3, Cloudflare R2, Wasabi, DigitalOcean Spaces, MinIO, or any compatible private object storage provider. Local MinIO is acceptable for development/test only and is rejected by production startup checks.

Bucket requirements:

- keep the bucket private; do not enable public object access
- grant the API service account permission to read, write, delete only where operationally required, and perform bucket readiness checks
- use signed upload/download URLs for temporary browser or integration access
- avoid hardcoding provider-specific public URL assumptions; `S3_ENDPOINT` is the source of truth
- configure object retention/backups according to compliance and customer contract requirements

### Worker (`apps/worker`)

Required in production:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `COMPLIANCE_ENCRYPTION_KEY`

Recommended:

- `LOG_LEVEL=info`
- same compliance/environment settings used by API for consistency

### Web (`apps/web`)

Required in production:

- `NODE_ENV=production`
- `APP_BASE_URL`
- `NEXT_PUBLIC_API_URL`
- `INTERNAL_API_URL`

Optional:

- `NEXT_PUBLIC_APP_NAME`
- `WEB_PORT` or `PORT`

## Deprecated / Legacy Guidance

Do not use:

- `ZATCA_CLIENT_ID`
- `ZATCA_CLIENT_SECRET`

Current model:

- ZATCA credentials are provisioned through onboarding per device/environment.
- Active credentials are selected from onboarding records during submission.
- Secrets are encrypted at rest and not exposed in read models.

## Safe Defaults and Assumptions

Local defaults in `packages/config/src/index.ts` are for development convenience only.

- Production should set explicit env values through the deployment platform.
- Avoid relying on fallback defaults for infrastructure/security-sensitive keys.
- `COMPLIANCE_ENCRYPTION_KEY` must be a real 32-byte production key using `base64:...`, `hex:...`, or raw 64-character hex format.
- `CONNECTOR_SECRETS_KEY` must be at least 32 characters and must not use the local development default.
- Optional Stripe and connector credentials must not be set to placeholder values in production.
- `COMPLIANCE_ENCRYPTION_PREVIOUS_KEYS` can be set during rotation windows.

## Startup and Migration Order

1. Bring up PostgreSQL and Redis.
2. Run Prisma migrations:
   - `pnpm db:deploy`
3. (Optional, non-production) run seed:
   - `pnpm db:seed`
4. Start API.
5. Start Worker.
6. Start Web.

## Queue, Database, and Storage Dependencies

- Worker requires Redis queue connectivity before processing jobs.
- API readiness currently checks database and S3-compatible storage connectivity (`/ready`).
- Compliance/background flow expects both Postgres and Redis healthy.
- File and artifact operations expect configured S3-compatible storage.

## Live ZATCA Lane (Optional)

Non-mocked live lane is opt-in:

- `docs/compliance-live-lane.md`
- enabled with `LIVE_ZATCA_E2E=1` plus required live-lane vars

This lane is separate from normal production startup requirements.
