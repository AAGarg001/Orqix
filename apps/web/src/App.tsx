import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  FileSpreadsheet,
  Fingerprint,
  Globe2,
  Layers3,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Monitor,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import gsap from "gsap";
import { api, post } from "./api";
import { isActive, type Job, type Me } from "./types";
const BrowserView = lazy(() => import("./BrowserView"));
const modes = {
  all: "Procurement & Wallet",
  available: "Available certificates",
  combined: "Complete extraction",
};
const pretty = (value: string) =>
  ({
    awaiting_otp: "Awaiting OTP",
    ready: "Ready to run",
    partial: "Partial extraction",
    starting: "Starting",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
  })[value] ?? value;
const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
function Button({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`button ${className}`} {...props}>
      {children}
    </button>
  );
}
function ErrorNote({ error }: { error: Error | null }) {
  return error ? (
    <p className="error-note" role="alert">
      {error.message}
    </p>
  ) : null;
}
function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${wide ? "modal-wide" : ""}`}>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <Dialog.Close className="modal-close" aria-label="Close dialog">
            <X size={20} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Auth({ onSuccess }: { onSuccess: () => void }) {
  const [register, setRegister] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      post(`/auth/${register ? "register" : "login"}`, body),
    onSuccess,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(
      Object.fromEntries(new FormData(e.currentTarget)) as Record<
        string,
        string
      >,
    );
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <span className="eyebrow light">YOUR COMPLIANCE, CONNECTED</span>
        <h1>
          Less manual work.
          <br />
          <em>More possibility.</em>
        </h1>
        <p>
          One secure workspace to connect with CPCB, run your extraction
          workflows, and take your data with you.
        </p>
        <div className="auth-orbit">
          <Globe2 size={110} strokeWidth={0.7} />
          <div>
            <ShieldCheck size={22} /> Private by design
          </div>
          <div>
            <FileSpreadsheet size={22} /> Excel, ready to work
          </div>
        </div>
        <small>Purpose-built for the people behind compliance.</small>
      </section>
      <section className="auth-form">
        <div className="auth-form-inner">
          <span className="mini-label">
            <span className="dot" /> COMMON WORKSPACE
          </span>
          <h2>{register ? "Create your workspace" : "Welcome back."}</h2>
          <p>
            {register
              ? "Set up your operator account to get started."
              : "Sign in to your automation workspace."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Your name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={10}
                maxLength={128}
                placeholder="At least 10 characters"
              />
            </label>
            <ErrorNote error={mutation.error} />
            <Button className="primary" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <LoaderCircle className="spin" size={18} />
              ) : null}
              {register ? "Create account" : "Sign in"}
              <ArrowRight size={18} />
            </Button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to Common?"}{" "}
            <button
              onClick={() => {
                setRegister(!register);
                mutation.reset();
              }}
            >
              {register ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="security-foot">
            <LockKeyhole size={15} /> Secure sessions. Your data stays yours.
          </div>
        </div>
      </section>
    </main>
  );
}
function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-icon">
        <Layers3 size={22} />
      </span>
      common<span className="brand-period">.</span>
    </Link>
  );
}
export function App() {
  const client = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<
        Omit<Me, "user"> & {
          user: Me["user"] | null;
        }
      >("/me"),
    retry: false,
  });
  if (me.isPending)
    return (
      <div className="page-loader">
        <Brand />
        <LoaderCircle className="spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!me.data?.user)
    return (
      <Auth
        onSuccess={() => {
          void client.invalidateQueries({ queryKey: ["me"] });
        }}
      />
    );
  return <Workspace me={{ ...me.data, user: me.data.user }} />;
}
function Workspace({ me }: { me: Me }) {
  const client = useQueryClient(),
    navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement>(null);
  const [create, setCreate] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () =>
      api<{
        jobs: Job[];
      }>("/jobs"),
    refetchInterval: 10000,
  });
  const capacity = useQuery({
    queryKey: ["capacity"],
    queryFn: () =>
      api<{
        active: number;
        total: number;
      }>("/capacity"),
    refetchInterval: 5000,
  });
  const logout = useMutation({
    mutationFn: () => post("/auth/logout"),
    onSuccess: () => {
      client.clear();
      navigate("/");
    },
  });
  useEffect(() => {
    const events = new EventSource("/api/events");
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["jobs"] });
    };
    events.addEventListener("refresh", refresh);
    return () => events.close();
  }, [client]);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from(".reveal", {
        y: 18,
        opacity: 0,
        stagger: 0.07,
        duration: 0.55,
        ease: "power2.out",
      });
    }, mainRef);
    return () => ctx.revert();
  }, []);
  const allJobs = jobs.data?.jobs ?? [],
    selectedJob = allJobs.find((j) => j.id === selected);
  const activeCount = allJobs.filter((j) => isActive(j.status)).length;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <button
          className="workspace-picker"
          onClick={() => navigate("/settings")}
        >
          <span className="workspace-avatar">CW</span>
          <span>
            Compliance workspace<small>Operator workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          <NavLink to="/" end>
            <LayoutDashboard size={18} /> Overview
          </NavLink>
          <NavLink to="/jobs">
            <Activity size={18} /> Automation jobs{" "}
            {activeCount > 0 ? (
              <span className="nav-count">{activeCount}</span>
            ) : null}
          </NavLink>
          <NavLink to="/portals">
            <Globe2 size={18} /> Connected portals
          </NavLink>
          <NavLink to="/downloads">
            <ArrowDownToLine size={18} /> Downloads
          </NavLink>
        </nav>
        <span className="nav-label second">MANAGE</span>
        <nav>
          <NavLink to="/settings">
            <Settings2 size={18} /> Workspace settings
          </NavLink>
          <NavLink to="/guide">
            <CircleHelp size={18} /> Help & guide
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={22} />
            <strong>Your data. Your control.</strong>
            <p>Extracted records are never stored in our database.</p>
            <Link to="/guide">
              How privacy works <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="user-block">
            <span className="user-avatar">
              {me.user.name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{me.user.name}</strong>
              <small>Workspace operator</small>
            </span>
            <button
              aria-label="Sign out"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell" ref={mainRef}>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            <strong>Automation console</strong>
          </div>
          <div className="top-actions">
            <span className="connection-pill">
              <span className="dot" />
              {me.workerRuntime === "local"
                ? "Local CPCB browser"
                : "Live cloud browser"}
            </span>
            <Link
              className="icon-button"
              to="/jobs"
              aria-label="View job activity"
            >
              <Bell size={18} />
            </Link>
            <span className="top-avatar">{me.user.name[0].toUpperCase()}</span>
          </div>
        </header>
        <main className="content">
          {me.workerRuntime === "local" ? (
            <div className="notice compact">
              <Monitor size={18} />
              <p>
                <strong>Actual CPCB · local Chrome.</strong> Enter your portal
                credentials in a job. Chrome opens on this computer for client
                OTP and extraction.{" "}
                {me.metadataStore === "memory"
                  ? "Platform accounts/history reset on backend restart; configure Atlas for persistent metadata."
                  : ""}
              </p>
            </div>
          ) : null}
          {null}
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <div className="page-heading reveal">
                    <div>
                      <span className="eyebrow">YOUR AUTOMATION WORKSPACE</span>
                      <h1>
                        A little less manual.
                        <br className="mobile-break" /> A lot more done
                        <span>.</span>
                      </h1>
                      <p>
                        Connect to CPCB, run your workflows, and let your data
                        come to you.
                      </p>
                    </div>
                    <Button className="primary" onClick={() => setCreate(true)}>
                      <Plus size={18} /> New extraction
                    </Button>
                  </div>
                  <section className="hero-grid reveal">
                    <div className="hero-card">
                      <div className="hero-copy">
                        <span className="hero-kicker">
                          <span className="dot" /> BUILT FOR YOUR WORKFLOW
                        </span>
                        <h2>
                          From portal to Excel.
                          <br />
                          <em>Without the busywork.</em>
                        </h2>
                        <p>
                          Your familiar extraction logic, now in one
                          <br className="desktop-only" /> secure, independent
                          workspace.
                        </p>
                        <Button onClick={() => setCreate(true)}>
                          Start an extraction <ArrowUpRight size={17} />
                        </Button>
                        <span className="hero-foot">
                          <ShieldCheck size={14} /> Isolated sessions{" "}
                          <span>·</span> No permanent data storage
                        </span>
                      </div>
                      <div className="hero-art" aria-hidden="true">
                        <div className="orbit orbit-one" />
                        <div className="orbit orbit-two" />
                        <div className="orbit orbit-three" />
                        <div className="portal-tile">
                          <Globe2 size={27} />
                          <span>CPCB PORTAL</span>
                        </div>
                        <div className="art-line" />
                        <div className="excel-tile">
                          <FileSpreadsheet size={43} strokeWidth={1.3} />
                          <div className="sheet-lines">
                            <i />
                            <i />
                            <i />
                          </div>
                          <span>.xlsx</span>
                          <b>
                            <Check size={17} />
                          </b>
                        </div>
                        <div className="floating-chip">
                          <span className="dot" /> Ready for your next workflow
                        </div>
                        <Leaf className="art-leaf" size={54} strokeWidth={1} />
                      </div>
                    </div>
                    <div className="portal-summary">
                      <div className="card-top">
                        <span className="mini-label">
                          YOUR CONNECTED PORTAL
                        </span>
                        <span className="tag">Available</span>
                      </div>
                      <div className="portal-emblem">
                        <Globe2 size={30} />
                      </div>
                      <h3>CPCB EPR Portal</h3>
                      <p>Central Pollution Control Board</p>
                      <div className="portal-capabilities">
                        <span>
                          <Check size={13} /> Procurement
                        </span>
                        <span>
                          <Check size={13} /> Wallet
                        </span>
                        <span>
                          <Check size={13} /> Available
                        </span>
                      </div>
                      <Link to="/portals">
                        View portal details <ArrowRight size={16} />
                      </Link>
                    </div>
                  </section>
                  <section className="stats-grid reveal">
                    <Stat
                      label="Active jobs"
                      value={activeCount.toString().padStart(2, "0")}
                      note="Independent sessions"
                      icon={<Activity size={19} />}
                      accent="green"
                    />
                    <Stat
                      label="Completed jobs"
                      value={allJobs
                        .filter((j) => j.status === "completed")
                        .length.toString()
                        .padStart(2, "0")}
                      note="Successfully extracted"
                      icon={<CheckCheck size={19} />}
                      accent="blue"
                    />
                    <Stat
                      label="Records processed"
                      value={allJobs
                        .reduce((sum, j) => sum + j.records, 0)
                        .toLocaleString("en-IN")}
                      note={"Across your recent jobs"}
                      icon={<Database size={19} />}
                      accent="purple"
                    />
                    <Stat
                      label="Available downloads"
                      value={allJobs
                        .filter((j) => j.artifact)
                        .length.toString()
                        .padStart(2, "0")}
                      note={`${me.retentionMinutes}-minute file retention`}
                      icon={<FileSpreadsheet size={19} />}
                      accent="amber"
                    />
                  </section>
                  <JobList
                    jobs={allJobs.slice(0, 5)}
                    loading={jobs.isPending}
                    error={jobs.error}
                    onSelect={setSelected}
                    search={search}
                    setSearch={setSearch}
                  />
                  <section className="bottom-grid reveal">
                    <div className="workflow-card">
                      <div>
                        <span className="mini-label">
                          A SIMPLER WAY TO WORK
                        </span>
                        <h3>Three steps. One final Excel.</h3>
                      </div>
                      <div className="steps">
                        <div>
                          <span>01</span>
                          <strong>Connect & verify</strong>
                          <p>
                            Log in to CPCB and enter
                            <br />
                            the OTP from your client.
                          </p>
                        </div>
                        <ChevronRight size={17} />
                        <div>
                          <span>02</span>
                          <strong>Run your extraction</strong>
                          <p>
                            Follow progress in your
                            <br />
                            isolated browser session.
                          </p>
                        </div>
                        <ChevronRight size={17} />
                        <div>
                          <span>03</span>
                          <strong>Download & you're done</strong>
                          <p>
                            Get your final workbook.
                            <br />
                            Temporary files auto-delete.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="capacity-card">
                      <span className="mini-label">EXECUTION CAPACITY</span>
                      <div>
                        <span className="capacity-symbol">
                          <Layers3 size={22} />
                        </span>
                        <strong>
                          {capacity.data
                            ? capacity.data.total - capacity.data.active
                            : "—"}{" "}
                          <small>slots available</small>
                        </strong>
                      </div>
                      <p>Each job gets its own independent browser.</p>
                      <div className="capacity-track">
                        <i
                          style={{
                            width: `${capacity.data ? (100 * capacity.data.active) / capacity.data.total : 0}%`,
                          }}
                        />
                      </div>
                      <span className="capacity-caption">
                        {capacity.data?.active ?? 0} active /{" "}
                        {capacity.data?.total ?? "—"} configured slots
                      </span>
                    </div>
                  </section>
                </>
              }
            />
            <Route
              path="/jobs"
              element={
                <>
                  <PageTitle
                    title="Automation jobs"
                    subtitle="Every workflow, independently tracked."
                    action={
                      <Button
                        className="primary"
                        onClick={() => setCreate(true)}
                      >
                        <Plus size={17} /> New extraction
                      </Button>
                    }
                  />
                  <JobList
                    jobs={allJobs}
                    loading={jobs.isPending}
                    error={jobs.error}
                    onSelect={setSelected}
                    search={search}
                    setSearch={setSearch}
                  />
                </>
              }
            />
            <Route
              path="/downloads"
              element={
                <>
                  <PageTitle
                    title="Your downloads"
                    subtitle={`Final Excel workbooks are kept for ${me.retentionMinutes} minutes, then automatically deleted.`}
                  />
                  <div className="download-grid">
                    {allJobs
                      .filter((j) => j.artifact)
                      .map((j) => (
                        <div className="download-card" key={j.id}>
                          <span className="download-icon">
                            <FileSpreadsheet size={26} />
                          </span>
                          <h3>{j.name}</h3>
                          <p>{modes[j.mode]}</p>
                          <span className={`status ${j.status}`}>
                            {pretty(j.status)}
                          </span>
                          <small>
                            Expires {j.expiresAt ? date(j.expiresAt) : "soon"}
                          </small>
                          <a
                            className="button primary"
                            href={`/api/jobs/${j.id}/download`}
                          >
                            <ArrowDownToLine size={16} /> Download Excel
                          </a>
                          <DeleteFile id={j.id} />
                        </div>
                      ))}
                    {!allJobs.some((j) => j.artifact) ? (
                      <Empty
                        title="Your next Excel starts here"
                        text="Completed extractions will appear here while their temporary files are available."
                        action={() => setCreate(true)}
                      />
                    ) : null}
                  </div>
                </>
              }
            />
            <Route
              path="/portals"
              element={
                <>
                  <PageTitle
                    title="Connected portals"
                    subtitle="Purpose-built workflows for the portals you use."
                  />
                  <section className="info-panel">
                    <div className="info-icon">
                      <Globe2 size={32} />
                    </div>
                    <div>
                      <span className="tag">Supported workflow</span>
                      <h2>CPCB EPR Portal</h2>
                      <p>epr.cpcb.gov.in · Central Pollution Control Board</p>
                      <p>
                        Procurement, procurement summaries, wallet tabs and
                        available certificates.
                      </p>
                      <div className="info-actions">
                        <Button
                          className="primary"
                          onClick={() => setCreate(true)}
                        >
                          New CPCB extraction <ArrowRight size={16} />
                        </Button>
                        <a
                          href="https://epr.cpcb.gov.in/login"
                          target="_blank"
                          rel="noreferrer"
                          className="button"
                        >
                          Visit portal <ArrowUpRight size={16} />
                        </a>
                      </div>
                    </div>
                  </section>
                  <div className="notice">
                    <Fingerprint size={20} />
                    <p>
                      Your platform account and CPCB account are separate. Each
                      extraction session requires its own portal login and
                      user-assisted OTP verification.
                    </p>
                  </div>
                </>
              }
            />
            <Route
              path="/settings"
              element={
                <>
                  <PageTitle
                    title="Workspace settings"
                    subtitle="Your account and the policies that protect your work."
                  />
                  <section className="settings-grid">
                    <div className="info-panel vertical">
                      <Users size={25} />
                      <h3>Operator account</h3>
                      <dl>
                        <dt>Name</dt>
                        <dd>{me.user.name}</dd>
                        <dt>Email</dt>
                        <dd>{me.user.email}</dd>
                        <dt>Concurrent jobs per operator</dt>
                        <dd>{me.maxJobsPerUser}</dd>
                      </dl>
                      <Button onClick={() => logout.mutate()}>
                        <LogOut size={16} /> Sign out
                      </Button>
                    </div>
                    <div className="info-panel vertical">
                      <ShieldCheck size={25} />
                      <h3>Data & retention</h3>
                      <dl>
                        <dt>Extracted records in database</dt>
                        <dd>Never stored</dd>
                        <dt>Excel availability</dt>
                        <dd>{me.retentionMinutes} minutes after completion</dd>
                        <dt>Stored metadata</dt>
                        <dd>Job status, section counts, timestamps</dd>
                        <dt>Environment</dt>
                        <dd>{"Live · Python workers"}</dd>
                      </dl>
                    </div>
                  </section>
                </>
              }
            />
            <Route
              path="/guide"
              element={
                <>
                  <PageTitle
                    title="Your workspace, explained"
                    subtitle="Everything you need for a clean extraction."
                  />
                  <div className="guide-grid">
                    {[
                      [
                        "01",
                        "Connect to CPCB",
                        "Create a job and enter your CPCB credentials. In live mode, the isolated browser opens inside your job. Credentials are sent to the worker, never saved in MongoDB.",
                      ],
                      [
                        "02",
                        "Complete verification",
                        "Call your client, get the OTP, and enter it directly into the live CPCB browser. Finish the portal login, then click Verify session.",
                      ],
                      [
                        "03",
                        "Run and monitor",
                        "Choose Procurement & Wallet, Available only, or a combined workbook. Run extraction in the verified session. Portal availability and session policies affect execution.",
                      ],
                      [
                        "04",
                        "Download your Excel",
                        "Review section results. Partial extraction means some sections are incomplete. Download the workbook before its retention window expires.",
                      ],
                      [
                        "05",
                        "Delete temporary data",
                        "Use Delete temporary files after downloading, or wait for automatic expiry. Cancelling a job destroys its browser and temporary data.",
                      ],
                      [
                        "06",
                        "Live environment setup",
                        "Local mode opens real Chrome on the backend computer. Hosted mode uses isolated headless Chromium browsers. Both run the original CPCB scraper; no sample data is generated.",
                      ],
                    ].map(([n, title, text]) => (
                      <article className="guide-card" key={n}>
                        <span>{n}</span>
                        <h3>{title}</h3>
                        <p>{text}</p>
                      </article>
                    ))}
                  </div>
                </>
              }
            />
            <Route
              path="*"
              element={
                <Empty
                  title="Page not found"
                  text="Return to your automation workspace."
                />
              }
            />
          </Routes>
          <footer className="footer">
            <span>
              <Leaf size={14} /> Thoughtfully automated. Securely delivered.
            </span>
            <span>
              Common workspace <span className="footer-divider">/</span> CPCB
              EPR
            </span>
          </footer>
        </main>
      </div>
      <NewJob
        open={create}
        close={() => setCreate(false)}
        onCreated={(id) => {
          setCreate(false);
          setSelected(id);
        }}
      />
      {selectedJob ? (
        <JobDialog job={selectedJob} me={me} close={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">COMMON WORKSPACE</span>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <article className="stat-card">
      <div>
        <span>{label}</span>
        <span className={`stat-icon ${accent}`}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>
        <span className={`tiny-dot ${accent}`} />
        {note}
      </p>
    </article>
  );
}
function JobList({
  jobs,
  loading,
  error,
  onSelect,
  search,
  setSearch,
}: {
  jobs: Job[];
  loading: boolean;
  error: Error | null;
  onSelect: (id: string) => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const filtered = jobs.filter(
    (j) =>
      `${j.name} ${j.id}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "active" ? isActive(j.status) : j.status === filter)),
  );
  return (
    <section className="jobs-panel reveal">
      <div className="panel-heading">
        <div>
          <h2>
            Recent activity <span>{jobs.length}</span>
          </h2>
          <p>Your workflows, from start to spreadsheet.</p>
        </div>
        <Link to="/jobs">
          View all jobs <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="table-toolbar">
        <div className="table-tabs" aria-label="Filter jobs">
          {[
            ["all", "All jobs"],
            ["active", "Active"],
            ["completed", "Completed"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={15} />
          <input
            aria-label="Search jobs"
            placeholder="Search jobs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span>⌕</span>
        </label>
      </div>
      <ErrorNote error={error} />
      {loading ? (
        <div className="table-loading">
          <LoaderCircle className="spin" size={20} /> Loading your jobs…
        </div>
      ) : filtered.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>EXTRACTION NAME</th>
                <th>STATUS</th>
                <th>RECORDS</th>
                <th>CREATED</th>
                <th>RESULT</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <tr key={j.id}>
                  <td>
                    <button className="job-name" onClick={() => onSelect(j.id)}>
                      <span className="job-icon">
                        <FileSpreadsheet size={18} />
                      </span>
                      <span>
                        {j.name}
                        <small>
                          {modes[j.mode]} <span>·</span> {j.id.slice(0, 8)}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className={`status ${j.status}`}>
                      <span />
                      {pretty(j.status)}
                    </span>
                  </td>
                  <td className="record-value">
                    {j.records.toLocaleString("en-IN")}
                  </td>
                  <td className="date-cell">{date(j.createdAt)}</td>
                  <td>
                    {j.artifact ? (
                      <a
                        className="table-download"
                        href={`/api/jobs/${j.id}/download`}
                      >
                        <ArrowDownToLine size={14} /> Excel
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      onClick={() => onSelect(j.id)}
                      aria-label={`Open ${j.name}`}
                    >
                      <MoreHorizontal size={19} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            search || filter !== "all"
              ? "No matching jobs"
              : "A clean slate. Your next workflow awaits."
          }
          text={
            search || filter !== "all"
              ? "Try another search or filter."
              : "Start a new extraction to connect to CPCB and generate your first workbook."
          }
        />
      )}
    </section>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: () => void;
}) {
  return (
    <div className="empty">
      <span>
        <FileSpreadsheet size={28} strokeWidth={1.3} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action ? (
        <Button onClick={action}>
          <Plus size={16} /> New extraction
        </Button>
      ) : null}
    </div>
  );
}
function NewJob({
  open,
  close,
  onCreated,
}: {
  open: boolean;
  close: () => void;
  onCreated: (id: string) => void;
}) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      post<{
        job: Job;
      }>("/jobs", body),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["jobs"] });
      onCreated(result.job.id);
      mutation.reset();
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(
      Object.fromEntries(new FormData(e.currentTarget)) as Record<
        string,
        string
      >,
    );
  }
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v && !mutation.isPending) {
          close();
          mutation.reset();
        }
      }}
      title="A new extraction"
      description="Your own browser. Your own workflow. One final Excel."
    >
      <form onSubmit={submit}>
        <label>
          Extraction name
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            placeholder="e.g. October compliance review"
          />
        </label>
        <label>
          Portal
          <div className="fixed-field">
            <Globe2 size={18} /> CPCB EPR Portal{" "}
            <span className="tag">Supported</span>
          </div>
        </label>
        <label>
          Workflow
          <select name="mode" defaultValue="combined">
            <option value="combined">
              Complete extraction · includes Available
            </option>
            <option value="all">
              Procurement & Wallet · existing Scrape All
            </option>
            <option value="available">Available certificates only</option>
          </select>
        </label>
        <div className="notice compact">
          <ShieldCheck size={18} />
          <p>
            {
              "A separate browser will be allocated. Enter your CPCB credentials and complete OTP verification in the next step."
            }
          </p>
        </div>
        <ErrorNote error={mutation.error} />
        <Button className="primary full" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Plus size={16} />
          )}{" "}
          Create extraction
        </Button>
      </form>
    </Modal>
  );
}
function JobDialog({
  job,
  me,
  close,
}: {
  job: Job;
  me: Me;
  close: () => void;
}) {
  const client = useQueryClient();
  const [browser, setBrowser] = useState(false);
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      post(`/jobs/${job.id}/${path}`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    action.mutate(
      { path: "login", body: Object.fromEntries(new FormData(form)) },
      {
        onSuccess: () => {
          form.reset();
          if (me.workerRuntime === "hosted") setBrowser(true);
        },
      },
    );
  }
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
      title={job.name}
      description={`${modes[job.mode]} · ${job.id.slice(0, 8)} · ${"Isolated CPCB session"}`}
      wide
    >
      <div className="job-status-line">
        <span className={`status ${job.status}`}>
          <span />
          {pretty(job.status)}
        </span>
        <span>{job.records.toLocaleString("en-IN")} records</span>
        <span>
          <Clock3 size={14} />
          {date(job.createdAt)}
        </span>
      </div>
      <div className="stage-line" role="status">
        {isActive(job.status) && job.status !== "ready" ? (
          <LoaderCircle
            size={17}
            className={
              job.status === "running" || job.status === "starting"
                ? "spin"
                : ""
            }
          />
        ) : (
          <Check size={17} />
        )}
        <p>{job.stage}</p>
      </div>
      {job.error ? <p className="error-note">{job.error}</p> : null}
      {me.workerRuntime === "local" && isActive(job.status) ? (
        <div className="notice compact">
          <Monitor size={20} />
          <p>
            The actual CPCB browser opens as a separate Chrome window on this
            backend computer. Enter the client OTP there, finish portal login,
            then click Verify completed OTP login here. Keep Chrome open while
            extraction runs.
          </p>
        </div>
      ) : null}
      {job.status === "awaiting_otp" ? (
        <section className="login-section">
          <h3>Connect your CPCB account</h3>
          <p>
            {
              "Enter credentials, then fill the client OTP directly in the live portal browser."
            }
          </p>
          <form onSubmit={login}>
            <div className="form-row">
              <label>
                CPCB User ID
                <input
                  name="userId"
                  required
                  autoComplete="off"
                  placeholder={"CEPR User ID"}
                />
              </label>
              <label>
                CPCB password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="off"
                  placeholder={"Portal password"}
                />
              </label>
            </div>
            <div className="action-row">
              <Button disabled={action.isPending} type="submit">
                <LockKeyhole size={16} /> {"Open portal login"}
              </Button>
              <Button
                type="button"
                className="primary"
                disabled={action.isPending}
                onClick={() => action.mutate({ path: "verify" })}
              >
                <Check size={16} />
                {"Verify completed OTP login"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}
      {job.status === "ready" ? (
        <Button
          className="primary full"
          disabled={action.isPending}
          onClick={() => action.mutate({ path: "run" })}
        >
          <Play size={17} /> {"Run extraction"}
        </Button>
      ) : null}
      {me.workerRuntime === "hosted" &&
      ["awaiting_otp", "ready", "running"].includes(job.status) ? (
        <div className="browser-section">
          <Button onClick={() => setBrowser(!browser)}>
            <Monitor size={17} />
            {browser ? "Hide live browser" : "Open live CPCB browser"}
            <ChevronDown size={16} />
          </Button>
          {browser ? (
            <Suspense fallback={<p>Loading browser viewer…</p>}>
              <BrowserView id={job.id} running={job.status === "running"} />
            </Suspense>
          ) : null}
        </div>
      ) : null}
      {null}
      {job.sections.length ? (
        <div className="section-results">
          <h3>Section results</h3>
          {job.sections.map((section, index) => (
            <div key={`${section.name}-${index}`}>
              <span>{section.name}</span>
              <span
                className={
                  section.status === "Success" ? "result-success" : "muted"
                }
              >
                {section.status}
                {section.records !== undefined
                  ? ` · ${section.records} rows`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <ErrorNote error={action.error} />
      <div className="job-bottom-actions">
        {isActive(job.status) ? (
          <Button
            className="danger"
            disabled={action.isPending}
            onClick={() => action.mutate({ path: "cancel" })}
          >
            <Square size={14} /> Cancel & clear session
          </Button>
        ) : null}
        {job.artifact ? (
          <>
            <a className="button primary" href={`/api/jobs/${job.id}/download`}>
              <ArrowDownToLine size={17} /> Download final Excel
            </a>
            <DeleteFile id={job.id} />
          </>
        ) : null}
      </div>
      {job.expiresAt && job.artifact ? (
        <p className="retention-note">
          <ShieldCheck size={14} /> Temporary file expires {date(job.expiresAt)}
          . Download before deleting.
        </p>
      ) : null}
    </Modal>
  );
}
function DeleteFile({ id }: { id: string }) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const mutation = useMutation({
    mutationFn: () => api(`/jobs/${id}/artifact`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  return (
    <div>
      {confirm ? (
        <div className="delete-confirm">
          <span>Downloaded your Excel? Deletion is permanent.</span>
          <Button
            className="danger"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Yes, delete files
          </Button>
          <button onClick={() => setConfirm(false)}>Keep file</button>
        </div>
      ) : (
        <Button className="text-button" onClick={() => setConfirm(true)}>
          <Trash2 size={14} /> Delete temporary files
        </Button>
      )}
      <ErrorNote error={mutation.error} />
    </div>
  );
}
