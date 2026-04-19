# Week 4 Status

## completed items
- Deferred Week 3 accounting items are complete and validated for sales credit notes, repeating invoices, purchase credit notes, purchase orders, and repeating bills.
- Repeating invoice and repeating bill schedules now execute run behavior that creates live invoices and bills, advances `nextRunAt`, and writes audit events.
- Connector remediation is complete for connector settings persistence, export sync job creation, bootstrap import job creation/execution, retry handling, sync log creation/listing, and tenant isolation.
- Canonical mapper validation is complete for Xero, QuickBooks Online, and Zoho Books through adapter-level tests that verify provider-shaped export payloads and provider-to-canonical import mapping without leaking provider-specific schemas into the core domain.
- Stripe billing remediation is complete for plan loading, subscription create/update/cancel behavior, billing account persistence, invoice history, webhook-driven subscription state updates, and tenant isolation.
- Fixed assets and straight-line depreciation remain validated and do not break core accounting flows.
- Extended reports and charts are now validated against a shared derived-ledger consistency layer that keeps balance sheet, trial balance, and extended chart values internally consistent on live API-backed data.
- Full regression remains green for Week 1 through Week 4 critical flows.
- Release gate commands passed for seed, API tests, web tests, typecheck, Prisma migration status, and production builds for web, api, and worker.

## stubbed items
- Connector transport remains internal-adapter based. OAuth token exchange and live provider API calls are still not wired in this repo.
- Stripe remains a Stripe-shaped internal lifecycle implementation. Real checkout, hosted portal, and external Stripe API calls are still not wired in this repo.
- Fixed assets support straight-line depreciation only; broader disposal, transfer, and posting workflows are still intentionally limited.
- File handling remains metadata/storage abstraction only.

## deferred items
- Real external connector OAuth transport and reconciliation workflows remain deferred.
- Real external Stripe checkout, customer portal, and processor-driven collection flows remain deferred.
- Broader fixed-asset lifecycle handling beyond straight-line depreciation remains deferred.
- Any post-Week-4 module expansion remains deferred.

## known issues
- No P0 or P1 release blockers remain.
- Prisma still warns that `package.json#prisma.seed` is deprecated and should move to `prisma.config.ts`.
- Prisma commands should continue using the workspace env wrapper on this machine.
- Prisma/database validation remains safest when run sequentially on Windows.

## test results
- `pnpm db:seed`: passed
- `pnpm --filter @daftar/api test`: passed
- `pnpm --filter @daftar/web test`: passed
- `pnpm typecheck`: passed
- `pnpm exec prisma migrate status --schema apps/api/prisma/schema.prisma`: passed
- `pnpm --filter @daftar/web build`: passed
- `pnpm --filter @daftar/api build`: passed
- `pnpm --filter @daftar/worker build`: passed
- Passing automated tests:
  - `Daftar Week 4 release blockers > validates connector bootstrap import job execution, retry handling, and tenant isolation across Xero, QuickBooks Online, and Zoho Books`
  - `Daftar Week 4 release blockers > validates Stripe plans, subscription lifecycle, webhook handling, invoice history, and tenant isolation`
  - `Daftar Week 4 release blockers > validates repeating invoice and repeating bill run behavior`
  - `Daftar Week 4 release blockers > validates journal-backed consistency for extended reports and charts on live data`
  - `Daftar Week 4 extensions > supports sales credit notes and repeating invoices end to end`
  - `Daftar Week 4 extensions > supports purchase credit notes, purchase orders, and repeating bills end to end`
  - `Daftar Week 4 extensions > supports connector export flows, billing, fixed assets, and extended reports`
  - `Daftar Week 4 extensions > enforces Week 4 write restrictions while keeping read access intact`
  - `Daftar Week 3 accounting core > supports sales invoices end to end including compliance reporting`
  - `Daftar Week 3 accounting core > supports purchases end to end`
  - `Daftar Week 3 accounting core > supports quotes end to end including conversion to invoice`
  - `Daftar Week 3 accounting core > returns live core-v1 reports and charts data and enforces read-only permissions`
  - `Daftar Week 2 foundation > supports setup master CRUD and singleton settings`
  - `Daftar Week 2 foundation > supports contacts CRUD, groups, files on detail view, and tenant isolation`
  - `Daftar Week 2 foundation > supports connector settings metadata and sync log listing`
  - `Daftar Week 2 foundation > enforces Week 2 permissions for viewer role`
  - `Daftar Week 1 platform > returns health and ready status`
  - `Daftar Week 1 platform > supports sign-in, session refresh, membership lookup, and sign-out`
  - `Daftar Week 1 platform > switches organization and exposes capability snapshot`
  - `Daftar Week 1 platform > writes audit events for sign-in and organization switch`
  - `Daftar Week 1 platform > keeps invitation acceptance stubbed`
  - `connector adapters > maps Xero bootstrap payloads into canonical records and exports provider-shaped records`
  - `connector adapters > maps QuickBooks payloads into canonical records without leaking provider schema`
  - `connector adapters > maps Zoho payloads into canonical records and keeps provider-specific fields out of the core domain`
  - `derived-ledger > keeps trial balance debits and credits aligned`
  - `derived-ledger > keeps balance sheet assets equal to liabilities plus equity`
  - `derived-ledger > includes revenue, expense, and balancing equity lines for extended report validation`
  - `document-calculations > calculates line totals, tax totals, and document totals`
  - `document-calculations > derives invoice status from payment progress`
  - `document-calculations > derives bill status from payment progress`
  - `compliance-core > generates UUIDs`
  - `compliance-core > hashes values deterministically`
  - `compliance-core > builds a base64 qr payload and chained hashes`
  - `tenant route map > covers all locked week 1 paths`
  - `tenant route map > resolves nested paths through the catch-all route`
  - `week2 route utils > builds settings navigation links`
  - `week2 route utils > builds contacts navigation links`
  - `week2 route utils > checks permissions against capability snapshots`
  - `DebugSessionPanel > renders current session details`
  - `week3 shared helpers > formats money and dates`
  - `week3 shared helpers > maps statuses to tones`
  - `DocumentDetail > renders sales invoice detail including compliance metadata`
  - `DocumentDetail > renders quote conversion link when a quote has been converted`
  - `billing page > renders the add-ons posture with live subscription metrics`
  - `billing page > renders invoice history on the invoices section`
  - `Week 4 forms > renders the credit note form with linked document controls`
  - `Week 4 forms > renders billing summary fields and disables updates when write access is missing`
  - `Week 4 forms > renders the fixed asset form with core depreciation inputs`
- Failing automated tests: none
- Release verdict: release-ready
