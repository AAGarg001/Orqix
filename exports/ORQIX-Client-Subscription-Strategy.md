# ORQIX
## Client Subscription & Multi-Portal Growth Blueprint
### A A GARG & CO · THINK BEYOND · INNOVATE · SIMPLIFY

Prepared: 03 November 2026 | Strategy only | Professional English

**Core idea:** Offer clients a trusted workspace for managing multiple entities, units and EPR registrations, with Excel extraction as one of its services.

**Your situation:** You have more than 100 existing clients. Each client may have multiple units, Plastic / E-waste / Used Oil registrations and login IDs. Treating each login ID as a separate client or subscription would be confusing and expensive.

**Recommended direction:** A client workspace subscription with included active-registration capacity and optional managed services. Preserve the service relationship with A A GARG & CO while ORQIX makes that relationship more transparent and convenient.

**Three promises to sell:** "View all my work in one place", "Know the next action and the person responsible", and "Retain control of my data without unfair charges for technical failures."

**Launch model:** Start with Hybrid Managed services. Clients submit requests and complete OTP authentication; trained staff handle supported operations. Introduce self-service automation after validating each portal independently.

**Scope of this document:** Product ideas, information model, client screens, subscription packaging, illustrative prices, privacy policy, rollout and launch gates. This planning exercise did not change application source code, database records, plans or live payments. Only planning artifacts were created.

**Read before pricing:** Prices and rollout dates are proposals, not market benchmarks, provider quotes, compliance assurances or revenue forecasts. Do not sell proposed features as existing functionality.

---

## 1. Distinguish clients, units, registrations and login identities

**Recommended structure:** Client Workspace → Legal Entity → Unit / Location → Portal Registration → Financial-Year Workspace.

| Object | Meaning | Example / rule |
|---|---|---|
| Client workspace | Paying customer / authorized company group | Client A; one subscription with controlled memberships |
| Legal entity | A distinct legal company with its own ownership and billing identity | Company A Ltd.; another company in the group is a separate entity |
| Unit / location | Factory, branch or operational site | Unit Noida; Unit Pune |
| Portal registration | Waste stream + entity role + registration identity | Plastic PIBO, E-waste producer, Used Oil registration |
| FY workspace | Year-specific work for a registration | 2026-27; each new FY starts a new work period for the same registration |
| Login identity | A portal/SSO authentication user, distinct from the registration | Login A / Login B; access follows permissions |

**Important relationship:** Login identities and registrations may have a many-to-many relationship. One SSO login may access multiple registrations, and a registration may have multiple authorized logins. Apply adapter-specific constraints where a portal requires a one-to-one relationship.

**Illustrative example, not a claim of actual ownership:** Client A -> Company A -> Unit Noida -> Plastic registration P-001 and E-waste registration E-001. Login L-01 can access both; L-02 can access only P-001. Company A -> Unit Pune -> Used Oil registration O-001 -> L-03. This requires three registration slots, without separate platform subscriptions for the three logins.

**Source-design gap:** Current createAccount groups name/portalType/registrationType; createRegistration stores CPCB ID and FY together and checks tenant-wide ID uniqueness. The future model should distinguish stable registrations, annual work and authentication identities. Deduplicate by tenant, portal and registration identifier using portal-specific rules; duplicate rows or imports must not trigger additional charges.

**SSO caution:** The CPCB E-waste landing page announced SSO login through epr.cpcb.gov.in at the time of this review [S1]. This supports modelling login identities separately from registrations. Verify permissions and identity mapping independently for each portal.

---

## 2. What should clients experience after signing in?

**First screen: "My Compliance Workspace".** Show the client company, selected unit, portal, financial year and a clear next action. Keep worker internals, Selenium and raw logs out of the client interface.

| Screen | What the client should see | Value |
|---|---|---|
| Overview | Authorized entities/units, active registrations, work waiting on the client, due tasks | Clear control over ongoing work |
| My Units & Portals | Cards with portal, role, masked login alias and supported-service label | Easy selection of the correct account |
| Registration detail | Correct entity/unit/portal identity, FY selector, authorized operators | Fewer wrong-account errors |
| Service request | Extract / upload request; scope, input checklist, consent and estimated handling window | Clear expectations |
| My Work | Requested, awaiting OTP, running, partial, ready, delivered or failed | Honest progress |
| Action Required | OTP, missing input, manager query or upload consent | A clear next step |
| Subscription | Active slots, included users/services, renewal date, upgrade/cancel terms | Transparent billing |
| Support & SPOC | Named responsible team member, ticket, updates and escalation | Service continuity and accountability |

**Example client journey:** Sign in -> Company A -> Unit Noida -> Plastic -> correct registration -> FY 2026-27 -> Request Excel -> confirm scope -> manual OTP window -> extraction status -> download one combined workbook -> purge output. If Available extraction fails, clearly label the partial delivery and provide a retry action.

**Trust details:** Use the customer's actual organization name/logo, a clear A A GARG & CO service identity, supported portal badges, real support contacts, clear errors and an explicit data-retention notice. Avoid implying government affiliation, endorsement or guaranteed compliance.

**Client roles:** Owner manages subscription; Admin manages authorized members; Operator requests services; Viewer reads permitted status; Approver authorizes permitted sensitive requests. Scope access by unit and portal. Group owners should access subsidiaries only through authorized memberships.

**Human OTP stays:** Provide an agreed window for OTP coordination. Enter OTPs manually and do not store permanent OTP records. Do not classify OTP waiting time as an automation failure or an additional billable run.

---

## 3. Subscription value: why would clients pay?

**Sell convenience, confidence and service accountability.** AI branding, visual charts and buttons alone do not create recurring value.

| Client pain | Proposed paid value | Evidence visible to the client |
|---|---|---|
| Confusion across multiple IDs and units | One organized multi-unit workspace | Correct account and FY selection |
| Phone calls for every update | Clear request/status/next-action timeline | Status-only history and named owner |
| Repeated work caused by invoice/input errors | Portal-specific input checklist and preflight validation | Actionable input errors, no false success claims |
| Missed deadline follow-ups | Reviewed calendar, task owners and reminders | Source/date of reviewed deadline |
| Uncertainty after a failed operation | Partial/failed status + controlled retry | No false Completed badge |
| Unclear account ownership of a generated workbook | Clearly named workbook + confirmed entity identity | Entity / Unit Type / IST filename |
| Support accountability missing | Dedicated SPOC and agreed response windows | Ticket ownership and response history |
| Renewal bill unclear | Simple slot-based plans and explicit managed fees | Published inclusions and billing ledger |

**Good premium services:** Multi-unit access controls, consolidated operational status, priority support during stated business hours, planned OTP sessions, expert input preparation/review, and more active registration capacity.

**Avoid artificial paywalls:** Security, access to downloads of the client's own data, accurate failure reporting, basic support and technical retries should be standard trust features. Do not block an already paid delivery solely to encourage an upgrade.

**Recurring value without storing extracted data:** Saved tasks, service status, next actions, membership controls, reviewed schedules and support relationships provide ongoing operational value. Do not promise historical certificate balances, quantity trends, year-on-year material analytics or an archived report vault under the current retention policy.

**AI role:** Start with navigation, template explanations and authorized status-based assistance. Provide certificate quantities, target-fulfilment assessments or compliance conclusions only with verified source evidence. The current client assistant provides deterministic guidance; do not describe it as a configured LLM/RAG system.

---

## 4. Subscription model and illustrative packaging

**Recommended billing unit:** One customer workspace with an allowance of active registrations and included client seats. Do not treat login IDs or financial-year changes as separate paid registrations. Handle separate legal entities through an explicitly authorized group contract or separate workspaces.

| Plan idea | Starter | Business | Enterprise |
|---|---|---|---|
| Illustrative monthly test price | INR 2,999 | INR 7,999 | INR 19,999 onward |
| Active registration slots | 1 | 5 | 15; negotiated expansion |
| Client member seats | 3 | 10 | 25; scoped group access |
| Core value | Organized workspace + supported managed extraction access | Multi-unit work visibility + collaboration | Larger portfolio + negotiated service coverage |
| Support proposal | Standard business-hours queue | Named SPOC + scheduled OTP slots | Contracted response window + escalation |
| Upload/delete/filing services | Separately scoped quote | Separately scoped quote | Contracted service package |

**These are pricing experiments, not live plans or market rates.** Tax treatment, gateway charges, effort, support promises and any onboarding fee must be reviewed and disclosed before launch. Portal tracking in a paid plan does not imply an automated adapter exists for that portal.

**Recommended commercial boundaries:** Subscription covers workspace access and agreed supported operations. Human-heavy upload preparation, correction/deletion review, return filing or exceptional remediation should have a separately accepted scope. Do not call these unlimited unless capacity and economics support it.

**Slot rules:** Count distinct active registrations, not duplicate login mappings. Verify ownership before activation. Make archive/reactivate and plan changes effective on stated billing dates; use an explicit replacement policy to prevent one slot rotating through an entire portfolio. Do not charge again for the same registration in a new FY unless a clearly disclosed service contract says otherwise.

**Terms to offer first:** Monthly and 12-month prepaid access. Test an annual saving only after margin measurement. Avoid a 36-month commercial lock-in before portal coverage, support capacity and renewal/refund policies are proven.

**Add-ons:** Additional registration capacity, more authorized seats and clearly scoped managed service packages. Show the total before payment; no surprise charge after OTP or failed extraction.

---

## 5. Align retry, privacy and billing commitments

**Your current policy remains the baseline:** Extracted rows, raw source Excels, merged workbook content, module details and logs should not become permanent extraction records. Permanent run history is limited to identity references, time and status. Client master, memberships, tasks and necessary commercial/billing records are separate application records.

| Moment | What happens | What client sees |
|---|---|---|
| While extracting | Isolated transient working files/browser session | Running / awaiting OTP |
| Both attempts finish | Raw procurement and summary files removed | Ready or Partial; failed parts visible temporarily |
| Final transfer completes | Backend workbook removed | Delivered; re-extraction needed for another copy |
| Transfer interrupted | Keep temporary file retryable until cleanup expiry | Retry download, with expiry notice |
| No download | Temporary retention limit still applies | “Download before expiry” notice |

**Important limitation:** Server can confirm completed HTTP delivery, not that the browser saved the file to a particular folder. UI should not claim verified disk-save success. Browser settings decide Downloads vs a save dialog.

**Available retry example:** Scrape All works, Available fails → offer clearly labelled partial workbook. Before download, retry Available and reuse transient Scrape All data. After download/purge, another Available click must regenerate both datasets if a combined file is required. Tell the client beforehand that regeneration may need portal availability and another OTP.

**Fair commercial rule:** No fixed retry-count cap for technical failures. Do not charge extra for the automatic Scrape All rerun caused by your purge policy. A failed/partial correction remains linked to the same service request; repeated status callbacks or delivery retries must not consume multiple paid services. This is a proposed billing policy; existing metering needs review before selling it.

**Fair scheduling:** One active operation per credential/session context, organization concurrency limits and rate protection are fine when disclosed. These are scheduling controls, not a hidden retry penalty.

**No hidden analytics:** Without retained source rows, “certificate trends”, historical balances or downloadable old report history are unavailable. Offer re-extraction. An encrypted archive could be a later opt-in product only if you explicitly approve a changed retention policy; it is not part of this proposal's default.

---

## 6. Your current foundation versus next-level capabilities

Read-only review of client service, billing source and current project notes; this is not a live-payment or full production-readiness certification.

| Area | Observed foundation | Next step before promising it |
|---|---|---|
| Client workspace | Separate client identity, organization membership and role-scoped routes | Validate enterprise group / subsidiary membership model |
| Accounts and IDs | Portal accounts + registrations + FY field | Separate legal entity, unit, registration and login many-to-many mapping |
| Automation | Existing Plastic extraction and source-based operations; client requests managed by staff | Independently build/test E-waste and Used Oil adapters; publish capability matrix |
| Subscription access | Plan versions, entitlement limits, usage and manual contracted access | Align slot counting and retry policy with actual product promise |
| Payments | Order/capture verification and signed webhook foundation | Live sandbox verification, finance review and recurring mandate lifecycle |
| Recurring billing | Not proven live as a complete lifecycle | Renewal, payment failure, cancellation, upgrades and refunds end to end |
| Support | Client tickets and approved SPOC contact records | Capacity-backed response targets, escalation and handover process |
| Assistant | Deterministic scoped guidance | Optional authorized AI integration with clear limitations |

**Architecture direction, later only:** Keep React/Vite + Express/TypeScript + MongoDB Atlas. Add the missing domain relationships within the modular backend. Keep portal adapters separate by waste stream and operation, isolated browser sessions and manual OTP. Do not rewrite the working Plastic extraction merely to introduce subscriptions.

**Domain objects to consider later:** ClientGroup/Organization, LegalEntity, Unit, PortalRegistration, FinancialYearWorkspace, LoginIdentity, LoginRegistrationAccess, MembershipScope, ServiceRequest, RunAttempt, Subscription and SubscriptionEntitlement. A credential secret is not a normal profile field; prefer session-only entry, with any future vault requiring explicit approval.

**Payment distinction:** Prepaid 12-month access is a valid access term; it is not automatically a recurring bank mandate. Razorpay documents plan-based recurring subscriptions and webhook lifecycle [S2]. Existing order checkout must not be presented as complete automatic renewal until mandate/renewal/cancel flows are tested.

---

## 7. Client onboarding, sales and ongoing operations

**Start with your existing relationships.** 100+ existing clients are a validation pool, not evidence that 100 clients will buy. Segment by registration complexity, service frequency, OTP availability and need for team coordination.

**Choose 8–10 pilot clients:** Small single-registration, multi-unit Plastic, multiple legal entities and multi-portal tracking customers. Unsupported portals should be visibly tracked/manual only; paid automation claims stay within tested coverage.

**Onboarding checklist:** Verify client/company ownership → map entities/units/registrations → map permitted login identities → choose owner/operator/viewer → agree OTP contacts/time windows → publish supported services → show retention notice → confirm quote/terms → invite members. Never map by client name alone.

**Demo script:** Show the client's own authorized unit selector, one real supported request, honest progress, downloadable named Excel, partial/retry handling and support contact. Use labelled test data for previews; do not show invented production job successes.

**Conversion offer:** One assisted onboarding session plus one properly scoped pilot service, with explicit time period and no silent payment mandate. After the pilot, show measured time saved, requests handled and support outcomes; ask which plan the client would actually pay for.

**Operating model for your team:** Portfolio view → client/unit/portal filter → assigned employee → OTP appointment → live request status → escalation → delivery status. Managers should see ownership and workload without needing permanent raw exports. Keep accounting/payment records distinct from extraction content.

**Unit economics:** Contribution per customer = subscription + accepted service fees − browser/compute − operator time − support time − payment fees − service credits. Set prices after measuring these costs. Example only: INR 7,999 revenue with INR 3,000 direct service cost leaves INR 4,999 contribution, about 62.5%, before other overheads and taxes. This is not an expected margin.

**Measure product trust:** Activation, first successful delivery, active registrations, repeat service use, portal vs platform failure rate, time waiting for OTP, support response, renewal intent and cancellations. Keep only permitted status/time/billing metadata. If per-part permanent metrics would be needed, obtain a changed retention decision first; do not quietly save module history.

---

## 8. Rollout proposal and launch gates

**Time boxes below are planning hypotheses, not delivery commitments.** Validate source complexity, staffing and portal access before estimating implementation dates.

| Stage | Indicative time box | Required result |
|---|---|---|
| Discovery | Weeks 1–2 | 8–10 interviews; actual anonymized account/login mappings; clear slot and consent definitions |
| Product foundation | Weeks 3–5 | Entity/unit/registration/login hierarchy; scoped access; accurate client journey and data policy |
| Commercial pilot | Weeks 6–8 | Contracted or reviewed prepaid access; real supported Plastic requests; measured support effort |
| Billing hardening | After pilot evidence | Sandbox and live-controlled payment checks; invoice/refund/cancel policies; mandate lifecycle if chosen |
| Additional portals | Separate scoped milestones | Independent authenticated adapter testing; correct identity and output validation |
| Wider rollout | Only after gates pass | Measured multi-client capacity, incident handling, support coverage and renewal experience |

**Portal capability gate:** For every portal/role: login mechanism, ownership check, account context, FY handling, read-only extraction, output validation and failure/retry behaviour. Upload/delete require separate verified safeguards and explicit consent. One tested Plastic account is not proof of another portal's capability.

**Privacy gate:** Test raw-file purge, interrupted transfer, successful-transfer purge, expiry, retry-after-purge and process crash recovery. No source rows in Mongo, logs, backups or object-storage copies. Necessary transient files and browser sessions must have clear expiry and cleanup.

**Commercial gate:** Define inclusions, active-slot replacement, technical retries, partial results, support hours, portal outages, cancellation, renewal and disputes in plain language. Review billing/tax treatment with your qualified advisors before accepting live payments.

**Capacity gate:** 100 clients does not mean 100 simultaneous browsers. Measure the real workload and provision capacity accordingly. Publish honest start/response expectations; do not promise instantaneous unlimited concurrency, zero portal downtime or 100% extraction success.

**My recommendation:** Launch as “ORQIX Client Workspace by A A GARG & CO”: multi-unit clarity + reliable supported Plastic service + named human support + transparent subscription. Expand portal automation after proof, not before payment-page claims.

---

## 9. Decision sheet and references

**Decisions to make before implementation**

- Is the payer one legal company or a company group? Which subsidiaries can share the same contract and workspace?
- What uniquely identifies a registration in each portal and role? Which login IDs/SSO identities can access it?
- Is the launch strictly Hybrid Managed? Which supported operations are part of workspace access versus separately quoted services?
- What active registration/seat capacity does each plan include? How does slot replacement work?
- Does the privacy promise remain no permanent extraction content? Under this proposal the answer is yes; no archive/trend product is included.
- Which support window can the team genuinely cover? How will portal outages and OTP delays be communicated?
- Will the first paid period be prepaid access, or a fully tested recurring mandate? What are renewal and cancellation terms?

**Evidence and source notes**

| Ref | Source | What it supports |
|---|---|---|
| S1 | CPCB E-Waste Management System, eprewaste.cpcb.gov.in | Landing-page SSO announcement; reason to separate authentication identity from registration |
| S2 | Razorpay, About Subscriptions, razorpay.com/docs/payments/subscriptions | Provider supports plan-based recurring subscriptions and lifecycle notifications; not proof this app has implemented them |
| P1 | apps/api/src/saas/service.ts | Current client roles, account/registration model, managed requests and Plastic-only BOT restriction |
| P2 | apps/api/src/saas/billing.ts | Current payment-order/capture and quote foundation |
| P3 | CLIENT-PORTAL.md plus current extraction retention/workflow implementation | Existing client portal scope; later code/policy changes take precedence over older descriptive notes |

**External links, checked 03 November 2026:**

S1: https://eprewaste.cpcb.gov.in/

S2: https://razorpay.com/docs/payments/subscriptions

The Used Oil portal could not be fetched during this review. No conclusion about its current authentication, selectors, available APIs or automation behaviour is made. Plastic, E-waste and Used Oil examples in the proposed hierarchy describe your intended product scope; they are not claims of tested integrations.

**No-change confirmation:** This work produced a strategy document and PDF only. No application feature, production database record, client account, price, subscription entitlement or payment configuration was changed.
