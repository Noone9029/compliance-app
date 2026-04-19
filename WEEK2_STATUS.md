# Week 2 Status

## Completed Items
- Accounting setup masters are implemented for currencies, tax rates, organisation tax details, tracking categories and options, bank accounts, chart of accounts, invoice settings, email templates, and custom organisation settings.
- Contacts module is implemented for contacts, customers, suppliers, groups, contact detail, and contact create/edit flows with addresses, contact numbers, balances, and attached file metadata.
- Connector settings scope is implemented for connector account records, connector sync log records, connector settings UI, and metadata-only create/update/list flows for Xero, QuickBooks Online, and Zoho Books.
- File attachment metadata and storage abstraction are implemented through stored file records and API endpoints for listing and creating file metadata.
- Expanded seed data now covers realistic Week 2 demo flows across two organizations, including setup masters, contacts, contact groups, connector accounts, connector sync logs, and stored file metadata.
- Week 1 regression coverage remains passing inside the Week 2 API and web test gate.

## Stubbed Items
- Connector flows are metadata-only and OAuth-ready. No real token exchange, sync orchestration, import/export execution, or reconciliation logic is implemented.
- File handling is metadata-only. No binary upload, signed URL generation, download flow, or object lifecycle management is implemented.
- Week 2 pages outside the locked domains still use the existing Week 1 placeholders.

## Deferred Items
- Sales workflows.
- Purchases workflows.
- Quotes workflows.
- Compliance business logic.
- Stripe flows.
- Deep connector sync logic.
- Fixed assets workflows.
- Reports and charts data workflows beyond what Week 2 required.

## Known Issues
- Prisma emits a non-blocking warning that `package.json#prisma.seed` is deprecated and should later move to `prisma.config.ts`.
- Turbo emits non-blocking warnings about missing declared outputs for some `test` tasks.
- On Windows, Prisma generate can conflict on the query engine DLL if `pnpm test` and `pnpm typecheck` are launched in parallel. The Week 2 closeout gate passes when run sequentially.

## Test Results
- `pnpm db:seed`: passed.
- `pnpm --filter @daftar/api test`: passed.
- `pnpm --filter @daftar/web test`: passed.
- `pnpm typecheck`: passed.
- `prisma migrate status --schema apps/api/prisma/schema.prisma`: passed.

### Passing Tests
- `Daftar Week 2 foundation > supports setup master CRUD and singleton settings`
- `Daftar Week 2 foundation > supports contacts CRUD, groups, files on detail view, and tenant isolation`
- `Daftar Week 2 foundation > supports connector settings metadata and sync log listing`
- `Daftar Week 2 foundation > enforces Week 2 permissions for viewer role`
- `Daftar Week 1 platform > returns health and ready status`
- `Daftar Week 1 platform > supports sign-in, session refresh, membership lookup, and sign-out`
- `Daftar Week 1 platform > switches organization and exposes capability snapshot`
- `Daftar Week 1 platform > writes audit events for sign-in and organization switch`
- `Daftar Week 1 platform > keeps invitation acceptance stubbed`
- `week2 route utils > builds settings navigation links`
- `week2 route utils > builds contacts navigation links`
- `week2 route utils > checks permissions against capability snapshots`
- `tenant route map > covers all locked week 1 paths`
- `tenant route map > resolves nested paths through the catch-all route`
- `DebugSessionPanel > renders current session details`

### Failing Tests
- None.
