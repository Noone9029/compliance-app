# Daftar Preview Deployment

This repo now supports two preview paths:

1. local containerized preview
2. split hosted preview with the web on Vercel and the API/worker on Render or Railway

## 1. Local containerized preview

Prerequisites:

- Docker Desktop
- `pnpm`

Steps:

```powershell
Copy-Item .env.example .env -ErrorAction SilentlyContinue
pnpm db:up
pnpm db:deploy
pnpm db:seed
pnpm preview:up
```

Open:

- Web: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:4000/health](http://localhost:4000/health)
- API ready: [http://localhost:4000/ready](http://localhost:4000/ready)

Stop the preview stack:

```powershell
pnpm preview:down
```

Notes:

- The preview compose file overrides `DATABASE_URL`, `REDIS_URL`, and `INTERNAL_API_URL` so the containers can talk to each other.
- Browser requests still use `NEXT_PUBLIC_API_URL=http://localhost:4000`.

## 2. Split hosted preview

### Web service

Deploy `apps/web`.

- Runtime: Node 20
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @daftar/web build`
- Start command: `pnpm --filter @daftar/web start`

Required environment variables:

- `NODE_ENV=production`
- `APP_BASE_URL=https://<your-web-host>`
- `NEXT_PUBLIC_API_URL=https://<your-api-host>`
- `INTERNAL_API_URL=https://<your-api-host>`
- `NEXT_PUBLIC_APP_NAME=Daftar`

On Vercel, set the project root directory to `apps/web`.

### API service

Deploy with the Dockerfile at `apps/api/Dockerfile`.

Required environment variables:

- `NODE_ENV=production`
- `PORT=4000`
- `APP_BASE_URL=https://<your-web-host>`
- `NEXT_PUBLIC_API_URL=https://<your-api-host>`
- `INTERNAL_API_URL=https://<your-api-host>`
- `DATABASE_URL=<managed-postgres-url>`
- `REDIS_URL=<managed-redis-url>`
- `SESSION_COOKIE_NAME=daftar_session`
- `SESSION_COOKIE_SAME_SITE=none`
- `SESSION_COOKIE_SECURE=true`
- `SESSION_TTL_HOURS=12`
- `AUTH_BCRYPT_ROUNDS=10`
- `STRIPE_SECRET_KEY=<preview-value>`
- `STRIPE_WEBHOOK_SECRET=<preview-value>`
- `XERO_CLIENT_ID=<preview-value>`
- `XERO_CLIENT_SECRET=<preview-value>`
- `QBO_CLIENT_ID=<preview-value>`
- `QBO_CLIENT_SECRET=<preview-value>`
- `ZOHO_CLIENT_ID=<preview-value>`
- `ZOHO_CLIENT_SECRET=<preview-value>`
- `ZATCA_BASE_URL=<preview-value>`
- `ZATCA_CLIENT_ID=<preview-value>`
- `ZATCA_CLIENT_SECRET=<preview-value>`

Deploy-time commands:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @daftar/api build
pnpm exec prisma migrate deploy --schema apps/api/prisma/schema.prisma
pnpm --filter @daftar/api start
```

### Worker service

Deploy with the Dockerfile at `apps/worker/Dockerfile`.

Required environment variables:

- `NODE_ENV=production`
- `DATABASE_URL=<managed-postgres-url>`
- `REDIS_URL=<managed-redis-url>`

Deploy-time commands:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @daftar/worker build
pnpm --filter @daftar/worker start
```

## Seeded users

After seeding, use one of these accounts:

- `owner@daftar.local` / `Password123!`
- `admin@daftar.local` / `Password123!`
- `viewer@daftar.local` / `Password123!`

## What this preview validates

- auth and tenant switching
- settings and contacts
- invoices, bills, quotes, and compliance screens
- connectors, subscription pages, fixed assets, reports, and charts

## Current preview limits

- Stripe and connector flows are validated inside the app, but they are still preview implementations, not live provider traffic.
- API and worker services intentionally run through `tsx` at start time because the workspace packages are still TS-first. This keeps the preview packaging small and low-risk without refactoring the runtime model.
