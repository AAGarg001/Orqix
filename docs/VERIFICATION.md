# ORQIX verification

Local verification on 31 October 2026. Automated portal tests use isolated adapters; these are not evidence of authenticated CPCB success.

- TypeScript: frontend and backend typecheck passed.
- API/unit: 25 tests passed (authentication, active/role protection, workflow/approval rules, manager/report scope, allocations and selected deletion authorization).
- Python: 16 tests passed (original-source adapters, upload schemas/validation/fingerprints, deletion constraints, Excel and worker behaviour).
- Production frontend and backend build passed. Vite reports a large initial JS chunk (~1.16 MB uncompressed); route splitting remains a performance improvement before wider rollout.
- Browser acceptance: hierarchy creation, secure setup, Excel allocation, employee scope, mocked extraction, manager validation approval, final-completion blocking and mobile login/layout. Final run: 2 browser tests passed in 22.9 seconds. Responsive drawer transition is awaited before checking mobile overflow.
- Read-only Atlas connection succeeded; live privileged account creation was rejected by automatic approval review. No live admin was provisioned and no existing production data was overwritten.
- Original BOT files matched supplied attachments byte-for-byte during source audit.

## Not verified externally

No supplied authenticated CPCB account/OTP was used. No live upload/deletion was executed. Docker is unavailable locally; no hosted noVNC/container test. No Graph sender credentials, Redis runtime, private Spaces credentials or AI model credentials were available. No 50-concurrent-browser test or DigitalOcean deployment. These are release blockers, not successful integrations.

Graph acceptance is recorded as ACCEPTED, never confirmed delivery. Sales source preserves disabled Submit. Failed/uncertain mutations require verification; tests never perform destructive portal operations.

## Repeat

npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
.venv/Scripts/python.exe -m pytest workers/tests -q

Playwright test-server is guarded by NODE_ENV=test and memory metadata, excluded from production output. It owns ports 4100/5175; fixtures are never written to Atlas. Screenshots/traces are under ignored test-results/. CI runs the same checks and builds the worker image on Linux.

## Allocation visibility correction ? 31 October 2026

Diagnosed a PREVIEW import created before the employee account existed: all rows retained Unknown user errors, and no assignments had been committed. Added saved-preview resume, explicit per-row employee correction and server-side revalidation against current active users. Upload/preview/import steps are now explained; preview never pretends to assign clients.

Regression verification: 27 API tests and 2 browser tests passed, including row-email correction, admin client visibility, employee isolation and ExtractBot selection. Both admin roles can view all committed assignments; employees see their authorized assignments.

With explicit user authorization, revalidated and committed only the three riya@example.com rows through application services. Verified two distinct clients, three CPCB IDs and three Not Started workflows in Atlas. Amit's two rows remain in the original pending preview; original rows and split import reference were preserved for audit. Dummy CPCB identifiers are not actual portal login credentials.

## Shared button animation

Applied the supplied four staggered blobs and SVG goo filter through a ref-forwarding shared button; action links receive a liquid-fill effect. Disabled controls stay inert, destructive controls retain red, keyboard focus triggers the effect, and reduced-motion disables transitions. Typecheck and both browser acceptance tests passed. Chromium hover colour and screenshot were inspected (test-results/orqix-blob-hover.png).

## Sidebar and operation controls

Removed CPCB IDs from sidebar navigation (account configuration route retained), workspace card and entire sidebar footer block. Recreated the supplied black/white A A Garg & Co wordmark as an SVG and use it for company branding including the sidebar header.

Upload choices are now visible before a browser session exists: PWP Upload or PIBO Upload; PIBO Sales or Purchase/Procurement; Sales Domestic or Export. Values map to unchanged source-backed worker modes pwp/pibo/sales/sales_export and their separate templates. Changing the mode clears the panel preview. The PWP Production Delete shortcut opens the controlled deletion page; fetch/approval/final confirmation remain mandatory. Sales final Submit remains disabled exactly as in the original Python source.

## Popup and light-sidebar refinements

Removed PWP Production Delete from upload. PIBO now opens an accessible focus-trapped dialog for Sales/Purchase, then an animated sales-type step for Domestic/Export; closing/cancelling preserves the last confirmed mode. CSS enter/exit and step animations respect reduced motion. The Delete page's initial button is clickable before login and opens year setup, with a Continue to login / Review records action. Actual record operations still require verified sessions and approvals. Year changes clear stale local snapshots. Sidebar is light blue with dark text; navbar search and SVG logo background were removed.

## Dashboard reference refinement

Refined dashboard typography, leading metric icons/counts/arrows, blue active workflow step, unified assigned-client card/header/table, compact row actions, and icon-led lower cards. Task donut has an actual total in its centre and readable side legend. Desktop lower cards use three columns with tablet/mobile breakpoints; workflow/table scrolling remains contained. Card hover and page entry respect reduced motion. Previously removed navbar search stays removed. Counts, workflow approvals and progress calculations are unchanged; no percentages or activity were fabricated to match the reference.

## Royal-blue sidebar and icon rail

Updated sidebar to royal blue (#4169e1 gradient), with high-contrast text/transparent white logo. Added labeled expand/collapse icon, desktop 80px icon rail and matching content transition. Navigation keeps accessible labels/tooltips while collapsed. Mobile retains the full drawer; reduced-motion disables transitions.

## Premium UI verification

See PREMIUM-UI-IMPLEMENTATION.md for the premium upgrade, source mapping and final results. Final frontend/backend typecheck passed, four browser tests passed (120 route/viewport checks across 20 surfaces), production frontend build passed. Existing API/BOT business contracts preserved. Runtime frame-rate and live external integrations were not measured by these UI checks.

## Client workspace increment

Client organization isolation and Hybrid Managed workspace added; see CLIENT-PORTAL.md for supported routes, operational/billing boundaries and incomplete SaaS requirements. Final API suite: 36 passed. Browser suite: five passed (client onboarding, private files/support/service requests, internal premium route matrix and prior workflow acceptance). Frontend/backend typecheck and production builds passed. Payment provider behaviour was tested with injected mocks, not real captures.

## Allocation partial-import correction — 2026-11-03

Latest production upload remained PREVIEW because two unknown-employee rows blocked three valid rows. Added explicit valid-only commit, PARTIALLY_COMMITTED history with imported/pending counts, and revalidation of only pending rows. Existing all-or-nothing commits and reassignment confirmation remain enforced. Commit rechecks active staff identity. Applied the latest batch's three valid Riya rows through the service; two Amit rows remain pending. Employee-scoped dashboard verified 3 clients / 4 CPCB IDs and assignments including existing work. No assignment was reassigned to an unknown employee.

Validation: frontend/backend typecheck and build passed; 37 API/unit tests passed including partial import, retry idempotency, employee isolation and pending correction; 2 workflow browser tests passed. Browser tests use the isolated memory test server, not live CPCB submissions.

## ExtractBot operation buttons — 2026-11-03

Moved Scrape All and Available into a prominent operation panel matching upload controls. Verified sessions start the corresponding original Python mode immediately; pre-login clicks guide the user to manual login/OTP without launching extraction. Pending/running actions prevent duplicate clicks and display a spinner. Existing module status panel remains separate. Original Python files unchanged.

Frontend/backend typecheck and production build passed. Two workflow browser tests passed, including pre-login guidance, Scrape All execution and a separate Available request whose persisted job mode is checked. These use test adapters; live CPCB extraction still requires the user's authenticated session and manual OTP.

### Portal login verification and session recovery

Diagnosed the user's latest job as awaiting_otp: no extraction had started because the completed portal login had not been verified by the app. Extraction clicks now fetch the current job and, when awaiting_otp, call the existing identity-checking verification endpoint before mode/run. Verification failures stop extraction and remain visible. Returning to the bot restores an active authorized assignment/session from the user's job history. No backend restart or live portal mutation was performed during this fix. Added optional assignmentId to the web Job contract. Typecheck passed; both workflow browser tests passed including navigation away/back, session restoration and Scrape All without a separate Verify click. Tests use isolated adapters.

### Extraction scope update — 2026-11-03

At the user's explicit request, removed the consumption module's constants, helpers and disabled desktop call from the original extraction script; removed its active call from the Python worker, module label from ExtractBot and legacy UI description. Updated supported-scope documentation. Scrape All now executes Procurement and Wallet; Available remains separate. Existing historical workbooks and database history are retained. Already-running worker processes must be replaced with a fresh login session to load the changed Python code. Python worker/Excel/operation tests: 16 passed.

### Combined Excel delivery — 2026-11-03

Extraction worker preserves both runs in the same workbook and gates artifact/preview access until both Scrape All and Available finish in the same session, in either order. API respects explicit worker artifact readiness. Per-mode module outcomes persist across runs and errors remain visible after the other extraction completes. Failed/partial sections do not become falsely successful. Removed Run Summary, Module Status Summary and Record Counts sheets; Errors and Skipped is first, Available follows Generated when that sheet exists. Shared Python finalizer also applies this layout to desktop extraction output. Existing historical files are not modified. New worker session required for Python changes. Python tests cover ordering, merging, retained partial outcomes and locked download before both runs.

### Download filename

New extraction workers provide a sanitized Entity Name_Unit Type_YYYY-MM-DD_HH-MM-SS.xlsx filename using India time at extraction. Runner persists the filename with job metadata; authenticated API download uses Express attachment encoding for Unicode names and sanitizes path/control characters. Existing jobs without filename metadata retain the prior ID fallback. Worker filename/header tests passed; frontend/backend typecheck and API build passed.

### Temporary extraction files and retries

Raw procurement and summary downloads are removed as soon as both extraction attempts finish and the final/partial workbook is ready. Extraction outputs are no longer copied into private file storage by the job callback (upload result retention is unchanged). After the API response finishes successfully, the worker deletes its output/download directories and cached workbook reference; legacy archived copies for that job are deleted from private storage and their file records marked deleted. Interrupted HTTP responses keep the workbook retryable. Browser disk-save completion is not observable: response finish is the cleanup boundary. During delivery/cleanup, duplicate downloads and runs are blocked. Cleanup retries then shuts down the worker on persistent failure. Workbook filename includes microseconds to protect newer generations against stale cleanup.

No extracted data is retained for merging after delivery. The next extraction click regenerates both modes using the existing authenticated browser session. Before download, Available can fail, expose a partial workbook with actual errors, and be retried without losing the successful main extraction. Original failure-capture tests and new consume/rebuild/stale-cleanup/Available-retry tests pass (18 Python tests). API test asserts post-response worker consumption and artifact invalidation. Job ownership/status/audit metadata and browser session remain; old unrelated historical jobs are not globally erased.

### Minimal extraction history and part alerts — 2026-11-03

User explicitly requested purging all runtime contents and permanently retaining only extraction time/status history. Mongo extraction jobs now persist only identity/authorization references, generic name, timestamps and status. Active rows, sections, events, stage, workbook name and readiness are process-memory only. A separate extractionruns collection records each attempted run/retry with owner/job IDs, start/finish timestamps and actual status, and backs /api/extraction-history. No extraction events or output copies are archived. Workflow stage permissions remain intact; upload/delete auditing is unchanged.

Purged detailed fields from 4 existing production extraction jobs, removed 861 botjobevents, removed their archived output references/files, and retained legacy time/status entries. Legacy entries represent historical sessions; individual past retries cannot be reconstructed. Deleted the entire workspace runtime directory, including old/current jobs and test artifacts. Native workers now use isolated OS temporary directories with guarded cleanup; E2E fixtures use OS temp and remove their directory on shutdown. Transient browser/download files are still necessary while automation runs; raw downloads are removed on final/partial readiness and final workbook on delivery as documented above. Browser session stays transient for retries.

Removed Extraction Modules and extraction live-log panels. Previous Runs shows only generic run, time and status. Top-right rich-color notifications use coarse Procurement/Wallet/Available success/failure events, plus action errors; no toast for every source print. Validation: 39 API/unit tests, 18 Python tests and 2 workflow browser tests passed; build passed. Retention tests inspect the exact Mongo serialization and verify per-retry counting/scoped history.

### Four-stage dashboard, scoped tasks and profile

See WORKFLOW-TASKS.md. Selected client/CPCB/FY drives four-stage dashboard status. Removed View/approval popup and replaced old workflow-table Tasks with database-backed manager assignments and private personal to-dos. Added `tasks.assign`, server reporting-scope checks, versioned edits/status/reopen/archive, deadlines and notifications. Profile matches the requested card; navbar duplicate logout icon removed with dropdown Sign out retained. Task metrics/upcoming deadlines use actual task records. Independent upload verification is inline and completion cannot bypass verified submission, successful extraction or blocking errors. Historical DB stages are preserved and mapped for display; automatic approval review rejected a broad historical migration, so none was executed.

Final checks: 42 API/unit tests and all 5 browser tests passed, including task assignment visibility, private to-do completion, selected-client extraction progress, profile and responsive checks. Typecheck passed; production build verified. Original Python BOTs unchanged in this increment.

### Axis publication and client business portal - 2026-11-04

Added the internal Axis Dashboard and screenshot-inspired client business screens. A staff operator selects an authorized tenant-linked client/unit/CPCB registration, uploads the final workbook, reviews identity and source coverage, approves bounded retention and explicitly publishes. Raw XLSX bytes are not archived. Original BOT output deletion remains unchanged. Client identities cannot access internal BOT/Axis upload endpoints.

Actual supported workbook families are Available, Procurement data and Procurement Summary. Eligibility, duplicate certificate exclusion, strict dates, multi-year procurement filtering, cumulative expiry windows and unique summary/detail reconciliation are tested. The real Uflex workbook was inspected offline in memory (35,903 recognized rows); no real data was published or seeded. Other portal schemas await actual source adapters. Manual reviewed snapshots and optional client evidence use explicit 7/30/90-day retention, with purge on revoke/expiry; minimal governance metadata remains.

Completed screens: Business Dashboard, Companies & Units, Certificate Inventory, Expiry Monitoring, Procurement Analytics, Data Quality, Action Required/detail/comments/evidence, SPOC/advisory, Reports, Notifications, Subscription/Billing and Settings/Governance. Report bytes are generated on demand. Email/SMS/WhatsApp delivery and live recurring billing are not fabricated or enabled by UI preferences.

Validation: typecheck passed; 49 API/unit tests passed; all 6 Playwright tests passed (2.0 minutes). Browser tests include reviewed upload-to-client publication, tenant isolation/403, action resolution, true PDF/XLSX exports, revocation, all twelve screens and overflow checks at 1024/768/390/320px. Existing staff extraction/task and client onboarding/support regressions passed. Frontend/backend production build passed; existing bundle-size warning remains. The isolated in-memory browser harness has a higher authenticated request budget for viewport sweeps; production retains 240 requests/minute/user. No Python automation changes, live portal submissions, payment charges or deployment were performed.

Implementation details, API routes, retention/calculation definitions, local commands and external blockers: AXIS-IMPLEMENTATION.md.

### Unlinked Axis preview button fix

Removed the organization-link requirement from Preview & Validate. Authorized unlinked clients now receive a transient PREVIEW_ONLY response with parsed workbook validation statistics; no dataset/chunks are persisted and no publish control is displayed. Organization linking remains mandatory for creating a publishable draft. Added a refresh-links action and explicit next-step instructions. Typecheck and all 8 Axis tests passed. Real browser verification against Uflex's supplied workbook returned HTTP 200, 35,903 parsed rows, visible temporary preview and zero publish buttons. No Uflex data was saved or published.

### Uflex draft visibility diagnosis

The reported workbook existed as DRAFT, so client pages correctly had no published snapshot. At the user's explicit request, verified UFLEX organization mapping and CPCB S202608-00007339 against source entity Uflex Limited / Unit ID 27121, then published the existing 35,903-row draft through the audited admin API using the selected 30-day retention. Audit notes preserve the source's 521 findings and do not claim they were resolved. Client snapshot subsequently returned HTTP 200 and one published dataset. No subscription/payment/SPOC/action records were invented. Added a prominent Step 2 publication banner, smooth/reduced-motion-aware scroll to review, explicit missing requirements beside the disabled Publish button, and accurate non-published status text.

### Razorpay sandbox purchase and subscription UI

Added a polished sandbox purchase section with three illustrative plans, monthly/yearly/3-year pricing, explicit test acknowledgement, real Razorpay Standard Checkout, order resume, verification retry, verified test receipt and separate history. New testbillingorders records never activate live subscriptions, create tax invoices or count as real revenue. Live billing quote/capture refuses actual Razorpay test keys. No real charges or fake captured statuses were created. Missing test keys are identified clearly; actual provider checkout remains externally blocked until configured in backend .env.

Validation: all 56 API/unit tests passed (six new sandbox tests); new mocked-provider Playwright purchase/retry flow passed; real Uflex login checked plan cards/missing-key state and 1568/768/390/320px overflow; typecheck and production builds passed. A verification retry modal obstruction found by the browser test was fixed before the passing run. See RAZORPAY-TEST-PURCHASE.md for exact setup, API routes and boundaries.

### Branded PDF redesign and optional company logo

Replaced raw PDF text dumps with A A GARG & CO vector branding, formatted executive metrics/charts, source/definition pages and readable paginated landscape tables. PDF download now opens an optional company-logo upload modal (PNG/JPEG, 2 MB, bounded dimensions); both logo and generated file remain in memory. Brand loads from public assets in development and web-dist in the existing Docker runtime. Fixed footer auto-pagination that initially created blank pages. Real Uflex summary now renders as two pages; detail reports explicitly limit preview to 100 records and point to full Excel export. Deleted all temporary real-data PDF/render samples after inspection.

59 API tests passed; Axis/logo-download and Razorpay browser tests both passed. Popup has no overflow at 1568/768/390/320px. Typecheck/build passed. Added supplied Razorpay TEST credentials to ignored backend .env and restarted dev server; read-only provider check HTTP 200 and client sandbox readiness true. No payment was initiated by verification. See PDF-REPORTS.md.

### All generated PDFs: receipts, tax invoices and staff workflow exports

Completed the remaining PDF renderers through pdf/documents.ts. A A GARG & CO branding, amount hero, payer/date/reference blocks, item/tax tables, readable timestamps and consistent page footers now cover all generated document families. Regular receipts and invoices fit one page; long addresses and workflow tables paginate. Tax snapshot immutability and sandbox labeling are preserved. Financial downloads and internal report exports support the same optional-logo popup and in-memory POST handling while retaining GET download compatibility and existing authorization. Uploaded source documents are unaffected.

Validation: 62 API/unit tests passed, including financial document page counts, precise currency, optional invoice image and long-address/table pagination. Four browser tests passed covering Axis/report branding, premium route/viewport/auth sweeps and sandbox checkout. Real Uflex receipt download was verified through the popup and returned one PDF page. Visually inspected receipt, fixture invoice and workflow renders; removed all temporary samples afterward. Production builds passed.

### Verified monthly plan display and sticky mode strip

Fixed Current Plan reading only commercial subscriptions. The client subscription API now includes a tenant-scoped verified-test-plan projection, calendar-month expiry, active/expired status and remaining days. Existing Uflex Premium monthly payment appears without data migration or a new payment. Pending yearly orders do not hide the verified monthly purchase. Payment verification refreshes Current Plan immediately. Live authorization, invoices and revenue are unchanged.

Added a premium Current Plan card at the top, purchased amount/term/start/end/receipt, current-plan catalog indicator and a compact curved TEST/LIVE plan strip that sticks directly beneath the navbar across client pages. Removed duplicate connected-key and promotional panels; live billing is expandable. Motion respects reduced-motion preferences. Real Uflex verification: Premium Monthly, INR 2,499, valid until 4 December 2026 02:15 IST, 30 remaining days; sticky strip top measured 66px and no overflow at 1024/768/390/320px.

64 API/unit tests passed, including verified monthly display, pending exclusion, tenant scope and month-end expiry. Axis client-page/browser suite passed. Checkout browser test checks immediate Current Plan and sticky-strip update; an encoding-only expected-text assertion was corrected before rerun. Production builds passed. See RAZORPAY-TEST-PURCHASE.md.

### Compact sticky strip with client metrics

Removed both decorative side-curve pseudo-elements and reduced maximum strip width from 690px to 510px. Added a compact authorized client/CPCB row with keyboard-accessible View/Hide metrics toggle and smooth reduced-motion-aware expansion. The table displays per-registration Available MT, Procurement MT, source coverage, financial year and source timestamp from the published Axis snapshot; no values are hardcoded. Multiple published registrations get a scoped selector. Empty/error states and retry are provided. Existing plan information remains in the top row.

Real Uflex browser verification matched 33,595 Available MT; 4,92,060.571 Procurement MT; 100% source coverage; FY 2026-27; 4 Nov 2026 1:32 am. Computed ::before content is none, strip width 510px, no overflow at 1568/768/390/320px, collapse state verified. Typecheck passed; Axis browser suite now asserts expanded scoped metrics.

### Client portal density, icons and full pagination

Applied a compact layout across client pages: reduced page/card/chart/filter spacing, smaller KPI and chart heights, consistent semantic page/section icons, compact table rows and hover/focus transitions. Ticker maximum width is now 440px and keeps five-second animated rotation through plan and per-registration metrics; removed the old dropdown and extra row. Motion supports reduced-motion settings and pause/read interactions.

Added shared first/previous/next/last pagination, row counts and local row-size selection for client tables, reports/download history, support requests, companies/registrations, invoice/payment/audit tables, action/notification lists and sandbox purchase history. Server-paginated certificates retain their full counts; quality and expiry now have dedicated server pagination instead of 300/100-row response caps. Page bounds are clamped. Full export records are unchanged. Empty states use icons and avoid empty pagination controls.

Validation: 65 API/unit tests passed, including later-page completeness for issues/expiry and out-of-range page handling. Four browser tests passed covering all twelve client pages/viewport checks, ticker rotation, PDF downloads, authentication and sandbox checkout. Real Uflex quality pagination verified 1�10 of 545 through 541�545, 55 pages with five final rows; narrower ticker measured 440px and no overflow at 1568/768/390/320px. Typecheck and production builds passed.

### Banner, reference-style KPIs, grouped light-blue navigation

Restyled page headings as soft gradient banners with workspace eyebrow, icon tile, publication state and aligned controls. KPI cards now use pastel tone backgrounds, compact icon/label rows, full-width tabular values and factual status notes; long procurement values stay on one line. Dashboard KPIs are accessible links to their relevant authorized pages. Zero actions/findings show neutral empty-status notes; no illustrative growth percentages were invented.

Client sidebar now has a pale-blue background and Overview / EPR Operations / Work & Advisory / Insights & Account sections with consistent active/hover/focus states, including collapsed/mobile navigation. Ticker gained previous/next controls and a five-second progress line alongside pause/resume, with reduced-motion support.

Verification: typecheck/build passed; three browser tests passed covering all twelve client pages, viewports, auth and report interactions. Real Uflex long value 4,92,060.571 fits at 1568/1024/768/390/320px without page overflow. Manual ticker previous/next and Procurement KPI navigation verified. Existing data/calculations were not changed in this UI increment.


2026-11-04 ? SPOC/reporting-manager resolution and compact advisory/procurement update: 68 API tests passed; Axis and client Playwright suites passed (last-run status passed). Frontend/backend production builds passed. Real Uflex contact mapping and full 2,273-row procurement PDF were checked; temporary report files removed after inspection.


Client Data Publishing update: direct publication without approval fields, repeated identical published upload creates a new history record, latest snapshot supersedes previous data. 68 API tests and production build passed. Client action review controls were preserved.


Client filter performance update (4 November 2026): published source rows use a bounded 30-second process-memory cache (4 entries / 200,000 rows), concurrent reads are coalesced, failures are not cached and purge invalidates the local entry. No persistent cache files or database copies are introduced. Tenant membership and published dataset metadata remain request-scoped. Source issue arrays are cloned before per-request calculations. Removed duplicate global sweep from client router; dataset sweep is tenant-scoped; independent source/registry reads run concurrently. Client filter queries preserve the existing view with an Updating data status, cancel obsolete requests and debounce text search by 250 ms. 72 API tests, typecheck and production build passed. Read-only Uflex filter timings measured 289?362 ms locally after optimization; no pre-change baseline was captured, so no speedup percentage is claimed.


## Client portal performance audit - completed 5 November 2026 IST

Measured actual Uflex read-only MongoDB executionStats, browser network/long-task metrics and eight API response fingerprints before/after. Detailed report: artifacts/performance/CLIENT-PORTAL-PERFORMANCE-AUDIT.md. Warm browser readiness 2,586 -> 1,937 ms; browser filter 1,015 -> 468 ms; warm API median 307 -> 201 ms; immediate repeat 137 ms. Cold API 3,430 -> 3,472 ms: cold target remains unmet and is explicitly reported. All eight data digests/metrics/response sizes are identical. Added non-unique organizationmembers {userId:1,status:1,createdAt:-1}; verified COLLSCAN -> IXSCAN. Snapshot cache is bounded, short-lived and metadata/revision/date validated; authentication is reused only within one HTTP request. Unchanged charts skip repeated animation/renders. 73 API tests, production builds and both client browser suites passed. No UI redesign, business arithmetic changes, raw Excel mutation, extra services or dependencies. Packed aggregation and wire-compression experiments were slower and were not enabled.


5 November 2026 ? replacement publication regression: 74 API/unit tests and API production build passed. Tests verify new quantities replace previous quantities, prior normalized chunks/metadata are removed, same-registration FY/target aliases are cleaned, unrelated registration/tenant data remains, stale publish versions cannot delete old rows, and peer service caches do not serve replaced rows. Publication and normalized data cleanup share a MongoDB transaction.
