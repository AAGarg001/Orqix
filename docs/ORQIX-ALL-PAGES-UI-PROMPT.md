# ORQIX — Complete page-by-page UI prompt

Copy this document as a master UI prompt. To work on one page, copy the shared design instructions and that page's section. This describes the current application structure and the intended consistent presentation; it is not a claim that every external integration is configured.

## Master instructions

Act as a senior product designer and React frontend engineer. Refine ORQIX, a CPCB EPR automation and employee workflow platform for A A GARG & CO. Tagline: THINK BEYOND · INNOVATE · SIMPLIFY.

Inspect existing React components and API contracts before editing. Preserve actual authentication, role permissions, assignment scope, Python BOT integration, manual OTP, workflow transitions and approvals. Improve the UI in the existing repository. Do not replace functioning modules or introduce sample production data. Present real loading, empty, failure, partial and success states. Never fabricate extraction results, upload confirmation, deletion success or email delivery.

Use React, TypeScript, Vite, existing Tailwind/CSS, Radix accessible dialogs, Lucide icons, TanStack Query/Table and Recharts. Reuse shared components. No Next.js migration. No unnecessary new UI libraries.

### Shared visual system

- Royal-blue sidebar: #4169E1 with a subtle gradient to #3155C4. White navigation text and icons; translucent active background and a clear left indicator.
- Main background: #F4F8FD. Cards: white. Main text: #13284A; headings may use #0C2047. Secondary text: #64748B. Borders: #E3EBF5.
- Primary action: #075CF5. Success: #16A34A. Warning: #F59E0B. Destructive: #EF4444 / #C42B36. Approval: #7C3AED.
- Inter typography. Page headings approximately 28–34px desktop, 24–28px mobile; card headings 16–18px; body 13–14px; table text 12–13px. Avoid tiny text and excessive whitespace.
- Desktop sidebar width 256px, collapsed rail 80px; white navbar height 64px. Page padding 24–28px. Card radius 12–16px, fine borders, restrained shadows. Inputs/buttons approximately 40–46px tall.
- Company logo: use the existing transparent A A Garg & Co SVG. In the royal-blue sidebar render it white for contrast; show the AA monogram in the collapsed rail. Avoid a white rectangular logo background.
- Buttons: preserve the four staggered gooey blobs/SVG filter effect, pill action buttons, readable labels and icons. Destructive buttons stay red. The dashboard's main ExtractBot CTA may use its existing blue rounded rectangle.
- Motion: gentle page entrance, subtle card hover, 280–300ms sidebar/content transition, 180–260ms dialog fade/scale and step changes. Respect prefers-reduced-motion. Disabled controls remain inert.
- Tables: searchable, sortable, paginated, clear header/background, subtle row hover. Keep horizontal scrolling inside table containers. Never overflow the whole mobile page.
- Modals: centered white panel, softly blurred dim overlay, title/description, close icon, validation messages, Cancel/primary actions. Support Escape, trapped keyboard focus and return focus on close.

### Shared application shell

Create a consistent shell for every authenticated page. The sidebar contains only authorized destinations. Do not add the removed Enterprise workspace card, Secure & connected footer, duplicate company block, or CPCB IDs sidebar entry.

Navigation destinations: Dashboard; User Management; Team Management; Departments; Roles & Permissions; Client Allocation; Clients/My Clients; Tasks; ExtractBot; Data Upload Bot; Delete Bot; Pending Approvals; Reports & Analytics; AI Assistant; Audit Logs; Settings. Visibility follows effective permissions.

The logo-area toggle switches between full sidebar and an icon rail. Keep icon tooltips, accessible link names, active-route indicator and smooth content resizing. Mobile uses a full drawer and backdrop instead of a narrow rail.

Navbar: mobile menu control, Workspace/page breadcrumb, notification bell with real unread count, avatar/name/role, profile/settings access and Logout. **Do not restore the removed navbar global search.** Table-specific search fields remain.

## 01. Admin login — /admin/login

Design a corporate management login on a dark navy/blue background. Place the transparent company logo near the top and a link to employee login on the opposite side. Use a white login card beside an ORQIX feature/office-illustration panel.

Card: Management Portal badge, Welcome, Administrator heading, concise description, Email address, Password, show/hide password, Remember me, Forgot password and Login as Admin. Include a discreet security note.

The right panel shows ORQIX branding, a short management value statement and restrained CSS/vector office artwork. Stack gracefully on mobile. Keep errors generic. Do not display Microsoft login unless configured. Forgot-password guidance must match the available reset mechanism.

## 02. Employee login — /login

Use a white/pale-blue variation of the same branding. Left: employee login card. Right: User Access information, workflow preview and subtle decorative illustration.

Include Email address, Password, show/hide password, Remember me, Forgot password and Login as User. Link to management login. No editable role selector: the server determines access. Loading/error states must remain clear and usable on mobile.

## 03. Password setup — /setup-password

Create a focused invitation/password-setup card with company branding, clear password requirements, password entry and the existing setup action. Preserve the one-time token flow.

Show submitting, completed, expired/invalid-link and validation states. Explain how to request a new setup link when needed. Provide a login destination after success. Never display stored passwords or imply that an email was sent when only a setup link was generated.

## 04. Dashboard — /dashboard

Create a readable enterprise dashboard following the established reference composition.

Header: My Workflow Dashboard for employees, Manager Dashboard for managers, Management Dashboard for authorized management users; personalized welcome; blue Open ExtractBot CTA with robot/arrow icons.

Four metric cards: Assigned Clients, CPCB IDs, Pending Tasks, Completed Tasks. Use leading tinted icons, clear labels, large real counts and navigation arrows. Distinguish unique clients from account IDs and assignment totals.

Workflow card: six connected steps — Client Assigned, Data Extraction, Validation, Upload, Reconciliation, Completed. Show actual ID/financial-year counts. Use blue for the active indication and green only for accepted completed states. Display actual approval blockers in purple/amber.

Unified My Assigned Clients card: title/View all, record count/search, sortable table and pagination. Columns: Client/CPCB ID, Financial Year, Task Type, Current Stage, Status, Progress, Actions. Show client icon/name/ID together, accurate progress, state badges and View action.

Bottom row: Task Status donut with actual total in its centre and side legend; Upcoming Tasks with client, FY/due date and priority; Recent BOT Activity with real job events/timestamps. Use three columns when space permits, two on tablet and one on mobile. Show honest empty states.

Do not invent the reference image's counts, 5% progress or activity. Preserve current backend calculations. /admin/dashboard is a permission-protected dashboard variant, not a separate unrelated design.

## 05. User Management — /admin/users

Create a dense but readable user administration screen. Header: User Management, explanatory subtitle, Create Team and Create User actions.

Summary cards show actual total/active/inactive users and teams. Filter by role, department, status and team, with searchable names/emails. Present the existing user table and supported actions clearly.

Core columns: user name/email, team, department, role, status and reporting-manager information. Preserve available edit, activate/deactivate and password setup/reset actions. Do not render nonfunctional bulk actions or activity buttons.

Create/Edit User popup: Full Name, Email Address, Mobile Number, Username, Team, Department, Role, Reporting Manager, active/status and any existing notes/designation fields. Use two columns on desktop, one on mobile. Save only through the existing API.

Password setup result popup: clearly labeled one-time setup link and Copy action. Do not email plaintext passwords or claim invitation delivery without a configured delivery flow.

## 06. Team Management — /admin/teams

Show a Team Management header, Create Team action and existing team listing with name/code, department, lead, capacity/status, color and edit controls.

Create/Edit Team popup: Team Name, Team Code, Department, Team Lead, Member Capacity, Default Role, Team Color, Visibility, Active Team, Team-level Reporting and Description. Display existing membership controls where supported. Preserve unique-code and manager/team validations.

Use a compact two-column modal, accessible selects, clear status pills, empty state and Save/Cancel actions. Do not invent productivity metrics without data.

## 07. Departments — /admin/departments

Create a simple department administration page with a title, short description, Create Department action and searchable list/table of actual departments.

Create Department popup uses the existing Department Name, Code and supported form fields. Explain duplicate-code errors inline. Maintain the same card/table/dialog styling as Team Management.

## 08. Roles & Permissions — /admin/roles

Show cards for Super Admin, Admin, Manager, Executive and Intern, listing their effective policy permissions. Each permitted card has an Edit policy action.

Policy popup: role heading, readable permission checkbox list, Cancel and Save permissions. Make selected permissions easy to scan, with permission names/descriptions where available. State that changes are enforced by the backend. Protect recovery permissions and show real save/conflict errors. Never make role changes a frontend-only operation.

## 09. Client Allocation — /admin/client-allocation

Header: Client Allocation, explanation, Download Template. Two primary cards: Excel dropzone/file details and Excel Format Guide.

Keep the exact allocation headers: Client Name, CPCB ID, User Email, Client Code, Financial Year, Priority, Due Date. Explain that employees are matched by an existing active email, never by name.

Show the clear three-step sequence: Upload → Preview & Validate → Import assignments. Upload/preview alone must not look completed.

Preview: Total Rows, Valid Rows, Errors, Reassignments; row table with Excel row, client, CPCB ID, employee selector/email, FY and validation messages. Allow explicit per-row employee correction and Revalidate preview. Existing pending previews must be resumable from history.

Disable import when validation is unresolved or corrections have not been revalidated. Show explicit reassignment confirmation where required. On success, update relevant dashboards and show an actual imported result.

History table: file, timestamp, row counts, validation counts, status and Resume preview for pending imports. Keep pending and committed states distinct.

## 10. Clients / My Clients — /clients

Management sees all authorized imported assignments; employees see their assigned clients; manager scope follows backend permissions.

Header is Clients or My Clients based on scope. Management has Allocate Clients where permitted. Table: Client, CPCB ID, Financial Year, Assigned To, Priority, Status and View workflow. Keep search, pagination, error/loading/empty states.

The workflow detail popup displays the selected client's identity, FY, stage/status/progress, approval evidence and available next actions. Do not allow the UI to mark a client Completed prematurely.

## 11. CPCB account configuration — /accounts

Retain this existing configuration route without restoring its removed sidebar entry. Design a compact account table for authorized CPCB accounts and linked clients.

Show the existing account identifiers and configuration/status fields. Authorized editing must expose only supported identity configuration such as expected application ID, with version/conflict handling. Do not expose portal passwords/cookies. Explain that account configuration is different from a verified live browser login.

## 12. Tasks — /tasks

Create a work-focused table with client, CPCB ID, financial year, current stage, validation, upload, reconciliation and Review task. Use consistent operational-state badges.

Review task opens the existing workflow detail dialog: six-stage progress, current blockers, uploaded/selected evidence, validation/reconciliation submission and manager verification options where authorized.

Keep business labels Not Started/Pending/Completed distinct from Running/Failed/Awaiting Approval/Rejected/Blocked. Approval-pending tasks must never be styled as fully completed.

## 13. ExtractBot — /bots/extract

Header: ExtractBot and concise CPCB extraction description. Main layout: CPCB Account & Login beside Browser Session Status, followed by controls/modules, logs/output and run history.

Login: authorized client/CPCB assignment selector, selected CPCB user ID, password field and **Open Login**. Human completes OTP in the real browser; show Verify OTP login when appropriate. Explain local-backend Chrome versus authenticated remote browser viewing accurately.

Preserve exact primary labels: **Open Login**, **Scrape All**, **Available**. Enable actions only for appropriate session states. Include supported Cancel/View browser actions.

Show actual module outcomes for procurement, registered/unregistered procurement, summary, wallet transactions, certificate generations/transfers/generated/expiry/filing and Available as supported by the source.

Monitoring: connected status, account, FY, job ID, current stage, rows, module statuses and sanitized timestamped logs. Output: actual Excel download, sheet preview and run summary. Previous Runs uses real data. Failed/partial extraction must be visibly distinct from success.

## 14. Data Upload Bot — /bots/upload

Show Choose operation before login: **PWP Upload** and **PIBO Upload**. **Do not show PWP Production Delete on this page.**

PIBO Upload opens an animated modal asking What would you like to upload? with **Sales** and **Purchase / Procurement**. Sales changes to an animated step asking Where are these sales made? with **Domestic** and **Export**, plus Back. Closing/cancelling preserves the last confirmed choice.

Mode mapping must remain: PWP → pwp; Purchase/Procurement → pibo; Domestic Sales → sales; Export Sales → sales_export. Show the confirmed choice clearly and use its own source schema/template.

Then provide account login/session status, matching Excel/PDF upload, received-file list, template download, Preview & Validate, row issues and authorized execution confirmation. Reset stale validation when workflow/source inputs change.

Preserve real source behaviour: sales generates EPR Invoice Number, and final Submit is disabled in the supplied source. Display that limitation plainly. Never style generated invoices or clicked Submit as verified upload.

Provide actual run logs, row results, failed/unverified-entry report and output/history. Keep validation, form filling, submission and verification distinct. Respect duplicate-submission safeguards.

## 15. Delete Bot — /bots/delete

Use a restrained destructive accent within the same design system. Show **PWP Production Delete** as a clickable setup button before login; it opens a production-year popup. This setup action does not delete anything.

Popup: Production From Year, explanatory copy, Continue to login when disconnected or Review production records when connected. Then show normal authorized CPCB login/manual OTP/session status.

Records section: year, Fetch Records, actual record identifiers/selection checkboxes, deletion reason, Request approval, approval state and Delete approved records. Changing the year clears stale local record selection.

Final confirmation shows approved record count/year and requires the existing typed confirmation. The backend-approved exact snapshot determines the mutation. Show verified results, failures and manual-verification requirements honestly. Never expose unbounded delete-all behaviour or bypass manager authorization.

## 16. Pending Approvals — /approvals

Create a manager review screen with real approval summary cards, stage/status tabs and a searchable request table. Include validation/reconciliation and the available deletion-request review controls.

Rows show client, CPCB ID, FY, stage/type, submitter, date/priority/status and Review details as provided by the API.

Review popup: client/employee context, workflow progress, evidence download/preview links, actual validation details, remarks, Approve and Reject. Rejection requires a reason. Preserve version/evidence checks and manager scope. Make awaiting approval purple and rejection red; final completion remains blocked until required conditions pass.

## 17. Reports & Analytics — /reports

Use the same report layout with data scope based on Employee, Manager or Admin permissions. Show actual workload/completion/pending/failure/approval counts, available charts and assignment/workflow table.

Expose supported Excel, CSV and PDF exports. Do not display unsupported filters or invented analytics.

Authorized weekly-report area: employee selection, preview reporting period/manager recipient, Outlook-compatible HTML preview and explicit send confirmation. Display missing configuration, provider acceptance, uncertain delivery and failure truthfully. Email acceptance is not proof of delivery.

## 18. AI Assistant — /ai-assistant

Design a two-column assistant: main conversation and a narrower contextual panel. Main area includes greeting, approved quick prompts, message bubbles, text input, Send, actual conversation history and Clear conversation.

Context panel shows only supported authorized assignment/client/FY/stage information. Quick prompts help with OTP/extraction, validation, upload failures and completion blockers.

Keep SOP/knowledge-base mode visibly distinct from configured model answers. Render source/context links only when available. Do not add decorative attachment/voice buttons unless implemented. Never invent job causes or bypass approvals through chat.

## 19. Audit Logs — /audit

Create a read-only authorized audit view with search, sorting and pagination. Present the existing actor/action/target/details/timestamp data clearly, with readable timestamps and compact operation labels.

Long detail values should remain scannable and safe. Keep sensitive credentials and session tokens redacted. No fake activity and no frontend deletion of audit history.

## 20. Settings — /settings

My Profile card: current name, email, role and department; Change Password action. Password popup includes current/new password, requirements, errors and real save state.

Authorized management users also see Integration Status and Weekly Manager Reports settings. Clearly distinguish Configured from connection/delivery verified.

Weekly configuration: existing cron pattern, Asia/Kolkata timezone, enabled toggle and Save reporting schedule. Explain the default Monday 9:00 AM schedule and missing prerequisites. Keep secrets out of frontend forms unless a real secure configuration workflow exists.

## Shared popups and exceptional states

Keep consistent styling across Create/Edit User, setup/reset link, Create/Edit Team, Create Department, role policy, allocation correction/reassignment, workflow evidence, manager upload verification, approval/rejection, PIBO operation/sales type, deletion setup/final confirmation, weekly-report preview/send, change password, workbook preview and browser viewer.

Notification dropdown must use real unread counts and authorized deep links. Show generic errors, field-level validation, retry actions, no-permission states, expired sessions and empty states. Unknown routes use the existing Page not found view.

## Route notes and acceptance checklist

- / redirects to /dashboard; /uploads redirects to /bots/upload. Preserve these redirects.
- /admin/dashboard is the existing protected dashboard variant. Managers use the shared dashboard with role-specific title/data; do not invent a separate manager URL.
- No CPCB IDs sidebar link, global navbar search, old workspace card or old sidebar footer.
- No Delete shortcut on upload. PIBO choices use animated accessible popups.
- Royal-blue sidebar expands/collapses on desktop; full mobile drawer; transparent company logo.
- Real scoped data, unchanged BOT logic, manual OTP, approval gates and honest result states.
- Verify desktop/tablet/mobile, keyboard navigation, readable contrast, reduced motion, loading/errors and existing browser flows. Run relevant typecheck/build checks. Provide screenshots as verification, not substitutes for functioning controls.
