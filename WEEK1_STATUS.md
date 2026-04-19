# Week 1 Status

## Completed Items
- Monorepo scaffold with `apps/web`, `apps/api`, `apps/worker`, `packages/config`, `packages/types`, `packages/ui`, and `packages/sdk`.
- Root project rules in `AGENTS.md`, root workspace config, local `.env`, `.env.example`, Docker compose, and deterministic workspace env runner.
- Shared typed env/config loading, feature flags, and queue constants.
- Prisma v1 schema limited to Week 1 platform scope only:
  - `User`
  - `AuthIdentity`
  - `Session`
  - `Organization`
  - `Membership`
  - `Role`
  - `Permission`
  - `RolePermission`
  - `OrganizationSetting`
  - `AuditLog`
- Initial Prisma migration and repeatable seed baseline.
- Seed baseline now includes a multi-organization owner account so org switching is testable from seeded data.
- NestJS platform modules for:
  - auth
  - users
  - organizations
  - memberships
  - rbac
  - audit
  - health
- Cookie-session auth flow, current session lookup, current user endpoint, org switching, memberships lookup, capability snapshot, request correlation IDs, and audit logging baseline.
- Health and readiness endpoints.
- Next.js app shell with:
  - sign-in page
  - invite acceptance stub page
  - password reset request stub page
  - password reset stub page
  - tenant-aware shell layout
  - header org switcher for multi-organization memberships
  - all locked Week 1 top-level module routes
  - all locked Week 1 accounting subsection routes
  - authenticated debug session page
- BullMQ/worker bootstrap skeleton.
- Week 1 API and web tests.

## Stubbed Items
- Invitation acceptance flow is intentionally stubbed.
- Password reset request and password reset pages are shell/stub pages only.
- Module pages beyond Week 1 platform scope render shell placeholders only.
- Authenticated debug session page is internal/debug-oriented, not end-user product UI.

## Deferred Items
- All Week 2+ business workflows:
  - contacts CRUD
  - accounting setup CRUD
  - sales
  - purchases
  - quotes
  - reports/charts data workflows
  - compliance workflows
  - Stripe billing
  - deep connector sync
  - fixed assets workflows
- External email delivery.
- Prisma config migration away from deprecated `package.json#prisma.seed`.

## Known Issues
- Non-blocking warning: Prisma seed configuration still uses deprecated `package.json#prisma.seed`; migrate later to `prisma.config.ts`.
- Turbo warns that some test tasks do not declare outputs. This does not block Week 1 execution or validation.

## Test Results
- Full Week 1 gate passed:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm db:seed`
  - `prisma migrate status`
  - `pnpm --filter @daftar/api test`
- Live Week 1 verification passed for:
  - sign in
  - sign out
  - session persistence after refresh
  - org switching
  - nav changes across seeded roles
  - `/health`
  - `/ready`
  - authenticated debug session page data
  - audit log writes for auth and org actions
- Passing tests:
  - `Daftar Week 1 platform > returns health and ready status`
  - `Daftar Week 1 platform > supports sign-in, session refresh, membership lookup, and sign-out`
  - `Daftar Week 1 platform > switches organization and exposes capability snapshot`
  - `Daftar Week 1 platform > writes audit events for sign-in and organization switch`
  - `Daftar Week 1 platform > keeps invitation acceptance stubbed`
  - `tenant route map > covers all locked week 1 paths`
  - `tenant route map > resolves nested paths through the catch-all route`
  - `DebugSessionPanel > renders current session details`
- Failing tests:
  - none

## Recommendation
- Ready for Week 2.
