# AGENTS.md

## Project source of truth
- Inspect `/reference/hesaab-screenshots` before making UI, route, flow, or module decisions.
- Inspect `/reference/zatca-docs` before making invoice, tax, QR, UUID, XML, reporting, or compliance decisions.
- Do not invent product features beyond what is evidenced by the screenshots and compliance docs.
- Daftar is the source of truth for invoicing and compliance.
- Xero, QuickBooks Online, and Zoho Books are connectors only.

## Workflow
- First analyze, then propose, then implement.
- Build in vertical slices.
- After each slice, run tests and report failures clearly.
- Prefer TODO markers over fake finished functionality.
