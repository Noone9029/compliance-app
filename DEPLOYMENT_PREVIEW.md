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
