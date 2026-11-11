# ORQIX ? A A GARG & CO

THINK BEYOND ? INNOVATE ? SIMPLIFY

Repository implementation of a CPCB EPR operations platform. React/Vite/TypeScript frontend, Express modular backend, MongoDB Atlas records, separate Python/Selenium browser workers. Start with [RUN-LOCAL.md](RUN-LOCAL.md); verification and limitations are in [VERIFICATION.md](docs/VERIFICATION.md), phase status in [IMPLEMENTATION-CHECKLIST.md](docs/IMPLEMENTATION-CHECKLIST.md).

## Implemented application

- Cookie authentication, active accounts, separate admin/user login interfaces, permission policies and server-side assignment/team scope.
- Users, departments, teams, reporting managers, single-use password setup, client/CPCB accounts and Excel allocation preview/idempotent commit.
- Actual-data dashboards, notifications, audit history, versioned stage transitions, manager validation/reconciliation approvals. Final completion remains blocked until required approvals and upload verification.
- ExtractBot with exact Open Login / Scrape All / Available controls, isolated sessions, manual OTP, source extraction, multi-sheet Excel, sanitized live logs and workbook preview.
- Separate PWP/PIBO/sales input templates/parsers, invoice PDFs, validation and submission ledger. Sales preserves source invoice generation with Submit disabled. Submission and verification remain distinct.
- Selected-record deletion snapshots, manager approval, explicit final confirmation and absence verification. The source delete-all function is never exposed.
- Scoped SOP assistant, optional configured model, Excel/CSV/PDF reports and configurable Redis/BullMQ weekly Outlook reports using Graph.

No production demo users or fabricated portal success. Automated tests use isolated fixtures/adapters excluded from the production build.

## Original BOT mapping

Original extraction logic is retained; desktop-only imports are optional for hosted execution:

| Source | Adapter | Behaviour |
| --- | --- | --- |
| commonportalscraper separate Available.py | workers/app.py | Login, procurement, wallet, Available and Excel |
| commonportalpwpscraper 2.1.py | workers/operations.py | Distinct PWP/PIBO/sales parsers/forms and constrained production-record deletion |

Local mode opens Chrome on the **backend computer**. Hosted mode uses native Python/headless Chromium with authenticated screenshot and input controls; it cannot open the end user's personal Chrome directly. OTP is completed by a human. Parallel capacity is bounded by provisioned CPU/RAM and portal behaviour; 50 concurrent browsers have not been load-tested.

## Source layout

- apps/web/src/orqix/: application shell, pages, tables/forms, BOT panels, approvals, assistant and reports.
- apps/api/src/enterprise/: permission policies, repository, workflow state machine, services, routes, private files, reports and intelligence.
- apps/api/src/{app,store,runner,create-admin}.ts: auth/API, persistence, worker orchestration and explicit first-account provisioning.
- workers/: original-source adapters, internal worker API and Python tests.
- tests/, scripts/test-stack.mjs: isolated browser acceptance harness.
- scripts/render-build.sh, scripts/start-native.mjs, .github/workflows/ci.yml: deployment and CI.

## Routes and API

Frontend: /admin/login, /login, /setup-password, /dashboard, /admin/users, /admin/teams, /admin/departments, /admin/roles, /admin/client-allocation, /clients, /cpcb-ids, /tasks, /bots/extract, /bots/upload, /bots/delete, /approvals, /reports, /ai-assistant, /audit, /settings. Access follows effective permissions.

Authentication and jobs: /api/auth/login, /api/auth/logout, /api/me, /api/jobs, /api/jobs/:id and owner-authorized login/verify/start/mode/events/preview/download/browser actions. Consult apps/api/src/app.ts for exact verbs.

Enterprise prefix /api/platform: /dashboard, /users, /teams, /departments, /roles, /clients, /accounts, /assignments, /allocation/template, /allocation/preview, /allocation/:id/commit, /allocation/history, /workflows/:id/submit, /workflows/:id/verify-upload, /approvals/:id/review, /files/:id/download, /notifications, /audit, /reports/export. Operations prefix /api/platform/operations/:jobId: /schema, /template, /file, /validate, /upload, /delete/fetch, /delete/request, /delete/execute. See enterprise routers for typed request validation.

## Persistence and retention

MongoDB stores users/sessions, teams/departments/roles, clients/accounts/assignments, workflows/approvals, jobs/events, upload row fingerprints/results, deletion evidence, file references, notifications/audit, imports, reports/delivery logs, assistant conversations and settings. Unique indexes and optimistic versions protect identities and state changes; multi-record operations use Atlas transactions.

Workbooks and submitted approval evidence are private files. Set PRIVATE_FILE_STORAGE=cloudinary and configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET on the backend to store new uploads as authenticated raw Cloudinary assets. File metadata and access permissions remain in MongoDB; signed download URLs stay server-side. PRIVATE_FILE_STORAGE=mongodb remains available for GridFS. Cloudinary uploads consume Cloudinary storage/bandwidth, not Atlas file storage. Existing file records retain their storage provider: changing the setting does not migrate old local or Spaces files. Tests use local files unless overridden. Automatic evidence lifecycle deletion is not implemented. Temporary worker profiles/files expire separately. Do not assume downloading a file removes retained approval evidence.

## Deployment

Use the native Node runtime described in [Render bot setup](docs/RENDER-BOT.md). Build with `bash scripts/render-build.sh` and start with `node scripts/start-native.mjs`. The build installs Python dependencies and matching headless Chromium/driver, then verifies the real browser. Keep production MongoDB and Cloudinary credentials in Render environment variables. No desktop display service is required.

Optional configuration names: REDIS_URL; GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_SENDER; AI_MODEL, AI_GATEWAY_API_KEY. Without these, UI reports configuration status and the assistant uses labeled SOP guidance. Graph sendMail acceptance is not delivery confirmation: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0 . BullMQ scheduler documentation: https://docs.bullmq.io/guide/job-schedulers/ .

## External client workspace

The new Hybrid Managed client portal is available at /client/login. Internal admins provision organizations/owners, publish plans and grant approved contracted access from the management UI. See [CLIENT-PORTAL.md](docs/CLIENT-PORTAL.md) for routes, tenant/billing security, setup steps, external blockers and the explicit remaining SaaS implementation checklist. No default external client or paid plan is seeded in production.

## GitHub Actions environment

CI reads the optional repository Actions secret `CI_ENV_FILE` into a private root `.env` file. Configure it under repository Settings > Secrets and variables > Actions > New repository secret. Use settings intended for CI; never commit `.env`. The local checkout has no Git remote configured, so the repository secret must be configured separately.

Without the secret, CI creates an empty `.env` and uses its local-worker/in-memory test configuration. CI no longer copies the template. Local development continues using the existing root `.env`; `docs/env.example` is only a setup reference.

## Existing private-file migration

After building the API, run `node --env-file=.env apps/api/dist/migrate-private-files.js` for counts only. Add `--apply` to migrate existing GridFS-backed filerecords/clientdocuments to Cloudinary. Each file is downloaded and verified by SHA-256 before its record is changed using a version check. Original GridFS bytes are retained for rollback and historical references; this command never purges them. Existing local or Spaces files are not migrated.
