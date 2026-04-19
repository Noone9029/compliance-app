# Week 3 Status

## Completed Items
- Sales invoices end to end:
  - list and detail API/UI
  - create and update flows
  - payment recording
  - status timeline
  - compliance reporting action from invoice detail and compliance page
- Purchases end to end:
  - bills list and detail API/UI
  - create and update flows
  - payment recording
- Quotes end to end:
  - list and detail API/UI
  - create and update flows
  - convert quote to invoice flow
- Compliance core:
  - UUID generation
  - QR payload generation
  - previous-hash/current-hash generation
  - compliance document persistence
  - reported documents log
  - submission log model
  - overview dashboard
- Core-v1 reports and charts live on real data:
  - reports dashboard
  - charts dashboard
  - real seeded and live API-backed figures
- Week 3 migration created and applied
- Week 3 seed data expanded for invoices, bills, quotes, payments, compliance records, and linked attachment metadata

## Stubbed Items
- File attachments remain metadata/storage records only. No binary upload/download handling was added in Week 3.
- Compliance reporting uses the internal Week 3 success-path pipeline only. No external ZATCA transport, certificate onboarding flow, or asynchronous retry worker was added in this slice.
- Reports and charts are delivered as core-v1 dashboard pages only. They are not expanded into the Week 4 extended report set.

## Deferred Items
- Stripe flows
- Deep connector sync logic
- Fixed assets registration and depreciation workflows
- Extended reports and charts
- Shell module expansion
- Any Week 4 work
- Sales credit notes and repeating invoices
- Purchase credit notes, purchase orders, and repeating bills

## Known Issues
- Prisma warns that `package.json#prisma.seed` is deprecated and should be moved to `prisma.config.ts` in a later cleanup pass.
- The safest validation path on Windows remains sequential execution for database and Prisma-related commands.
- No P0 or P1 blockers remain after the Week 3 closeout pass.

## Test Results
- Sequential gate commands passed:
  - `pnpm db:seed`
  - `pnpm --filter @daftar/api test`
  - `pnpm --filter @daftar/web test`
  - `pnpm typecheck`
  - `pnpm exec prisma migrate status --schema apps/api/prisma/schema.prisma`
- Passing tests:
  - `Daftar Week 1 platform > returns health and ready status`
  - `Daftar Week 1 platform > supports sign-in, session refresh, membership lookup, and sign-out`
  - `Daftar Week 1 platform > switches organization and exposes capability snapshot`
  - `Daftar Week 1 platform > writes audit events for sign-in and organization switch`
  - `Daftar Week 1 platform > keeps invitation acceptance stubbed`
  - `Daftar Week 2 foundation > supports setup master CRUD and singleton settings`
  - `Daftar Week 2 foundation > supports contacts CRUD, groups, files on detail view, and tenant isolation`
  - `Daftar Week 2 foundation > supports connector settings metadata and sync log listing`
  - `Daftar Week 2 foundation > enforces Week 2 permissions for viewer role`
  - `Daftar Week 3 accounting core > supports sales invoices end to end including compliance reporting`
  - `Daftar Week 3 accounting core > supports purchases end to end`
  - `Daftar Week 3 accounting core > supports quotes end to end including conversion to invoice`
  - `Daftar Week 3 accounting core > returns live core-v1 reports and charts data and enforces read-only permissions`
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
- Failing tests:
  - none
