# Daftar Deployment Preview

Use this file for the quick-start preview path.  
For full service-by-service hosted configuration, see:

- `docs/deployment-configuration.md`

## 1. Local containerized preview

Prerequisites:

- Docker Desktop
- `pnpm`

Steps:

```powershell
# Option A — create a root .env from the template (simplest)
Copy-Item .env.example .env

# Option B — skip root .env; scripts and preview compose
#             will fall back to apps/api/.env automatically
pnpm db:up
pnpm db:deploy
pnpm db:seed
pnpm preview:up
```

### Environment files

| File | Purpose | Tracked by git |
|---|---|---|
| `.env.example` | Template — copy to `.env` to get started | ✅ yes |
| `.env` (root) | Root overrides loaded by scripts and preview compose | ❌ no (gitignored) |
| `apps/api/.env` | App-level local dev vars | ❌ no (gitignored) |
| `apps/api/.env.local` | App-level local overrides (highest priority) | ❌ no (gitignored) |

**How preview compose loads env:**  
`docker-compose.preview.yml` declares `env_file` with `required: false` for both `.env`
and `apps/api/.env`. If neither file exists, the inline `environment:` block still
provides all values needed to start the stack. No hard-fail on a clean checkout.

**How workspace scripts load env:**  
`scripts/run-with-workspace-env.mjs` reads files in this order (later files win):
1. `.env` (root)
2. `.env.local` (root)
3. `apps/api/.env`
4. `apps/api/.env.local`
5. `process.env` (always wins)

Missing files are silently skipped — the script never hard-fails due to an absent file.

Open:

- Web: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:4000/health](http://localhost:4000/health)
- API ready: [http://localhost:4000/ready](http://localhost:4000/ready)

Stop the preview stack:

```powershell
pnpm preview:down
```

## 2. Hosted preview (split services)

Deploy services in this order:

1. Database + Redis
2. API (with migrations)
3. Worker
4. Web

Required per-service variables are documented in:

- `docs/deployment-configuration.md`

## Notes

- ZATCA no longer uses global `ZATCA_CLIENT_ID` / `ZATCA_CLIENT_SECRET` env variables.
- Device credentials are provisioned and rotated through onboarding, then stored per device.
- The API and worker now enforce production startup checks for required env vars.
