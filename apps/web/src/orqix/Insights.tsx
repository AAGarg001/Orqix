import {PdfDownloadButton} from '../client/PdfDownloadButton';
import { BlobButton } from "./BlobButton";
import { CopyAction } from "./CopyAction";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  UserRound,
  Mail,
  BriefcaseBusiness,
  Layers,
  Activity,
  CheckCheck,
  Download,
  Eye,
  FileCheck2,
  LockKeyhole,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { api, post } from "../api";
import type { Dashboard, Doc, User } from "./types";
import {
  Button,
  ConfirmationDialog,
  DataTable,
  EmptyState,
  ErrorAlert,
  MetricCard,
  PageHeader,
  StatusBadge,
  WorkflowStepper,
} from "./ui";
const useData = <T,>(path: string, enabled = true) =>
  useQuery({
    queryKey: [path],
    queryFn: () => api<T>(path),
    enabled,
    refetchInterval: 10000,
  });
const date = (s: unknown) =>
  s
    ? new Date(String(s)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "—";
export function ApprovalsPage() {
  const q = useData<{ approvals: Doc[] }>("/platform/approvals"),
    deletions = useData<{ requests: Doc[] }>("/platform/deletion-requests"),
    dashboard = useData<Dashboard>("/platform/dashboard"),
    [tab, setTab] = useState("all"),
    [selected, setSelected] = useState<Doc | null>(null),
    [remarks, setRemarks] = useState(""),
    client = useQueryClient();
  const rows = [
    ...(q.data?.approvals ?? []).map((a) => ({ ...a, kind: "workflow" })),
    ...(
      deletions.data?.requests.filter((r) =>
        ["PENDING", "APPROVED", "REJECTED"].includes(r.status),
      ) ?? []
    ).map((a) => ({ ...a, kind: "deletion", stage: "Deletion" })),
  ] as Doc[];
  const review = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      post(
        selected!.kind === "deletion"
          ? `/platform/deletion-requests/${selected!.id}/review`
          : `/platform/approvals/${selected!.id}/review`,
        { decision, remarks, version: selected!.version },
      ),
    onSuccess: () => {
      toast.success("Review recorded");
      setSelected(null);
      setRemarks("");
      void client.invalidateQueries();
    },
  });
  const filtered = rows.filter(
      (a) => tab === "all" || a.stage === tab || a.status === tab,
    ),
    assignment = dashboard.data?.rows.find(
      (r) => r.id === selected?.assignmentId,
    );
  return (
    <>
      <PageHeader
        title="Pending Approvals"
        subtitle="Review employee evidence and authorize the next workflow stage."
      />
      <div className="oq-metrics">
        <MetricCard
          label="Pending Approvals"
          value={rows.filter((r) => r.status === "PENDING").length}
          icon={<FileCheck2 />}
        />
        <MetricCard
          label="Under Review"
          value={rows.filter((r) => r.status === "UNDER_REVIEW").length}
          icon={<Eye />}
          color="amber"
        />
        <MetricCard
          label="Approved This Month"
          value={
            rows.filter(
              (r) =>
                r.status === "APPROVED" &&
                String(r.reviewedAt).slice(0, 7) ===
                  new Date().toISOString().slice(0, 7),
            ).length
          }
          icon={<CheckCheck />}
          color="green"
        />
        <MetricCard
          label="Rejected This Month"
          value={
            rows.filter(
              (r) =>
                r.status === "REJECTED" &&
                String(r.reviewedAt).slice(0, 7) ===
                  new Date().toISOString().slice(0, 7),
            ).length
          }
          icon={<X />}
          color="red"
        />
      </div>
      <div className="oq-tabs">
        {[
          ["all", "All"],
          ["validation", "Validation (Step 3)"],
          ["reconciliation", "Reconciliation (Step 5)"],
          ["Deletion", "Deletion"],
          ["APPROVED", "Approved"],
          ["REJECTED", "Rejected"],
        ].map(([id, label]) => (
          <BlobButton
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </BlobButton>
        ))}
      </div>
      <DataTable
        rows={filtered}
        loading={q.isPending}
        error={q.error}
        columns={[
          {
            key: "client",
            label: "Client / CPCB ID",
            render: (a) => {
              const r = dashboard.data?.rows.find(
                (r) => r.id === a.assignmentId,
              );
              return (
                <div>
                  <strong>{r?.client?.name ?? "Assigned client"}</strong>
                  <small>{r?.account?.cpcbId ?? a.assignmentId}</small>
                </div>
              );
            },
          },
          { key: "stage", label: "Stage" },
          {
            key: "requestedBy",
            label: "Submitted By",
            render: (a) =>
              dashboard.data?.rows.find((r) => r.id === a.assignmentId)
                ?.employee ?? a.requestedBy,
          },
          {
            key: "createdAt",
            label: "Submitted",
            render: (a) => date(a.createdAt),
          },
          {
            key: "pending",
            label: "Days Pending",
            render: (a) =>
              Math.max(
                0,
                Math.floor((Date.now() - Date.parse(a.createdAt)) / 86400000),
              ),
          },
          {
            key: "status",
            label: "Status",
            render: (a) => <StatusBadge value={a.status} />,
          },
          {
            key: "action",
            label: "Review",
            render: (a) => (
              <Button
                variant="secondary"
                onClick={() => {
                  setSelected(a);
                  setRemarks("");
                }}
              >
                Review details
              </Button>
            ),
          },
        ]}
      />
      {selected ? (
        <ConfirmationDialog
          open
          onClose={() => setSelected(null)}
          title="Review Approval"
          description={`${assignment?.client?.name ?? "Authorized client"} · ${assignment?.account?.cpcbId ?? selected.assignmentId}`}
          wide
        >
          <WorkflowStepper workflow={assignment?.workflow} />
          <div className="oq-review-details">
            <div>
              <h3>Submission</h3>
              <p>Stage: {selected.stage}</p>
              <p>Submitted: {date(selected.createdAt)}</p>
              <p>
                Evidence version: {selected.evidenceVersion ?? "Snapshot-based"}
              </p>
              {selected.reason ? (
                <p>Deletion reason: {selected.reason}</p>
              ) : null}
              {selected.ids ? (
                <p>{selected.ids.length} selected record fingerprints</p>
              ) : null}
            </div>
            <div>
              <h3>Submitted Evidence</h3>
              {selected.evidenceIds?.map((id: string) => (
                <a
                  className="oq-inline-link"
                  key={id}
                  href={`/api/platform/files/${id}/download`}
                >
                  <Download size={15} />
                  Download evidence {id.slice(0, 8)}
                </a>
              ))}
              {selected.records ? (
                <pre>{JSON.stringify(selected.records, null, 2)}</pre>
              ) : null}
              <StatusBadge value={selected.status} />
            </div>
          </div>
          <label>
            Manager Remarks
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Rejection requires a reason"
            />
          </label>
          <ErrorAlert error={review.error} />
          {selected.status === "PENDING" ? (
            <div className="oq-modal-footer">
              <Button
                variant="danger"
                disabled={review.isPending || remarks.trim().length < 3}
                onClick={() => review.mutate("reject")}
              >
                Reject / request correction
              </Button>
              <Button
                disabled={review.isPending}
                onClick={() => review.mutate("approve")}
              >
                Approve evidence
              </Button>
            </div>
          ) : (
            <p>
              Reviewed by {selected.reviewedBy} · {selected.remarks}
            </p>
          )}
        </ConfirmationDialog>
      ) : null}
    </>
  );
}
export function ReportsPage({ user }: { user: User }) {
  const q = useData<Dashboard>("/platform/reports"),
    users = useData<{ users: User[] }>(
      "/platform/users",
      user.permissions.includes("users.view"),
    ),
    [employee, setEmployee] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [confirm, setConfirm] = useState(false);
  const periodPreview = useMutation({
      mutationFn: () => api<any>("/platform/weekly/preview/" + employee),
      onSuccess: setPreview,
    }),
    send = useMutation({
      mutationFn: () =>
        post("/platform/weekly/send", {
          employeeId: employee,
          confirmation: "SEND REPORT TO ASSIGNED MANAGER",
        }),
      onSuccess: () => {
        toast.success(
          "Graph accepted the report request; delivery is not independently confirmed.",
        );
        setConfirm(false);
      },
    });
  const m = q.data?.metrics,
    chart = [
      { name: "Completed", count: m?.completed ?? 0 },
      { name: "Pending", count: m?.pending ?? 0 },
      { name: "Not Started", count: m?.notStarted ?? 0 },
      { name: "Approval", count: m?.awaitingApproval ?? 0 },
    ];
  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Metrics from authorized assignments and accepted workflow milestones."
        actions={
            <><a className="oq-button secondary" href="/api/platform/reports/export?format=csv">CSV</a><PdfDownloadButton className="oq-button secondary" href="/api/platform/reports/export?format=pdf" title="Authorized Workflow Report" label="PDF" /><a className="oq-button primary" href="/api/platform/reports/export">
            <Download size={17} />
            Export Excel
            </a></>
        }
      />
      <div className="oq-metrics">
        <MetricCard label="Clients" value={m?.clients ?? 0} icon={<Users />} />
        <MetricCard
          label="Completed Workflows"
          value={m?.completed ?? 0}
          icon={<CheckCheck />}
          color="green"
        />
        {["admin","super_admin"].includes(user.role ?? "") ? (
        <MetricCard
          label="Pending Approvals"
          value={m?.awaitingApproval ?? 0}
          icon={<ShieldCheck />}
          color="purple"
        />
        ) : null}
        <MetricCard
          label="Failed BOT Jobs"
          value={m?.failedJobs ?? 0}
          icon={<Activity />}
          color="red"
        />
      </div>
      <section className="oq-card">
        <h2>Workflow Status Distribution</h2>
        <p>
          Counts are CPCB ID / financial-year assignments. Failed jobs are not
          completed work.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar
              dataKey="count"
              fill="#075CF5"
              radius={[5, 5, 0, 0]}
              maxBarSize={65}
            />
          </BarChart>
        </ResponsiveContainer>
      </section>
      {user.permissions.includes("reports.view.team") ? (
        <section className="oq-card">
          <h2>Weekly Outlook Report</h2>
          <p>
            Preview actual employee records and assigned manager recipient
            before sending.
          </p>
          <div className="oq-actions">
            <select
              aria-label="Employee report"
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
            >
              <option value="">Select employee</option>
              {users.data?.users
                .filter((u) => u.reportingManagerId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
            <Button
              variant="secondary"
              disabled={!employee || periodPreview.isPending}
              onClick={() => periodPreview.mutate()}
            >
              <Eye size={16} />
              Preview report
            </Button>
            {user.permissions.includes("settings.manage") ? (
              <Button disabled={!preview} onClick={() => setConfirm(true)}>
                <Send size={16} />
                Send to manager
              </Button>
            ) : null}
          </div>
          <ErrorAlert error={periodPreview.error ?? send.error} />
          {preview ? (
            <>
              <div className="oq-info">
                To: {preview.recipient} · {preview.period.start} to{" "}
                {preview.period.end}
              </div>
              <iframe
                title="Outlook report preview"
                className="oq-email-preview"
                sandbox=""
                srcDoc={preview.html}
              />
            </>
          ) : null}
        </section>
      ) : null}
      <DataTable
        rows={q.data?.rows ?? []}
        loading={q.isPending}
        error={q.error}
        columns={[
          { key: "client", label: "Client", render: (r) => r.client?.name },
          {
            key: "account",
            label: "CPCB ID",
            render: (r) => r.account?.cpcbId,
          },
          { key: "financialYear", label: "FY" },
          { key: "employee", label: "Employee" },
          { key: "stage", label: "Stage", render: (r) => r.workflow?.stage },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge value={r.workflow?.businessStatus} />,
          },
        ]}
      />
      <ConfirmationDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Send weekly report"
        description="This sends the displayed report to the actual assigned manager."
      >
        <p>Recipient: {preview?.recipient}</p>
        <ErrorAlert error={send.error} />
        <Button disabled={send.isPending} onClick={() => send.mutate()}>
          Confirm report send
        </Button>
      </ConfirmationDialog>
    </>
  );
}
export function AssistantPage() {
  const history = useData<{ conversations: Doc[] }>(
      "/platform/assistant/history",
    ),
    dashboard = useData<Dashboard>("/platform/dashboard"),
    client = useQueryClient(),
    [message, setMessage] = useState(""),
    [assignment, setAssignment] = useState("");
  const send = useMutation({
      mutationFn: () =>
        post("/platform/assistant", {
          message,
          assignmentId: assignment || undefined,
        }),
      onSuccess: () => {
        setMessage("");
        void client.invalidateQueries({
          queryKey: ["/platform/assistant/history"],
        });
      },
    }),
    clear = useMutation({
      mutationFn: () => post("/platform/assistant/clear"),
      onSuccess: () =>
        void client.invalidateQueries({
          queryKey: ["/platform/assistant/history"],
        }),
    });
  const row = dashboard.data?.rows.find((r) => r.id === assignment);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (message.trim()) send.mutate();
  }
  return (
    <>
      <PageHeader
        title="AI Compliance Assistant"
        subtitle="Guidance grounded in approved usage rules and your authorized records."
      />
      <div className="oq-assistant-grid">
        <section className="oq-card oq-chat">
          <div className="oq-card-heading">
            <h2>
              <Sparkles size={19} />
              ORQIX Assistant
            </h2>
            <Button
              variant="ghost"
              onClick={() => clear.mutate()}
              disabled={clear.isPending}
            >
              Clear conversation
            </Button>
          </div>
          <div className="oq-chat-messages" role="log" aria-label="Assistant conversation" aria-live="polite" aria-busy={send.isPending}>
            {history.data?.conversations
              .filter((c) => !c.archived)
              .slice()
              .reverse()
              .map((c) => (
                <div key={c.id}>
                  <div className="oq-chat-user">{c.message}</div>
                  <div className="oq-chat-answer">
                    <span>
                      <Sparkles size={16} />
                      {c.mode === "model"
                        ? "AI response"
                        : "Knowledge-base guide · no model configured"}
                    </span>
                    <p>{c.answer}</p>
                    <small>Sources: {c.sources?.join(" · ")}</small>
                    <CopyAction text={c.answer}/>
                  </div>
                </div>
              ))}
            {!history.data?.conversations.some((c) => !c.archived) ? (
              <div className="oq-chat-welcome">
                <span>
                  <Sparkles size={30} />
                </span>
                <h2>How can I assist you today?</h2>
                <p>
                  Ask about BOT controls, approval gates or the next step for an
                  authorized client.
                </p>
                {[
                  "What should I do after selecting Open Login?",
                  "Why is this client's workflow incomplete?",
                  "How do I validate files before uploading?",
                ].map((prompt) => (
                  <BlobButton key={prompt} onClick={() => setMessage(prompt)}>
                    {prompt}
                    <span>→</span>
                  </BlobButton>
                ))}
              </div>
            ) : null}
          </div>
          {send.isPending?<div className="oq-assistant-waiting" role="status"><LoaderCircle className="oq-spin" size={16}/>Preparing a response from your authorized context…</div>:null}
          <ErrorAlert error={send.error ?? history.error ?? dashboard.error} />
          {send.isError?<Button variant="ghost" disabled={!message.trim()||send.isPending} onClick={()=>send.mutate()}>Retry response</Button>:null}
          <form onSubmit={submit} className="oq-chat-input">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-label="Ask the assistant"
              placeholder="Ask about workflows, templates, or an authorized issue…"
              maxLength={4000}
              disabled={send.isPending}
            />
            <Button
              disabled={!message.trim() || send.isPending}
              aria-label="Send message"
            >
              {send.isPending?<LoaderCircle className="oq-spin" size={18}/>:<Send size={18} />}
            </Button>
          </form>
          <small className="oq-chat-disclaimer">
            The assistant cannot approve, upload or delete. Confirm actions in
            the authorized workflow.
          </small>
        </section>
        <aside className="oq-card oq-intelligence">
          <h2>Workflow Intelligence</h2>
          <label>
            Current Client / CPCB ID
            <select
              value={assignment}
              onChange={(e) => setAssignment(e.target.value)}
            >
              <option value="">General usage guidance</option>
              {dashboard.data?.rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.client?.name} · {r.account?.cpcbId}
                </option>
              ))}
            </select>
          </label>
          <dl>
            <dt>Current Page</dt>
            <dd>AI Assistant</dd>
            <dt>Workflow Stage</dt>
            <dd>{row?.workflow?.stage ?? "No client selected"}</dd>
            <dt>Validation</dt>
            <dd>{row?.workflow?.validation ?? "—"}</dd>
            <dt>Upload Verification</dt>
            <dd>{row?.workflow?.upload ?? "—"}</dd>
            <dt>Reconciliation</dt>
            <dd>{row?.workflow?.reconciliation ?? "—"}</dd>
          </dl>
          <div className="oq-info purple">
            <ShieldCheck size={18} />
            Only authorized records are retrieved. Model responses require
            configured provider credentials.
          </div>
        </aside>
      </div>
    </>
  );
}
export function AuditPage() {
  const q = useData<{ events: Doc[] }>("/platform/audit");
  return (
    <>
      <PageHeader
        title="Audit Logs"
        subtitle="Authenticated actors and state-changing actions across the workspace."
      />
      <DataTable
        rows={q.data?.events ?? []}
        loading={q.isPending}
        error={q.error}
        columns={[
          { key: "createdAt", label: "Time", render: (r) => date(r.createdAt) },
          { key: "actorName", label: "Actor" },
          { key: "action", label: "Action" },
          { key: "targetId", label: "Reference" },
          {
            key: "details",
            label: "Details",
            render: (r) => <details className="oq-audit-details"><summary>View event details</summary><pre>{JSON.stringify(r.details,null,2)}</pre></details>,
          },
        ]}
      />
    </>
  );
}
export function SettingsPage({ user }: { user: User }) {
  const admin = user.permissions.includes("settings.manage"),
    settings = useData<{ weekly: Doc; integrations: Record<string, boolean> }>(
      "/platform/settings",
      admin,
    ),
    [pattern, setPattern] = useState("0 9 * * 1"),
    [enabled, setEnabled] = useState(false),
    [change, setChange] = useState(false),
    client = useQueryClient();
  const save = useMutation({
      mutationFn: () =>
        post("/platform/settings/weekly", {
          enabled,
          pattern,
          timezone: "Asia/Kolkata",
        }),
      onSuccess: () => {
        toast.success("Weekly report schedule saved");
        void client.invalidateQueries();
      },
    }),
    password = useMutation({
      mutationFn: (values: Record<string, string>) =>
        post("/profile/password", values),
      onSuccess: () => {
        toast.success("Password changed. Sign in again.");
        location.href = "/login";
      },
    });
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your profile, integrations and authorized reporting configuration."
      />
      <div className="oq-two-columns">
        <section className="oq-card oq-profile-card">
          <div className="oq-profile-heading"><span><UserRound size={24}/></span><div><h2>My Profile</h2><p>Your account details and organizational information.</p></div></div>
          <div className="oq-profile-identity"><span className="oq-profile-avatar">{user.name.slice(0,1).toUpperCase()}</span><div><h3>{user.name}</h3><p>{user.role.replaceAll('_',' ')}{' \u00b7 '}{user.department || 'Department not assigned'}</p></div><Button onClick={()=>setChange(true)}><LockKeyhole size={16}/>Change Password</Button></div>
          <dl className="oq-profile-details">{[{label:'Full Name',value:user.name,Icon:UserRound},{label:'Email',value:user.email,Icon:Mail},{label:'Role',value:user.role.replaceAll('_',' '),Icon:BriefcaseBusiness},{label:'Department',value:user.department||'Not assigned',Icon:Layers}].map(({label,value,Icon})=><div key={label}><Icon size={20}/><div><dt>{label}</dt><dd>{value}</dd></div></div>)}</dl>
        </section>
        {admin ? (
          <section className="oq-card">
            <h2>Integration Status</h2>
            <p>
              Configured status is not a connectivity or delivery guarantee.
            </p>
            {Object.entries(settings.data?.integrations ?? {}).map(
              ([key, ok]) => (
                <div className="oq-integration" key={key}>
                  <strong>{key.toUpperCase()}</strong>
                  <StatusBadge value={ok ? "Configured" : "Not configured"} />
                </div>
              ),
            )}
            <ErrorAlert error={settings.error} />
          </section>
        ) : null}
      </div>
      {admin ? (
        <section className="oq-card">
          <h2>Weekly Manager Reports</h2>
          <p>
            Default: Monday, 9:00 AM, Asia/Kolkata. Uses actual
            reporting-manager relationships.
          </p>
          <div className="oq-form-grid">
            <label>
              Cron Schedule
              <input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder={settings.data?.weekly.pattern ?? "0 9 * * 1"}
              />
            </label>
            <label>
              Timezone
              <input readOnly value="Asia/Kolkata" />
            </label>
            <label className="oq-check-label">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable automatic weekly reports
            </label>
          </div>
          <ErrorAlert error={save.error} />
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Save reporting schedule
          </Button>
        </section>
      ) : null}
      <ConfirmationDialog
        open={change}
        onClose={() => setChange(false)}
        title="Change Password"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            password.mutate(
              Object.fromEntries(new FormData(e.currentTarget)) as Record<
                string,
                string
              >,
            );
          }}
        >
          <label>
            Current Password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={14}
              required
            />
          </label>
          <ErrorAlert error={password.error} />
          <Button disabled={password.isPending}>Update password</Button>
        </form>
      </ConfirmationDialog>
    </>
  );
}
