# Axis dashboard implementation

Internal workflow: authorized staff select the linked client organization and unit/registration, upload extracted XLSX, validate source identity and coverage, choose retention, preview and explicitly publish. BOT outputs are never automatically retained or exposed to clients.

Reference mapping: business dashboard; companies/units; certificate inventory; expiry monitoring; procurement; reconciliation/data quality; action detail/comments/evidence; SPOC/advisory; reports and corrected management review; notifications; subscription/billing; settings/data governance. The priority-roadmap image is planning guidance, not a fake operational dashboard. Conflicting illustrative figures/logos are replaced by one consistent ORQIX shell and real published values. No demo numbers become production records.

Checklist:
- [x] Scoped XLSX parsing, identity review, retention and publish/revoke
- [x] Latest-snapshot selection and duplicate-safe registration counting
- [x] Certificate, expiry, procurement and comparable-summary reconciliation calculations
- [x] Client dashboard/reference screens and internal Axis workspace
- [x] Action comments/evidence, advisory/support, notification/governance preferences
- [x] On-demand PDF/Excel reports and existing subscription/billing records
- [x] Permission, calculation, import and production-build checks
- [x] Final full browser regression rerun: all 6 tests pass

Manual publication is a new, explicit retention scope. Raw workbook bytes are discarded after parsing. Normalized published rows are retained only for the selected period with a visible consent record; expiry/revoke makes data unavailable and purges stored content. Original BOT auto-delete behaviour remains unchanged.

## How to use

1. Admin links the internal client to the correct organization in Client Organizations. Do not bind unrelated clients to a shared preview organization.
2. Authorized employee opens `/axis-dashboard`, chooses Client name, unit/CPCB registration/FY, unit display name and actual extraction timestamp, then uploads the final XLSX.
3. Review supported sheets, identity warnings, source errors and coverage. Confirm identity and approved retention (7/30/90 days), add review notes, then Publish.
4. The organization's client login sees the latest published snapshot on `/client/dashboard`. Drafts are hidden. Revocation removes its dashboard data and associated action evidence. Expiry sweeps run on reads and every minute while the production API is running.
5. Client review actions appear in the employee's Axis queue; staff can read comments/evidence and update or resolve the action with remarks. Advisory requests use the existing support-ticket service.

## Routes and APIs

Internal UI: `/axis-dashboard` (requires `bot.extract.execute` and authorized assignments; native registrations require client-allocation permission).

Client UI: `/client/dashboard`, `/client/companies`, `/client/certificates`, `/client/expiry`, `/client/procurement`, `/client/reconciliation`, `/client/actions`, `/client/my-spoc`, `/client/reports`, `/client/notifications`, `/client/subscriptions`, `/client/settings`. Account and registration management remain accessible from Companies & Units. Client BOT links are removed and direct internal API requests are forbidden.

Internal API prefix `/api/axis`: GET options/datasets/actions; POST preview; POST `/:id/publish`, `/:id/revoke`; GET/PATCH `/actions/:id`; POST `/actions/:id/comments`; GET `/documents/:id`.

Client API prefix `/api/client/axis`: GET snapshot (`/`), export, reports, governance, notifications; POST preferences, notifications/read and actions; GET/PATCH actions/:id; POST comments and evidence under actions/:id. All records/downloads are tenant scoped; viewers cannot mutate actions.

## Data and calculation rules

New collections: axisdatasets, axischunks, axisactions, axiscomments, axisnotices, axispreferences, axisdownloads and axisgovernance. Existing tenant, registration, subscription, support, document and activity collections are reused. No existing production records are migrated or deleted by installing this feature.

- Supported analytics sheets: Available, Procurement data and Procurement Summary. Other extracted sheets are reported as unsupported, never silently added to totals.
- Availability: positive valid unexpired Available rows with recognized SUCCESS/AVAILABLE/ACTIVE/VALID status. Duplicate/conflicting certificate IDs are excluded for review, including duplicates across selected registrations. Other wallet tables and potential values are not added.
- Procurement: source detail quantities, with financial-year/supplier/category/date filters. Potential duplicate invoices are flagged, retained and require review.
- Historical FY filters apply to procurement source years; certificate availability remains the latest snapshot and is explicitly not a historical closing balance.
- Only unique matching FY/category summaries are compared to detail; Total compares the entire corresponding FY. No statutory target or compliance guarantee is inferred from quantity differences.
- 30/60/90-day expiry cards are cumulative; the dashboard donut uses disjoint windows.
- Source coverage means the number of recognized sheet families out of three, not verification of every portal page or regulatory completeness.
- Latest publication per portal/registration is selected across repeated logins/FYs; repeated snapshots are not added together.
- Draft lifetime is 24 hours. XLSX upload maximum 12 MB, existing expanded archive limit 50 MB, source rows maximum 150,000 and scoped portfolio maximum 250,000. Narrow the portfolio if needed.
- Raw uploaded XLSX bytes are not archived. PDF evidence follows its dataset's expiry; revoke/expiry deletes evidence bytes and associated action/comment/source contents. Minimal publication/download/governance metadata remains. Generated report bytes are streamed, not archived.

## Verification and deployment

`npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run test:e2e`, `npm.cmd run build`.

49 API/unit tests pass, including historical-FY selection, duplicate eligibility, draft privacy, tenant isolation, expiry purge and real XLSX output. Browser checks cover all twelve client screens at desktop plus 1024/768/390/320px, real publication/action/revocation, PDF/XLSX signatures, and denied client access to internal APIs. See VERIFICATION.md for final full-suite results.

Local development: `npm.cmd install`, then `npm.cmd run dev` (existing configured .env required). Frontend http://localhost:5173; staff Axis http://localhost:5173/axis-dashboard; client login http://localhost:5173/client/login. Production: use the existing Docker/Nginx deployment, build both workspaces, run `npm.cmd start` with HTTPS/cookie/proxy configuration. MongoDB Atlas must support transactions. Keep the API running for scheduled expiry cleanup; reads also purge expired data after restart. No new external credentials are required for workbook analytics.

Existing environment names remain authoritative in `docs/env.example`: MongoDB, authentication/cookie/origin settings, private-file storage and configured payment/email providers. Never place secrets in frontend VITE variables. No deployment or real client publication was performed during development.

## External limitations

- Only the supplied Plastic EPR workbook schema is implemented. Battery, E-waste, Used Oil and Tyre registrations can be tracked, but need real source workbooks/adapters for analytics.
- Outbound email/SMS/WhatsApp and unattended monthly report delivery are not activated by preference toggles; UI identifies unavailable integrations. On-demand reports and in-app notices work.
- Billing displays actual existing contracts, invoices and captured payments. Live checkout requires the existing gateway/tax/provider configuration; no new charge, recurring mandate or paid status is fabricated.
- Reports use the latest retained source snapshot. Historical certificate snapshots/period-end balances require explicitly retained historical data; current balances are not relabeled as historical.
- Source review is human publication review, not independent live CPCB verification. The roadmap image is represented by implementation priority, not an extra client page.
