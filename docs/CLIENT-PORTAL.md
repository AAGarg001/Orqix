# ORQIX client workspace — implementation and setup

This increment adds a working **Hybrid Managed client portal** to the existing internal application. It is not a claim that every phase of the complete commercial SaaS prompt, live payment processing or unattended client-side browser automation is production-ready.

## Start and create a real client login

Run the existing local stack with `npm.cmd run dev`.

1. Sign into the existing internal Admin/Super Admin workspace.
2. Open **Client Organizations → Create organization**.
3. Enter the real organization name/code, client owner's name/email, and optionally link an existing internal client.
4. Copy the returned one-time setup link and share it through an approved secure channel. The app explicitly reports that an invitation email was not sent.
5. The owner sets a password and signs in at **http://localhost:5173/client/login**.
6. Publish a reviewed plan under **Subscription Plans**, defining actual price, included services, quotas and customer terms. No illustrative plans are seeded in production.
7. For the initial managed model, open the organization and **Grant contracted access** using an approved contract reference and typed confirmation. This is recorded as MANUAL_CONTRACT; no payment, paid invoice or cash collection is fabricated.
8. The owner can add accounts and CPCB IDs within the plan limits. Management verifies actual ownership using supporting evidence before service requests are allowed.
9. Assign an approved business SPOC and link the appropriate internal client. Existing financial-year assignments/workflows remain the internal operational source of truth.

No default external-client credentials or organization were created in live Atlas. Do not convert an employee identity, such as an existing Executive, into an external client account. Client memberships are separate organization-scoped records.

## Client routes

| Route | Working behaviour |
| --- | --- |
| /client/login | Centralized cookie authentication for client identities only |
| /client/dashboard | Actual organization accounts, IDs, workflow state, activity, SPOCs and subscription |
| /client/accounts, /client/accounts/:id | Quota-controlled account creation and owned account detail |
| /client/cpcb-ids, /client/cpcb-ids/:id | Registration creation, ownership status and linked workflow detail |
| /client/progress | Actual scoped internal workflows; new unassigned IDs remain Not Started |
| /client/my-spoc | Admin-approved business contacts, coverage and escalation contact labels |
| /client/services | Service catalog with explicit supported execution model |
| /client/automation, /client/automation/upload, /client/automation/delete | Managed service requests, approved registrations, source-document references, quota reservations and request history |
| /client/documents | Private PDF/XLSX upload and authorized downloads; only explicitly shared internal evidence is exposed |
| /client/approvals | Versioned supplemental client evidence review, remarks and approve/reject |
| /client/subscriptions, /client/subscriptions/usage | Active access, monthly persistent usage/reservations and entitlement history |
| /client/subscriptions/plans, /client/subscriptions/compare | Published versioned pricing, 1/12/36-month prepaid totals and actual quotas |
| /client/checkout | Billing profile, server quote, finance/configuration blockers, optional hosted Razorpay checkout |
| /client/payment-success | Shows success only for server-verified PAID orders |
| /client/billing | Authorized billing-role orders, captured payments, invoice PDF/view/print links and refund-review records |
| /client/support | Tickets, account references, client/staff replies and closing |
| /client/ai-assistant | Metered deterministic authorized-workspace guidance; explicitly not a configured client LLM |
| /client/activity | Organization-scoped event timeline |
| /client/settings | Client identity, password change, role-controlled memberships and setup invitations |

Client roles: Owner, Admin, Operator, Viewer, Approver. Viewer mutations/billing are blocked server-side. Billing/membership management is limited to owner/admin; approval review is limited to owner/admin/approver. Internal staff accounts cannot authenticate as clients and clients cannot access internal APIs, workers or WebSockets by guessing URLs.

When a client belongs to multiple organizations, selection uses active authenticated memberships and updates the server session. Tenant URLs/query parameters alone cannot select an unauthorized organization. A switch clears the old client cache through a fresh workspace load.

## Internal management routes

- /admin/organizations: organization provisioning, owner/member setup links, contracted access, internal-client binding, business SPOC, CPCB ownership review, explicit document sharing, supplemental client approvals and billing-tax review.
- /admin/subscription-plans: versioned plan pricing, supported service keys, limits and terms.
- /admin/client-requests: managed requests, linkage to actual internal BOT jobs, source-document downloads, reviewed manual-service evidence, support replies and refund-review queue.
- /admin/saas-dashboard: actual organization/subscription/support counts, captured cash collections and reviewed seller configuration. Unimplemented MRR/revenue-recognition measures are not invented.

## BOT integration and metering

The original Python sources are unchanged. Client requests do **not** open a browser or claim execution. Authorized employees use the existing ExtractBot/PWP/PIBO/sales/controlled-delete workflows and manual OTP. Management links the actual job ID to the request; the server checks tenant client binding, CPCB registration, financial year and job kind. A job cannot be billed against several client requests.

Subsequent linked-job state updates synchronize request state and quota. Failed/cancelled work releases its reservation. Successful source extraction can consume the run; uploads require the existing independent verification state, and deletion requires verified approved-source results. Partial/uncertain responses stay pending verification. Reviewed reconciliation/managed-service delivery requires explicit evidence and a typed internal review confirmation; it is distinct from a BOT result.

The service catalog meters **managed requests/operations**, not uploaded rows. Quotas/terms are explicit plan definitions. Monthly periods are anchored to the subscription start, even for prepaid 12/36-month terms. Frontend counters never authorize usage.

Native account metadata can track Battery/E-Waste, but the supplied Python integrations support Plastic EPR. Requests for unsupported portal types are blocked; no battery/e-waste BOT adapter is fabricated.

## Payment and invoice boundary

Environment names only:

- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET
- RAZORPAY_WEBHOOK_SECRET

Do not expose secrets through VITE_* environment variables. The public checkout key is returned only with an authorized order. Configure the signed webhook endpoint: `/api/billing/razorpay/webhook`.

Implemented: integer-paise price/discount/tax calculations, 1/12/36-month prepaid terms, immutable accepted-price/buyer/seller snapshots, provider order creation, hosted checkout, callback signature verification, fetched captured-payment checks, raw-body webhook verification, event/payment/order idempotency, one-time subscription activation, invoice sequence/snapshot and authenticated server-generated PDF.

Payment activation requires captured amount, currency and provider order to match the stored order. Signature/callback alone is insufficient. No raw card/CVV details are collected or persisted. Repeated confirmations do not issue another invoice or duplicate access.

Checkout remains blocked until payment keys, seller details and customer tax treatment are configured/reviewed. An authorized finance reviewer supplies seller GSTIN/SAC/state and explicit customer tax lines/place-of-supply review reference. The application does not universally assume CGST/SGST/IGST or claim statutory correctness from a UI toggle. Obtain qualified review of invoice trigger, numbering, tax treatment and commercial terms before live activation.

Provider implementation references: [Razorpay payment/signature utility documentation](https://github.com/razorpay/razorpay-node/blob/master/documents/paymentVerfication.md), [Razorpay payment webhook documentation](https://github.com/razorpay/markdown-docs/blob/master/webhooks/payments.md). Real provider connectivity/capture/webhook delivery was not exercised; tests use an injected test gateway.

## Data ownership and security

New records include organizations, memberships, internal-client bindings, portal accounts, registrations, business SPOCs, plan versions, subscriptions, usage buckets/ledger, service requests, orders/payments/webhook hashes, invoice snapshots/counters, private client documents, supplemental approvals, support messages/tickets, client activity, billing profiles, refund reviews and scoped guide history.

All client endpoints derive tenant context from authenticated membership/session, filter tenant queries and check object ownership. Financial documents additionally require the billing role. Organization/client binding is unique so an internal client cannot silently serve two external tenants. Existing internal records are not migrated or deleted automatically.

Private document downloads use the existing authenticated storage proxy. In development files use private local storage; production uses configured private Spaces. Internal extraction evidence is not visible to clients until explicitly shared. Document format checks do not constitute a malware scan.

## Implementation checklist

- [x] Separate client login/shell and tenant-bound memberships/session selection.
- [x] Real client dashboard, account/registration ownership, progress, approved business contacts and document access.
- [x] Support conversations, supplemental evidence approvals, activity and membership setup.
- [x] Configurable versioned pricing, contracted access, service entitlement, quotas/reservations and usage history.
- [x] Hybrid request linkage to real internal jobs and source-backed verification states.
- [x] Razorpay integration interface, captured-payment checks, signed webhooks, idempotent invoice/access creation and PDF generation; isolated tests.
- [x] Internal organization/plan/request/support/finance administration.
- [ ] Real payment account/configuration and supervised test/live provider verification.
- [ ] Qualified invoice/tax/commercial review; archival invoice PDF lifecycle and email delivery.
- [ ] Public signup, email verification delivery, privileged MFA, organization-membership acceptance/revocation management and automated onboarding emails.
- [ ] Direct external-client self-service browser sessions; current portal deliberately uses managed requests.
- [ ] Automatically charge/execute every possible managed operation; uncertain outcomes remain reserved until proper verification.
- [ ] Client supplemental approvals as an additional mandatory internal workflow/deletion policy gate. Existing internal manager approvals remain mandatory; supplemental review alone cannot authorize a mutation.
- [ ] Recurring mandates, add-on purchase/proration, upgrades/downgrades, carry-forward rules, automatic renewals, executed refunds and credit notes. Refund requests are review records only.
- [ ] Client LLM/RAG retrieval and provider-backed AI response integration. Current client assistant is labeled scoped guidance.
- [ ] Full SPOC staff-identity/handover/availability lifecycle, SLA/escalation automation, satisfaction UI and advanced support attachments.
- [ ] MRR/ARR/churn/recognition/deferred-revenue policy and full finance analytics; current overview reports actual counts/cash only.
- [ ] Live tenant migration/review, malware scanning, retention/backup exercises, cloud/browser capacity and security release review.

These pending features are implementation/release work, not all merely missing credentials. The full 40-section SaaS master prompt is not yet completely fulfilled.

## Verification commands

`npm.cmd run typecheck`

`npm.cmd test`

`npm.cmd run test:e2e`

`npm.cmd run build`

The guarded test API uses an isolated in-memory store and private test files. Provider credentials are explicitly blanked for browser tests. No real customer extraction/upload/deletion, payment or email is run by these checks. Backend tests cover tenant object isolation, internal-route blocking, switching/revocation, role/expiry/quota controls, exact billing math, month-end/36-month dates, tamper checks and duplicate payment/invoice/webhook handling.

## Final local verification

Frontend/backend typecheck passed. All 36 API/unit tests and five browser tests passed, including new client onboarding and responsive client pages plus existing internal workflow regressions. Production frontend/backend builds passed. Screenshots were reviewed under test-results/client-dashboard.png and client-automation.png. The original Python scripts were not changed in this increment. No live customer identity, plan purchase, tax invoice, payment, email or destructive portal action was performed.


SPOC contacts resolve from explicit active tenant assignments, or from the employees allocated to the tenant?s clients. Their actual active reporting managers are included. No fictitious backup or availability is created; private phone numbers are not disclosed. Consultation requests open in a compact modal. Procurement replaces Monthly Distribution with supplier registration mix, ranked suppliers and source-unit quantities; filtered PDF export includes all matching procurement records.


Reconciliation now presents available Procurement Summary versus Procurement data quantities by FY/category, with paginated comparison rows and matching exports. Missing invoice/date/category checks are not exposed as client findings or included in client finding counts. Internal parsing safeguards remain. A comparison is omitted when no matching detail exists or its quantities cannot be read; absent data is not inferred as zero. Differences are numerical observations, not confirmed errors.


Client Data Publishing (existing /axis-dashboard route): compact final-workbook upload and direct publish. No manager approval, review notes or confirmation checkboxes are required for publication. Tenant/assignment access and valid file parsing remain enforced. The user selects retention (7/30/90 days). Every upload following an already published workbook creates a fresh draft even for identical bytes; publication supersedes the previous active snapshot without double-counting. History is newest-first and updated immediately from the publish response. Client action review queue is unchanged.


Certificate action/review requests have been retired: Action Required navigation, certificate review buttons and certificate-action APIs are removed. Old action records are not exposed; existing records were not destructively deleted. Client Data Publishing now shows Client Consultation Requests sourced from SPOC & Advisory supporttickets. Questions/topic/assigned SPOC appear for authorized staff; replies and IN_PROGRESS/AWAITING_CLIENT/RESOLVED status updates use the same supportmessages thread and generate an advisory notification. Tenant assignment or explicit SPOC mapping scopes staff visibility. Certificate inventory/expiry viewing remains available.


Replacement publication (5 November 2026): publishing a new final workbook replaces all PUBLISHED/SUPERSEDED source snapshots for the same tenant + portal + CPCB registration, including older FY/target aliases. Within the publication transaction, old normalized chunks and dataset-linked notices/retired action records are removed, and workbook-derived metadata is cleared. Minimal publication history retains SUPERSEDED/replacedBy/timestamps. Other registrations, portals and tenants are untouched; drafts are not discarded. Shared service-instance caches are invalidated after commit. Raw uploaded workbook bytes are already discarded after parsing. No existing live snapshot was manually republished or deleted during development.


5 November 2026 update: publication history now contains only Client, Unit, Registration, FY, Workbook, Published and Status. Manual revoke/removal controls and their endpoint are removed. Published data no longer has timed retention and remains active until the next replacement for the same registration; draft expiry and BOT temporary-file cleanup are independent and unchanged. Historical filenames remain as minimal publication metadata, not stored workbook bytes. Consultation replies are optional for a status change. The UI fetches the latest ticket version, immediately updates the list cache and awaits refresh; one consultation can move repeatedly through IN_PROGRESS, AWAITING_CLIENT and RESOLVED without creating empty messages.
