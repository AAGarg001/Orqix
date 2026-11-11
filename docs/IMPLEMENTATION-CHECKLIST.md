# ORQIX implementation checklist

Repository audit (31 October 2026): React 19/Vite 7, Express 5/TypeScript, Mongoose, cookie sessions, SSE, local native-Chrome and native headless-browser worker execution. No RBAC, client allocation, approvals or enterprise records existed. Original BOT files match both supplied attachments byte-for-byte. No new ORQIX screenshot files were supplied; follow specified design tokens and routes.

## Source mapping

- Extraction source: `commonportalscraper separate Available.py`: `open_login`, `procurement_part`, `wallet_part`, `extract_available_api`, existing Excel writer.
- Operations source: `commonportalpwpscraper 2.1.py`: distinct PWP/PIBO/sales parsers and fill/click helpers; production `delete_open`, `delete_all_snapshot`, pagination, notices and alert helpers.
- Sales source deliberately disables Submit: preserve that behaviour and report invoice-generation/awaiting verification, never uploaded success.
- Existing `run_delete_all_production` deletes everything in an FY: never expose directly. Web adapter must constrain execution to the approved snapshot and stop on ambiguous identity.

## Phases

- [x] Repository/source audit and implementation plan.
- [x] Phase 1: ORQIX navy/blue design system, central auth, active users, backend permissions, management dashboard.
- [x] Phase 2: Users, teams, departments, roles, reporting-manager relationships, password setup.
- [x] Phase 3: Clients/CPCB accounts, Excel allocation preview/commit, scoped dashboards.
- [x] Phase 4: Versioned workflow engine, task tracking, stage approvals and manager scope.
- [x] Phase 5: Exact ExtractBot controls, logs, source modules, authenticated artifacts.
- [x] Phase 6: Source-specific upload templates, PDF validation, preview, execution and uncertain-submission handling.
- [x] Phase 7: Snapshot-based selected deletion, manager approval, confirmation and audit.
- [x] Phase 8: Scoped knowledge assistant and configured model interface.
- [x] Phase 9: Analytics, notifications, weekly Outlook previews/scheduler/delivery logs.
- [x] Phase 10: Integration/security tests, build, deployment and handoff.

Checked phases mean their implemented core is covered by local checks, not that every master-prompt acceptance criterion or external integration is complete. See remaining work below.

## External verification blockers

- Atlas read-only connection succeeded. Initial live Super Admin provisioning was rejected by automatic approval review as an insufficiently authorized privileged mutation; no account was created. Explicit user approval remains required. Redis and private Spaces still need runtime configuration/verification.
- Microsoft Graph organizational application credentials/permissions and sender are not supplied.
- AI provider credentials/model are not supplied.
- Hosted Linux browser runtime is verified in Linux CI.
- Real CPCB account/OTP and supervised verification are required for authenticated extraction and mutation testing. No live upload/deletion test will be performed automatically.

Plan: extend the existing backend as a modular monolith, add permission/scoping and explicit workflow transitions first, then source-backed BOT adapters, then enterprise UI and external interfaces. Use test-only repositories/adapters for automated tests; production records must use MongoDB. Retain the earlier UI source as a legacy component rather than destroying working extraction code.

## Remaining functionality / release gates

- [ ] Explicitly authorize and provision first live Super Admin; validate persisted Atlas flows with that account.
- [ ] Supervised real CPCB OTP, extraction and upload/deletion reconciliation against portal evidence; do not infer success from mocks.
- [ ] Hosted native headless-browser, private Spaces, Redis scheduler, Graph delivery and configured AI model verification.
- [ ] 50-browser load/capacity tests, deployment host credentials, production monitoring, backup/restore drill and storage lifecycle.
- [ ] Invitation email delivery (secure setup links work), forgot-password self-service delivery, rich employee activity detail and bulk-user operations.
- [ ] Allocation rollback/correction UI, advanced report breakdowns/filters and scheduled audit exports.
- [ ] AI attachment parsing/retrieval index and optional voice input; current scoped SOP/model interface does not index uploaded documents.
- [ ] Fully automated portal verification for upload modes: current independent manager evidence attestation is explicit and audited; submission alone never completes workflow.
- [ ] Every requested negative-path/end-to-end scenario; current suite covers critical implemented paths but not all scenarios in section 22.
- [ ] DigitalOcean automatic release pipeline; CI verification and deploy configuration exist, no live deployment was performed.

No new screenshot assets beyond the earlier Common login/reference architecture were available; ORQIX styling follows specified colors/layout. Original BOT files remain unchanged. Production test-fixture exclusion is enforced through tsconfig.build.json.
