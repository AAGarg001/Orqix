import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Download,
  Eye,
  FileSpreadsheet,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Upload,
} from "lucide-react";
import { BotLogPanel } from "./BotLogPanel";
import { api, post } from "../api";
import { UploadWorkflowPicker, uploadModeLabels, type UploadMode } from "./UploadWorkflowPicker";
import type { Job } from "../types";
import type { Dashboard, Doc, Session, User } from "./types";
import {
  Button,
  ConfirmationDialog,
  DataTable,
  EmptyState,
  ErrorAlert,
  PageHeader,
  StatusBadge,
} from "./ui";
const useData = <T,>(path: string, enabled = true) =>
  useQuery({
    queryKey: [path],
    queryFn: () => api<T>(path),
    enabled,
    refetchInterval: 3000,
  });
export function BotPage({
  kind,
  session,
}: {
  kind: "extract" | "upload" | "delete";
  session: Session & { user: User };
}) {
  const client = useQueryClient(),
    d = useData<Dashboard>("/platform/dashboard"),
    history = useData<{ jobs: Job[] }>("/jobs"),
    runHistory = useData<{runs:Doc[]}>("/extraction-history",kind === "extract"),
    [assignmentId, setAssignmentId] = useState(""),
    [jobId, setJobId] = useState(""),
    [extractMode, setExtractMode] = useState<"all" | "available" | null>(null),
    [uploadMode, setUploadMode] = useState<UploadMode | null>(null),
    [deleteSetup, setDeleteSetup] = useState(false),
    [deleteYear, setDeleteYear] = useState(String(new Date().getFullYear())),
    [password, setPassword] = useState(""),
    [preview, setPreview] = useState(false);
  const q = useData<{ job: Job }>(`/jobs/${jobId}`, !!jobId),
    job = q.data?.job,
    assignment = d.data?.rows.find((a) => a.id === assignmentId);
  useEffect(() => {
    if (jobId || assignmentId) return;
    const activeJob = history.data?.jobs.find(j =>
      (j.kind ?? 'extract') === kind &&
      ['starting', 'awaiting_otp', 'ready', 'running'].includes(j.status) &&
      d.data?.rows.some(a => a.id === j.assignmentId && (a.userId === session.user.id || session.user.permissions.includes('clients.allocate'))));
    if (activeJob?.assignmentId) {
      setAssignmentId(activeJob.assignmentId);
      setJobId(activeJob.id);
    }
  }, [history.data, d.data, jobId, assignmentId, kind, session.user.id, session.user.permissions]);
  const portalWindow = useRef<Window | null>(null);
  function openPortalWindow(id?: string) {
    const url = id ? `/portal-browser/${id}` : "/portal-browser";
    portalWindow.current = window.open(url, "orqix-portal-browser", "popup,width=1440,height=1000,resizable=yes,scrollbars=yes");
    if (!portalWindow.current) toast.error("Allow popups for ORQIX, then click Open portal window.");
  }
  const shownAlerts = useRef(new Set<string>());
  useEffect(()=>{
    if(kind !== 'extract' || !job) return;
    for(const event of job.events ?? []) {
      const key = `${job.id}:${event.sequence}`;
      if(shownAlerts.current.has(key)) continue;
      shownAlerts.current.add(key);
      if(/^(Procurement|Wallet|Available) part extracted successfully\./.test(event.message)) toast.success(event.message, {position:'top-right'});
      else if(/^(Procurement|Wallet|Available) part failed\./.test(event.message)) toast.error(event.message, {position:'top-right'});
    }
    if(job.status === 'failed' && !shownAlerts.current.has(`${job.id}:failed`)) {
      shownAlerts.current.add(`${job.id}:failed`);toast.error(job.stage || 'Extraction failed.',{position:'top-right'});
    }
  },[job,kind]);
  const login = useMutation({
    onError: error => toast.error(error.message,{position:'top-right'}),
    mutationFn: async () => {
      if (!assignment)
        throw new Error("Select an authorized client and CPCB ID.");
      if (!password) throw new Error("Enter the CPCB password.");
      const r = job?.status === "awaiting_otp" ? { job } : await post<{ job: Job }>("/jobs", {
        name: `${kind === "extract" ? "ExtractBot" : kind === "upload" ? "Upload Bot" : "Delete Bot"} · ${assignment.client?.name}`,
        mode: "all",
        assignmentId,
        kind,
      });
      setJobId(r.job.id);
      if (portalWindow.current && !portalWindow.current.closed) portalWindow.current.location.replace(`/portal-browser/${r.job.id}`);
      for (let i = 0; i < (session.workerRuntime === "hosted" ? 240 : 90); i++) {
        const { job } = await api<{ job: Job }>(`/jobs/${r.job.id}`);
        if (job.status === "failed") throw new Error(job.error ?? job.stage);
        if (job.status === "awaiting_otp") {
          await post(`/jobs/${r.job.id}/login`, {
            userId: assignment.account?.cpcbId,
            password,
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error("Worker startup timed out.");
    },
    onSuccess: () => {
      setPassword("");
      portalWindow.current?.focus();
      toast.success("CPCB login opened. Complete OTP manually.");
      void client.invalidateQueries();
    },
  });
  const act = useMutation({
    onError: error => toast.error(error.message,{position:'top-right'}),
    mutationFn: async ({ action, mode }: { action: string; mode?: string }) => {
      if (!mode) return post(`/jobs/${jobId}/${action}`);
      // Portal login can finish before the UI knows about it. Verify the actual
      // browser before changing mode; failed OTP/identity checks stop this chain.
      const current = await api<{job: Job}>(`/jobs/${jobId}`);
      if (current.job.status === 'awaiting_otp') await post(`/jobs/${jobId}/verify`);
      await post(`/jobs/${jobId}/mode`, {mode});
      return post(`/jobs/${jobId}/run`);
    },
    onSuccess: () => void client.invalidateQueries(),
  });
  const title =
    kind === "extract"
      ? "ExtractBot"
      : kind === "upload"
        ? "Data Upload Bot"
        : "Delete Bot";
  const ready = !!job && ["ready", "completed", "partial"].includes(job.status);
  const startExtraction = (mode: "all" | "available") => {
    setExtractMode(mode);
    if (!ready && job?.status !== 'awaiting_otp') {
      toast.info(job?.status === "awaiting_otp" ? "Complete manual OTP, then click Verify OTP login before starting extraction." : "Select your client and use Open Login. Complete OTP before starting extraction.");
      document.getElementById("cpcb-account-login")?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
      return;
    }
    act.mutate({action: "run", mode}, {onSuccess: () => toast.success(`${mode === "available" ? "Available" : "Scrape All"} extraction started.`)});
  };
  return (
    <>
      <PageHeader
        title={title}
        subtitle={
          kind === "extract"
            ? "Extract data from CPCB EPR Portal and export Excel reports."
            : kind === "upload"
              ? "Validate source-specific Excel and invoice PDFs before authorized portal submission."
              : "Fetch, select, approve and confirm exact production records before deletion."
        }
      />
      {kind === "extract" ? <section className="oq-card oq-upload-picker" aria-label="Extraction controls">
        <div className="oq-card-heading"><h2>Choose extraction</h2><span>Original Python workflows</span></div>
        <p>Scrape All extracts the main portal modules. Available runs the separate available-certificate workflow.</p>
        <div className="oq-actions">
          <Button variant={extractMode === 'all' ? 'primary' : 'secondary'} aria-pressed={extractMode === 'all'} disabled={login.isPending || act.isPending || job?.status === 'running' || job?.status === 'starting'} onClick={()=>startExtraction('all')}>
            {(act.isPending || job?.status === 'running') && extractMode === 'all' ? <LoaderCircle size={16} className="oq-spin"/> : <Play size={16}/>}Scrape All
          </Button>
          <Button variant={extractMode === 'available' ? 'primary' : 'secondary'} aria-pressed={extractMode === 'available'} disabled={login.isPending || act.isPending || job?.status === 'running' || job?.status === 'starting'} onClick={()=>startExtraction('available')}>
            {(act.isPending || job?.status === 'running') && extractMode === 'available' ? <LoaderCircle size={16} className="oq-spin"/> : <FileSpreadsheet size={16}/>}Available
          </Button>
        </div>
        <p role="status">{ready ? 'CPCB login verified. Click either button to start its extraction immediately.' : job?.status === 'awaiting_otp' ? 'Finish OTP and open the entity dashboard in CPCB, then click Scrape All or Available. The session will be verified automatically before extraction.' : 'First use Open Login and complete manual OTP in CPCB. Then click Scrape All or Available to verify and start.'}</p>
        <ErrorAlert error={act.error}/>
      </section> : null}
      {kind === "upload" ? <UploadWorkflowPicker value={uploadMode} onChange={setUploadMode} disabled={job?.status === "running"} /> : null}
      {kind === "delete" ? <section className="oq-card"><h2>PWP Production Delete</h2><p>Choose the production year, connect the correct CPCB account and fetch records. Deletion requires selected records, manager approval and final confirmation.</p><Button variant="danger" disabled={job?.status==='running'} onClick={()=>setDeleteSetup(true)}>PWP Production Delete</Button></section> : null}
      <ConfirmationDialog open={deleteSetup} onClose={()=>setDeleteSetup(false)} title="PWP Production Delete setup" description="Choose the production year. This step does not delete any records.">
        <label>Production From Year<input value={deleteYear} onChange={e=>setDeleteYear(e.target.value)} inputMode="numeric" maxLength={4} /></label>
        <p>{ready ? 'Continue to fetch and review records before requesting approval.' : 'Complete the client login and manual OTP before fetching production records.'}</p>
        <Button disabled={!/^20\d{2}$/.test(deleteYear)} onClick={()=>{setDeleteSetup(false); requestAnimationFrame(()=>document.getElementById(ready?'pwp-production-delete':'cpcb-account-login')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));}}>{ready?'Review production records':'Continue to login'}</Button>
      </ConfirmationDialog>
      <div className="oq-two-columns">
        <section id="cpcb-account-login" className="oq-card">
          <div className="oq-card-heading">
            <h2>CPCB Account & Login</h2>
            <span>
              <ShieldCheck size={15} />
              Isolated session
            </span>
          </div>
          <label>
            Authorized Client / CPCB ID
            <select
              value={assignmentId}
              disabled={
                !!job &&
                ["starting", "awaiting_otp", "ready", "running"].includes(
                  job.status,
                )
              }
              onChange={(e) => {
                setAssignmentId(e.target.value);
                setJobId("");
              }}
            >
              <option value="">Select a client assignment</option>
              {d.data?.rows
                .filter(
                  (a) =>
                    a.userId === session.user.id ||
                    session.user.permissions.includes("clients.allocate"),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.client?.name} · {a.account?.cpcbId} · {a.financialYear}
                  </option>
                ))}
            </select>
          </label>
          <label>
            CPCB User ID
            <input
              readOnly
              value={assignment?.account?.cpcbId ?? ""}
              placeholder="Selected account ID"
            />
          </label>
          <label>
            CPCB Password
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Never stored in application records"
            />
          </label>
          <div className="oq-actions">
            <Button
              onClick={() => { if (session.workerRuntime === "hosted") openPortalWindow(); login.mutate(); }}
              disabled={
                login.isPending ||
                !assignment ||
                !password ||
                (!!job &&
                  ["starting", "ready", "running"].includes(
                    job.status,
                  ))
              }
            >
              {login.isPending ? (
                <LoaderCircle size={16} className="oq-spin" />
              ) : (
                <LockKeyhole size={16} />
              )}
              Open Login
            </Button>
            {job?.status === "awaiting_otp" ? (
              <Button
                variant="secondary"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "verify" })}
              >
                <Check size={16} />
                Verify OTP login
              </Button>
            ) : null}
          </div>
          <ErrorAlert error={login.error ?? act.error ?? q.error} />
          <div className="oq-info">
            <Monitor size={17} />
            {session.workerRuntime === "local"
              ? "Actual Chrome opens on this backend computer. Enter the client OTP there and finish portal login."
              : "Complete client OTP in the separate portal browser window."}
          </div>
        </section>
        <section className="oq-card">
          <div className="oq-card-heading">
            <h2>Browser Session Status</h2>
            <StatusBadge value={job?.status ?? "Disconnected"} />
          </div>
          <div className="oq-session-visual">
            <Monitor size={48} />
            <strong>
              {job?.status === "ready"
                ? "CPCB session verified"
                : job?.status === "running"
                  ? "Automation running"
                  : job
                    ? "Session allocated"
                    : "Your isolated session starts here"}
            </strong>
            <p>
              {job?.stage ?? "Choose an assigned client, then use Open Login."}
            </p>
          </div>
          <dl className="oq-session-meta">
            <div>
              <dt>Selected account</dt>
              <dd>{assignment?.account?.cpcbId ?? "—"}</dd>
            </div>
            <div>
              <dt>Financial year</dt>
              <dd>{assignment?.financialYear ?? "—"}</dd>
            </div>
            <div>
              <dt>Processed rows</dt>
              <dd>{job?.records ?? 0}</dd>
            </div>
            <div>
              <dt>Job ID</dt>
              <dd>{job?.id.slice(0, 8) ?? "—"}</dd>
            </div>
          </dl>
          {job &&
          session.workerRuntime !== "local" &&
          ["ready", "awaiting_otp", "running"].includes(job.status) ? (
            <Button variant="secondary" onClick={() => openPortalWindow(job.id)}>
              <Monitor size={16} />
              Open portal window
            </Button>
          ) : null}
          {job &&
          ["starting", "awaiting_otp", "ready", "running", ...(session.workerRuntime === "hosted" ? ["completed", "partial"] : [])].includes(
            job.status,
          ) ? (
            <Button
              variant="danger"
              disabled={act.isPending}
              onClick={() => act.mutate({ action: "cancel" })}
            >
              <Square size={14} />
              {session.workerRuntime === "hosted" && ["completed", "partial"].includes(job.status) ? "Clear browser session and files" : "Cancel session"}
            </Button>
          ) : null}
        </section>
      </div>
      {kind === "upload" && job && uploadMode ? (
        <UploadPanel key={`${job.id}:${uploadMode}`} job={job} ready={ready} assignmentId={assignmentId} mode={uploadMode} />
      ) : null}
      {kind === "delete" && job ? (
        <DeletePanel
          key={job.id}
          job={job}
          ready={ready}
          year={deleteYear}
          setYear={setDeleteYear}
          canExecute={session.user.permissions.includes("bot.delete.execute")}
        />
      ) : null}
      <div className="oq-two-columns">
        {kind !== "extract" ? <BotLogPanel job={job}/> : null}
        <section className="oq-card">
          <h2>Output File</h2>
          {job?.artifact ? (
            <div className="oq-output">
              <FileSpreadsheet size={42} />
              <strong>
                {kind === "upload"
                  ? "Upload results & failed entries"
                  : "CPCB extraction workbook"}
              </strong>
              <p>
                {job.status === "partial"
                  ? "Review incomplete modules and verification requirements."
                  : "Both extractions are finished. Review Errors and Skipped before using the workbook."}
              </p>
              <div className="oq-actions">
                <a
                  className="oq-button primary"
                  href={`/api/jobs/${job.id}/download`}
                >
                  <Download size={16} />
                  Download Excel
                </a>
                {kind === "extract" ? (
                  <Button variant="secondary" onClick={() => setPreview(true)}>
                    <Eye size={16} />
                    Preview Sheets
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No output file yet"
              description={kind === 'extract' ? "Run Scrape All and Available for one combined Excel. After download, backend Excel files are deleted; the next extraction rebuilds both workflows." : "Only real worker-generated files will appear here."}
            />
          )}
        </section>
      </div>
      <div className="oq-section-title">
        <h2>Previous Runs</h2>
      </div>
      <DataTable<any>
        rows={
          kind === "extract" ? (runHistory.data?.runs ?? []).map(r=>({...r,name:"ExtractBot",createdAt:r.startedAt})) : history.data?.jobs.filter((j) => (j.kind ?? "extract") === kind) ?? []
        }
        columns={[
          { key: "name", label: "Run" },
          {
            key: "createdAt",
            label: "Started",
            render: (j) => new Date(j.createdAt).toLocaleString("en-IN"),
          },
          {
            key: "status",
            label: "Status",
            render: (j) => <StatusBadge value={j.status} />,
          },
          ...(kind === "extract" ? [] : [{ key: "records", label: "Rows" }]),
          ...(kind === "extract" ? [] : [{
            key: "actions",
            label: "Result",
            render: (j: any) =>
              j.artifact ? (
                <a href={`/api/jobs/${j.id}/download`}>Download Excel</a>
              ) : (
                <span>—</span>
              ),
          }]),
        ]}
      />
      {preview && job ? (
        <PreviewDialog jobId={job.id} close={() => setPreview(false)} />
      ) : null}
    </>
  );
}
function PreviewDialog({ jobId, close }: { jobId: string; close: () => void }) {
  const [sheet, setSheet] = useState(""),
    q = useData<{
      sheets: string[];
      rows: unknown[][];
      sheet: string;
      totalRows: number;
    }>(
      `/jobs/${jobId}/preview${sheet ? "?sheet=" + encodeURIComponent(sheet) : ""}`,
    );
  return (
    <ConfirmationDialog
      open
      onClose={close}
      title="Extracted Data Preview"
      description="First 20 rows of the actual workbook. Download Excel for the complete dataset."
      wide
    >
      <ErrorAlert error={q.error} />
      <select
        value={sheet || q.data?.sheet || ""}
        onChange={(e) => setSheet(e.target.value)}
      >
        {q.data?.sheets.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <div className="oq-table-scroll">
        <table>
          <tbody>
            {q.data?.rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, n) => (
                  <td key={n}>{String(v ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ConfirmationDialog>
  );
}
function UploadPanel({
  job,
  ready,
  assignmentId,
  mode,
}: {
  job: Job;
  ready: boolean;
  assignmentId: string;
  mode: UploadMode;
}) {
  const client = useQueryClient(),
    [excel, setExcel] = useState(""),
    [filenames, setFilenames] = useState<string[]>([]),
    [batch, setBatch] = useState<Doc | null>(null),
    [confirm, setConfirm] = useState(false),
    [typed, setTyped] = useState("");
  const upload = useMutation({
    mutationFn: async (selected: FileList) => {
      const names: string[] = [];
      for (const file of Array.from(selected)) {
        const form = new FormData();
        form.append("file", file);
        const r = await api<{ filename: string }>(
          `/platform/operations/${job.id}/file`,
          { method: "POST", body: form },
        );
        names.push(r.filename);
        if (r.filename.endsWith(".xlsx")) setExcel(r.filename);
      }
      setFilenames((prev) => [...new Set([...prev, ...names])]);
      setBatch(null);
    },
    onSuccess: () => toast.success("Files received by the isolated worker"),
  });
  const validate = useMutation({
      mutationFn: () =>
        post<{ batch: Doc }>(`/platform/operations/${job.id}/validate`, {
          mode,
          filename: excel,
        }),
      onSuccess: (r) => setBatch(r.batch),
    }),
    run = useMutation({
      mutationFn: () =>
        post(`/platform/operations/${job.id}/upload`, {
          batchId: batch!.id,
          confirmation: typed,
        }),
      onSuccess: () => {
        toast.success("Upload started. Submission is not verification.");
        setConfirm(false);
        void client.invalidateQueries();
      },
    });
  return (
    <section className="oq-card">
      <div className="oq-card-heading">
        <h2>Upload Files & Validate</h2>
        <span>Separate templates for each source workflow</span>
      </div>
      <div className="oq-two-columns">
        <div>
          <div className="oq-info"><strong>{uploadModeLabels[mode]}</strong></div>
          <a
            className="oq-inline-link"
            href={`/api/platform/operations/${job.id}/template?mode=${mode}`}
          >
            <Download size={15} />
            Download this workflow's template
          </a>
          <label className="oq-dropzone">
            <Upload size={29} />
            <strong>Select Excel and invoice PDFs</strong>
            <span>Filenames must match the Excel Invoice Filename values.</span>
            <input
              type="file"
              multiple
              accept=".xlsx,.pdf"
              disabled={job.status === "running" || upload.isPending}
              onChange={(e) => {
                if (e.target.files?.length) upload.mutate(e.target.files);
              }}
            />
          </label>
        </div>
        <div className="oq-file-list">
          <h3>Received Files</h3>
          {filenames.length ? (
            filenames.map((f) => (
              <div key={f}>
                <FileSpreadsheet size={17} />
                {f}
                <Check size={15} />
              </div>
            ))
          ) : (
            <EmptyState
              title="No source files selected"
              description="Select the correct template and matching invoices."
            />
          )}
        </div>
      </div>
      <ErrorAlert error={upload.error ?? validate.error ?? run.error} />
      <div className="oq-actions">
        <Button
          variant="secondary"
          disabled={!excel || validate.isPending || job.status === "running"}
          onClick={() => validate.mutate()}
        >
          <ShieldCheck size={16} />
          Preview & Validate
        </Button>
        <Button
          disabled={
            !batch ||
            batch.valid !== batch.total ||
            !ready ||
            run.isPending ||
            job.status !== "ready"
          }
          onClick={() => setConfirm(true)}
        >
          <Upload size={16} />
          Start authorized upload
        </Button>
      </div>
      {batch ? (
        <>
          <div className="oq-info">
            {batch.total} total rows · {batch.valid} valid ·{" "}
            {batch.total - batch.valid} invalid. All rows must pass source
            validation.
          </div>
          <DataTable
            rows={batch.preview.rows}
            columns={[
              { key: "row", label: "Excel Row" },
              {
                key: "values",
                label: "Values",
                render: (r: any) => JSON.stringify(r.values),
              },
              {
                key: "errors",
                label: "Validation",
                render: (r: any) =>
                  r.errors ? (
                    <span className="oq-field-error">{r.errors}</span>
                  ) : (
                    <StatusBadge value="Validation Passed" />
                  ),
              },
            ]}
          />
        </>
      ) : null}
      {mode.startsWith("sales") ? (
        <div className="oq-info amber">
          Source behaviour: Generate EPR Invoice Number is supported; Submit
          remains disabled. This mode cannot be reported as confirmed upload.
        </div>
      ) : null}
      <ConfirmationDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm portal submission"
        description="This action can change records on the real CPCB portal. Review the validated batch and account."
      >
        <p>
          {batch?.valid} rows · {mode} · Assignment {assignmentId.slice(0, 8)}
        </p>
        <label>
          Type SUBMIT VALIDATED RECORDS
          <input value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        <ErrorAlert error={run.error} />
        <Button
          disabled={typed !== "SUBMIT VALIDATED RECORDS" || run.isPending}
          onClick={() => run.mutate()}
        >
          Confirm upload execution
        </Button>
      </ConfirmationDialog>
    </section>
  );
}
function DeletePanel({
  job,
  ready,
  canExecute,
  year,
  setYear,
}: {
  job: Job;
  ready: boolean;
  canExecute: boolean;
  year: string;
  setYear: (value:string)=>void;
}) {
  const [snapshot, setSnapshot] = useState<Doc | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [typed, setTyped] = useState(""),
    [confirmation, setConfirmation] = useState(false),
    client = useQueryClient(),
    requests = useData<{ requests: Doc[] }>("/platform/deletion-requests");
  useEffect(()=>{setSnapshot(null);setIds([]);setConfirmation(false);setTyped('');},[year]);
  const fetchRecords = useMutation({
      mutationFn: () =>
        post<{ snapshot: Doc }>(`/platform/operations/${job.id}/delete/fetch`, {
          year,
        }),
      onSuccess: (r) => {
        setSnapshot(r.snapshot);
        setIds([]);
      },
    }),
    request = useMutation({
      mutationFn: () =>
        post(`/platform/operations/${job.id}/delete/request`, {
          year,
          hash: snapshot!.hash,
          ids,
          reason,
        }),
      onSuccess: () => {
        toast.success("Deletion request sent to your reporting manager");
        void client.invalidateQueries();
      },
    });
  const current = requests.data?.requests
    .filter((r) => r.jobId === job.id && r.year === year)
    .at(0);
  const execute = useMutation({
    mutationFn: () =>
      post(`/platform/operations/${job.id}/delete/execute`, {
        requestId: current!.id,
        version: current!.version,
        confirmation: typed,
      }),
    onSuccess: () => {
      toast.info("Delete requests processed. Portal verification is required.");
      setConfirmation(false);
      void client.invalidateQueries();
    },
  });
  return (
    <section id="pwp-production-delete" className="oq-card oq-delete-panel">
      <div className="oq-card-heading">
        <h2>Production Records — Controlled Deletion</h2>
        <StatusBadge value={current?.status ?? "Approval required"} />
      </div>
      <div className="oq-actions">
        <label>
          Production From Year
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            pattern="20[0-9]{2}"
            maxLength={4}
          />
        </label>
        <Button
          variant="secondary"
          disabled={!ready || fetchRecords.isPending || job.status !== "ready"}
          onClick={() => fetchRecords.mutate()}
        >
          <RefreshCw size={16} />
          Fetch Records
        </Button>
      </div>
      <ErrorAlert
        error={fetchRecords.error ?? request.error ?? execute.error}
      />
      {snapshot ? (
        <>
          <DataTable
            rows={snapshot.records}
            columns={[
              {
                key: "select",
                label: "Select",
                render: (r: any) => (
                  <input
                    aria-label={`Select record ${r.id.slice(0, 8)}`}
                    type="checkbox"
                    checked={ids.includes(r.id)}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...ids, r.id]
                          : ids.filter((id) => id !== r.id),
                      )
                    }
                  />
                ),
              },
              {
                key: "id",
                label: "Record Fingerprint",
                render: (r: any) => r.id.slice(0, 14),
              },
              {
                key: "values",
                label: "Actual Portal Values",
                render: (r: any) =>
                  Object.entries(r.values)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · "),
              },
            ]}
          />
          <label>
            Deletion reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={10}
              placeholder="Explain why these exact records should be deleted"
            />
          </label>
          <div className="oq-actions">
            <Button
              variant="secondary"
              disabled={!ids.length || reason.length < 10 || request.isPending}
              onClick={() => request.mutate()}
            >
              Request approval for {ids.length} records
            </Button>
            <Button
              variant="danger"
              disabled={
                current?.status !== "APPROVED" ||
                !canExecute ||
                execute.isPending
              }
              onClick={() => setConfirmation(true)}
            >
              <Trash2 size={16} />
              Delete approved records
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          title="Fetch real records first"
          description="No Excel is required for this source deletion workflow."
        />
      )}
      {!canExecute ? (
        <div className="oq-info amber">
          Your role can request deletion. Execution also requires the explicit
          bot.delete.execute permission.
        </div>
      ) : null}
      <div className="oq-info">
        <ShieldCheck size={18} />
        Only the approved snapshot IDs can be executed. The source's delete-all
        function is not exposed.
      </div>
      <ConfirmationDialog
        open={confirmation}
        onClose={() => setConfirmation(false)}
        title="Confirm approved deletion"
        description="This sends destructive requests to the real CPCB portal. Only the manager-approved record set will be used."
      >
        <p>
          {current?.ids?.length ?? 0} approved record(s) · Year {current?.year}
        </p>
        <label>
          Type DELETE APPROVED RECORDS
          <input value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        <ErrorAlert error={execute.error} />
        <Button
          variant="danger"
          disabled={typed !== "DELETE APPROVED RECORDS" || execute.isPending}
          onClick={() => execute.mutate()}
        >
          Execute approved deletion
        </Button>
      </ConfirmationDialog>
    </section>
  );
}
