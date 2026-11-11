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

Both original files remain unchanged:

| Source | Adapter | Behaviour |
| --- | --- | --- |
| commonportalscraper separate Available.py | workers/app.py | Login, procurement, wallet, Available and Excel |
| commonportalpwpscraper 2.1.py | workers/operations.py | Distinct PWP/PIBO/sales parsers/forms and constrained production-record deletion |

Local mode opens Chrome on the **backend computer**. Hosted mode needs Docker/noVNC workers and authenticated WebSocket viewing; it cannot open the end user's personal Chrome directly. OTP is completed by a human. Parallel capacity is bounded by provisioned CPU/RAM and portal behaviour; 50 concurrent browsers have not been load-tested.

## Source layout

- apps/web/src/orqix/: application shell, pages, tables/forms, BOT panels, approvals, assistant and reports.
- apps/api/src/enterprise/: permission policies, repository, workflow state machine, services, routes, private files, reports and intelligence.
- apps/api/src/{app,store,runner,create-admin}.ts: auth/API, persistence, worker orchestration and explicit first-account provisioning.
- workers/: original-source adapters, internal worker API and Python tests.
- tests/, scripts/test-stack.mjs: isolated browser acceptance harness.
- compose.yaml, deploy/nginx.conf, workers/Dockerfile, apps/api/Dockerfile, .github/workflows/ci.yml: deployment and CI.

## Routes and API

Frontend: /admin/login, /login, /setup-password, /dashboard, /admin/users, /admin/teams, /admin/departments, /admin/roles, /admin/client-allocation, /clients, /cpcb-ids, /tasks, /bots/extract, /bots/upload, /bots/delete, /approvals, /reports, /ai-assistant, /audit, /settings. Access follows effective permissions.

Authentication and jobs: /api/auth/login, /api/auth/logout, /api/me, /api/jobs, /api/jobs/:id and owner-authorized login/verify/start/mode/events/preview/download/browser actions. Consult apps/api/src/app.ts for exact verbs.

Enterprise prefix /api/platform: /dashboard, /users, /teams, /departments, /roles, /clients, /accounts, /assignments, /allocation/template, /allocation/preview, /allocation/:id/commit, /allocation/history, /workflows/:id/submit, /workflows/:id/verify-upload, /approvals/:id/review, /files/:id/download, /notifications, /audit, /reports/export. Operations prefix /api/platform/operations/:jobId: /schema, /template, /file, /validate, /upload, /delete/fetch, /delete/request, /delete/execute. See enterprise routers for typed request validation.

## Persistence and retention

MongoDB stores users/sessions, teams/departments/roles, clients/accounts/assignments, workflows/approvals, jobs/events, upload row fingerprints/results, deletion evidence, file references, notifications/audit, imports, reports/delivery logs, assistant conversations and settings. Unique indexes and optimistic versions protect identities and state changes; multi-record operations use Atlas transactions.

Workbooks and submitted approval evidence are private files. By default, files are stored in MongoDB GridFS in the same database as application records, in the orqix_private_files.files and orqix_private_files.chunks collections. Set PRIVATE_FILE_STORAGE=mongodb explicitly on Render; no Spaces credentials are required. Uploads consume Atlas storage capacity. Existing file records retain their storage provider: changing the setting does not migrate old local or Spaces files. Tests use local files unless overridden. Automatic evidence lifecycle deletion is not implemented. Temporary worker profiles/files expire separately. Do not assume downloading a file removes retained approval evidence.

## Deployment

For the Render API, leave Root Directory blank, build with npm ci --include=dev && npm run build --workspace apps/api, and start with node apps/api/dist/index.js. Configure NODE_VERSION=22, NODE_ENV=production, PUBLIC_ORIGIN=https://orqix-psi.vercel.app, COOKIE_SECURE=true, METADATA_STORE=mongodb, PRIVATE_FILE_STORAGE=mongodb and your scoped MONGODB_URI. Use /api/health for health checks. Frontend /api rewrites must point to the Render service. Selenium workers still require a separately provisioned Python/browser runtime; a Node-only Render deployment does not provide them.

For the full Docker worker deployment, use a Linux host with Docker and Atlas access. Configure .env from docs/env.example with the production settings, ENFORCE_ASSIGNMENTS=true and appropriate concurrency limits. DigitalOcean Spaces remains optional: select PRIVATE_FILE_STORAGE=spaces and supply Spaces credentials to use it. Never commit secrets.

Build worker: docker build -t cpcb-worker:local -f workers/Dockerfile .

Start API/frontend/Redis: docker compose up -d --build

Install deploy/nginx.conf with your actual hostname and TLS certificates; verify WSS/SSE and the trusted proxy setting. API is bound to localhost; Redis/workers stay private. The platform mounts Docker's socket: run on a dedicated hardened host with restricted operator access. Set Atlas backup/restore procedures, file retention and monitoring/alerts before launch. CI builds/tests are configured; an automatic DigitalOcean release pipeline requires deployment credentials and is not configured.

Optional configuration names: REDIS_URL; GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_SENDER; AI_MODEL, AI_GATEWAY_API_KEY. Without these, UI reports configuration status and the assistant uses labeled SOP guidance. Graph sendMail acceptance is not delivery confirmation: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0 . BullMQ scheduler documentation: https://docs.bullmq.io/guide/job-schedulers/ .

## External client workspace

The new Hybrid Managed client portal is available at /client/login. Internal admins provision organizations/owners, publish plans and grant approved contracted access from the management UI. See [CLIENT-PORTAL.md](docs/CLIENT-PORTAL.md) for routes, tenant/billing security, setup steps, external blockers and the explicit remaining SaaS implementation checklist. No default external client or paid plan is seeded in production.

## GitHub Actions environment

CI reads the optional repository Actions secret `CI_ENV_FILE` into a private root `.env` file. Configure it under repository Settings > Secrets and variables > Actions > New repository secret. Use settings intended for CI; never commit `.env`. The local checkout has no Git remote configured, so the repository secret must be configured separately.

Without the secret, CI creates an empty `.env` and uses its local-worker/in-memory test configuration. CI no longer copies the template. Local development continues using the existing root `.env`; `docs/env.example` is only a setup reference.
