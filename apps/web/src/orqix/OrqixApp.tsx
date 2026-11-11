import {AxisWorkspace} from "../axis/AxisWorkspace";
import {WorkTasksPage} from "./WorkTasksPage";
import { BlobButton } from "./BlobButton";
import {
  lazy,
  Fragment,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { motion, useReducedMotion } from "motion/react";

import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  CalendarDays,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  CloudUpload,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { api, post } from "../api";
import type { Job } from "../types";
import type { AssignmentView, Dashboard, Doc, Session, User } from "./types";
import {
  Button,
  ConfirmationDialog,
  DataTable,
  EmptyState,
  ErrorAlert,
  FormDialog,
  MetricCard,
  PageHeader,
  PermissionGuard,
  SkeletonLoader,
  StatusBadge,
  WorkflowStepper,
  type Field,
} from "./ui";
import "./orqix.css";
import "./premium.css";
import { RouteSurface, useDismissableLayer, useDrawerFocus } from "./experience";
import { BotPage } from "./Bots";
import {RoleManager} from './RoleManager';
import {UploadReview} from './UploadVerification';
const ApprovalsPage=lazy(()=>import('./Insights').then(m=>({default:m.ApprovalsPage})));
const ReportsPage=lazy(()=>import('./Insights').then(m=>({default:m.ReportsPage})));
const AssistantPage=lazy(()=>import('./Insights').then(m=>({default:m.AssistantPage})));
const AuditPage=lazy(()=>import('./Insights').then(m=>({default:m.AuditPage})));
const SettingsPage=lazy(()=>import('./Insights').then(m=>({default:m.SettingsPage})));
const TaskStatusChart=lazy(()=>import("./TaskStatusChart"));
const SaasAdmin=lazy(()=>import("../client/SaasAdmin").then(m=>({default:m.SaasAdmin})));
const ClientApp=lazy(()=>import("../client/ClientApp").then(m=>({default:m.ClientApp})));
const BrowserView = lazy(() => import("../BrowserView"));
const useData = <T,>(path: string, enabled = true) =>
  useQuery({
    queryKey: [path],
    queryFn: () => api<T>(path),
    enabled,
    refetchInterval: 15000,
  });
const date = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const roleLabel = (s: string) =>
  s
    .split("_")
    .map((x) => x[0]?.toUpperCase() + x.slice(1))
    .join(" ");
const active = (j: Job) =>
  ["starting", "awaiting_otp", "ready", "running"].includes(j.status);
function Brand() {
  return (
    <div className="oq-brand">
      <span className="oq-brand-mark">
        O<span />
      </span>
      <div>
        ORQIX
        <small>A A GARG & CO</small>
      </div>
    </div>
  );
}
function Company() {
  return <img className="oq-company-logo" src="/aa-garg-logo.svg" alt="A A Garg & Co - Think Beyond, Innovate, Simplify" />;
}
export function OrqixApp() {
  const session = useData<Session>("/me"),
    client = useQueryClient();
  if (session.isPending)
    return (
      <div className="oq-page-loading">
        <Brand />
        <SkeletonLoader />
      </div>
    );
  return (
    <>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/client/*" element={<Suspense fallback={<SkeletonLoader/>}><ClientApp session={session.data!} onAuthenticated={()=>{void client.invalidateQueries({queryKey:["/me"]});}}/></Suspense>}/>
        <Route path="/setup-password" element={<SetupPassword />} />
        <Route
          path="/admin/login"
          element={
            session.data?.user ? (
              <Navigate to={session.data.user.accountKind==='client'?"/client/dashboard":"/admin/dashboard"} replace />
            ) : (
              <Login
                admin
                onSuccess={() =>
                  client.invalidateQueries({ queryKey: ["/me"] })
                }
              />
            )
          }
        />
        <Route
          path="/login"
          element={
            session.data?.user ? (
              <Navigate to={session.data.user.accountKind==='client'?"/client/dashboard":"/dashboard"} replace />
            ) : (
              <Login
                onSuccess={() =>
                  client.invalidateQueries({ queryKey: ["/me"] })
                }
              />
            )
          }
        />
        <Route
          path="*"
          element={
            session.data?.user ? (
              session.data.user.accountKind==='client'?<Navigate to="/client/dashboard" replace/>:<Shell session={session.data as Session & { user: User }} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </>
  );
}
function Login({
  admin = false,
  onSuccess,
}: {
  admin?: boolean;
  onSuccess: () => void;
}) {
  const [show, setShow] = useState(false),
    [forgot, setForgot] = useState(false);
  const login = useMutation({
    mutationFn: (input: Record<string, string>) =>
      post("/auth/login", { ...input, portal: admin ? "admin" : "user" }),
    onSuccess,
    onError: () => {},
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    login.mutate(
      Object.fromEntries(new FormData(e.currentTarget)) as Record<
        string,
        string
      >,
    );
  }
  return (
    <main className={`oq-login ${admin ? "admin" : ""}`}>
      <header>
        <Company />
        <Link to={admin ? "/login" : "/admin/login"}>
          {admin ? "Employee access" : "Management access"}
          <ArrowUpRight size={16} />
        </Link>
      </header>
      <section className="oq-login-grid">
        <div className="oq-login-card">
          <span className="oq-pill">
            <ShieldCheck size={14} />
            {admin ? "MANAGEMENT PORTAL" : "SECURE USER ACCESS"}
          </span>
          <h1>{admin ? "Welcome, Administrator" : "Welcome to ORQIX"}</h1>
          <p>
            {admin
              ? "Manage people, clients and compliance in one secure workspace."
              : "Your clients, workflows and automation. All in one place."}
          </p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@aagarg.co.in"
                required
              />
            </label>
            <label>
              Password
              <div className="oq-password">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  minLength={10}
                  placeholder="Enter your password"
                />
                <BlobButton
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </BlobButton>
              </div>
            </label>
            <div className="oq-login-options">
              <label>
                <input type="checkbox" name="remember" />
                Remember me
              </label>
              <BlobButton type="button" onClick={() => setForgot(true)}>
                Forgot password?
              </BlobButton>
            </div>
            <ErrorAlert error={login.error} />
            <Button disabled={login.isPending}>
              {login.isPending ? (
                <LoaderCircle className="oq-spin" size={17} />
              ) : (
                <LockKeyhole size={17} />
              )}
              Login as {admin ? "Admin" : "User"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <small className="oq-login-security">
            <ShieldCheck size={14} />
            Your access is protected by role-based permissions.
          </small>
        </div>
        <div className="oq-login-preview">
          <Brand />
          <h2>
            {admin
              ? "Clarity for every decision."
              : "Focus on what moves work forward."}
          </h2>
          <p>
            {admin
              ? "A connected view of your people, your clients, and every step in between."
              : "Work smarter with human-guided automation and a workflow that keeps everyone aligned."}
          </p>
          <div className="oq-office-art" aria-hidden="true">
            <div className="oq-building">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="oq-art-card">
              <ClipboardCheck size={23} />
              <span>
                One workspace.<strong>Complete visibility.</strong>
              </span>
            </div>
            <div className="oq-art-badge">
              <ShieldCheck size={20} />
              Human approvals. Built in.
            </div>
          </div>
          <div className="oq-login-features">
            <span>
              <Check size={15} />
              Isolated BOT sessions
            </span>
            <span>
              <Check size={15} />
              Permission-based access
            </span>
            <span>
              <Check size={15} />
              Traceable workflows
            </span>
          </div>
        </div>
      </section>
      <footer>© {new Date().getFullYear()} A A GARG & CO · ORQIX</footer>
      <ConfirmationDialog
        open={forgot}
        onClose={() => setForgot(false)}
        title="Reset your password"
      >
        <p>
          Contact your authorized administrator for a one-time password setup
          link. Passwords are never sent by email.
        </p>
        <Button onClick={() => setForgot(false)}>Understood</Button>
      </ConfirmationDialog>
    </main>
  );
}
function SetupPassword() {
  const [params] = useSearchParams(),
    [done, setDone] = useState(false);
  const set = useMutation({
    mutationFn: (password: string) =>
      post("/auth/setup-password", { token: params.get("token"), password }),
    onSuccess: () => setDone(true),
  });
  return (
    <div className="oq-setup">
      <Company />
      <section className="oq-card">
        <h1>Set your account password</h1>
        {done ? (
          <>
            <p>Your password is ready. Sign in to your assigned workspace.</p>
            <Link className="oq-button primary" to={params.get('portal')==='client'?'/client/login':'/login'}>
              Go to login
            </Link>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              set.mutate(String(new FormData(e.currentTarget).get("password")));
            }}
          >
            <label>
              New password
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={14}
                required
                placeholder="At least 14 characters"
              />
            </label>
            <ErrorAlert error={set.error} />
            <Button disabled={set.isPending}>Set password</Button>
          </form>
        )}
      </section>
    </div>
  );
}
const menu = [
  ["/dashboard", "Dashboard", LayoutDashboard, "reports.view.self"],
  ["/admin/users", "User Management", Users, "users.create"],
  ["/admin/teams", "Team Management", FolderKanban, "teams.manage"],
  ["/admin/departments", "Departments", Building2, "teams.manage"],
  ["/admin/roles", "Roles & Permissions", ShieldCheck, "users.create"],
  [
    "/admin/client-allocation",
    "Client Allocation",
    CloudUpload,
    "clients.allocate",
  ],
  ["/admin/organizations", "Client Organizations", Building2, "clients.allocate"],
  ["/admin/subscription-plans", "Subscription Plans", BriefcaseBusiness, "settings.manage"],
  ["/admin/client-requests", "Client Requests", ClipboardCheck, "clients.allocate"],
  ["/admin/saas-dashboard", "SaaS Overview", Activity, "reports.view.all"],
  ["/clients", "Clients", BriefcaseBusiness, "clients.view.assigned"],
  ["/tasks", "Tasks", ClipboardCheck, "reports.view.self"],
  ["/axis-dashboard", "Client Data Publishing", Activity, "bot.extract.execute"],
  ["/bots/extract", "ExtractBot", FileSpreadsheet, "bot.extract.execute"],
  ["/bots/upload", "Data Upload Bot", Upload, "bot.upload.execute"],
  ["/bots/delete", "Delete Bot", Trash2, "bot.delete.request"],
  ["/approvals", "Pending Approvals", CheckCheck, "approvals.review"],
  ["/reports", "Reports & Analytics", Activity, "reports.view.self"],
  ["/ai-assistant", "AI Assistant", Sparkles, "reports.view.self"],
  ["/audit", "Audit Logs", ShieldCheck, "audit.view"],
  ["/settings", "Settings", Settings2, "reports.view.self"],
] as const;
const navigationGroup=(path:string)=>path.startsWith('/admin/')?'Administration':path.startsWith('/bots/')?'Automation':['/approvals','/reports','/ai-assistant'].includes(path)?'Insights':['/audit','/settings'].includes(path)?'Workspace settings':path==='/dashboard'?'Overview':'Client operations';
function Shell({ session }: { session: Session & { user: User } }) {
  const user = session.user,
    client = useQueryClient(),
    location = useLocation(),
    navigate = useNavigate(),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [drawer, setDrawer] = useState(false),
    [notices, setNotices] = useState(false),
    [profileOpen,setProfileOpen]=useState(false);
  const noticesRef=useDismissableLayer(notices,()=>setNotices(false));
  const profileRef=useDismissableLayer(profileOpen,()=>setProfileOpen(false));
  const drawerRefs=useDrawerFocus(drawer,()=>setDrawer(false));
  const management = ["admin", "super_admin"].includes(user.role ?? "");
  const notifications = useData<{ notifications: Doc[] }>(
      "/platform/notifications",
    ),
    visibleNotifications = (notifications.data?.notifications ?? []).filter(n=>management || !String(n.link).startsWith("/approvals")),
    unread = visibleNotifications.filter(n=>!n.read).length;
  const has = (p: string) => user.permissions.includes(p);
  const pendingApprovals=useData<{approvals:Doc[]}>('/platform/approvals',management && has('approvals.review'));
  const pendingDeletes=useData<{requests:Doc[]}>('/platform/deletion-requests',management && has('approvals.review'));
  const approvalCount=(pendingApprovals.data?.approvals.filter(a=>a.status==='PENDING').length??0)+(pendingDeletes.data?.requests.filter(a=>a.status==='PENDING'&&a.managerId===user.id).length??0);
  const logout = useMutation({
    mutationFn: () => post("/auth/logout"),
    onSuccess: () => {
      client.clear();
      window.location.replace("/login");
    },
  });
  useEffect(() => {
    const stream = new EventSource("/api/events");
    stream.addEventListener("refresh", () => {
      void client.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "/me",
      });
    });
    return () => stream.close();
  }, [client]);
  useEffect(() => setDrawer(false), [location.pathname]);
  const selected = menu.find((m) => location.pathname.startsWith(m[0]));
  return (
    <div className={`oq-app ${sidebarCollapsed ? "oq-sidebar-collapsed" : ""}`}>
      <a className="oq-skip-link" href="#main-content">Skip to content</a>
      <aside ref={drawerRefs.sidebar} aria-label="Workspace navigation" id="workspace-sidebar" className={`oq-sidebar ${drawer ? "open" : ""}`}>
        <div className="oq-sidebar-heading">
          <Company />
          <span className="oq-sidebar-monogram" aria-hidden="true">AA</span>
          <BlobButton className="oq-sidebar-toggle" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} aria-controls="workspace-sidebar" onClick={()=>setSidebarCollapsed(v=>!v)}>
            {sidebarCollapsed ? <PanelLeftOpen size={20}/> : <PanelLeftClose size={20}/>}
          </BlobButton>
        </div>
        <BlobButton
          className="oq-mobile-close"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        >
          <X />
        </BlobButton>
        <nav>
          {menu
            .filter((m) => has(m[3]) && (m[0] !== "/approvals" || management))
            .map(([path, label, Icon],index,items) => (
              <Fragment key={path}>
              {index===0||navigationGroup(items[index-1][0])!==navigationGroup(path)?<div className="oq-nav-section" aria-hidden="true">{navigationGroup(path)}</div>:null}
              <NavLink to={path} title={label} aria-label={label}>
                <Icon size={19} />
                <span>{label}</span>
                {path === "/approvals" && approvalCount > 0 ? (
                  <small>{approvalCount}</small>
                ) : null}
              </NavLink>
              </Fragment>
            ))}
        </nav>
      </aside>
      {drawer ? (
        <BlobButton
          className="oq-drawer-backdrop"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      ) : null}
      <div className="oq-main" ref={drawerRefs.content}>
        <header className="oq-navbar">
          <BlobButton
            className="oq-nav-toggle"
            aria-label="Open navigation"
            onClick={() => setDrawer(true)}
          >
            <Menu size={21} />
          </BlobButton>
          <div className="oq-breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <strong>{selected?.[1] ?? "Dashboard"}</strong>
          </div>
          <div className="oq-navbar-right">
            <div className="oq-notice-wrap" ref={noticesRef}>
              <BlobButton
                className="oq-notice-trigger"
                aria-label="Notifications"
                aria-expanded={notices} aria-controls="workspace-notifications"
                onClick={() => setNotices(!notices)}
              >
                <Bell size={20} />
                {unread ? <b>{unread}</b> : null}
              </BlobButton>
              {notices ? (
                <div id="workspace-notifications" className="oq-notice-dropdown" role="region" aria-label="Notifications">
                  <h3>
                    Notifications <span>{unread} unread</span>
                  </h3>
                  {visibleNotifications.length ? (
                    visibleNotifications.slice(0, 8).map((n) => (
                      <BlobButton
                        key={n.id}
                        onClick={() => {
                          void post(
                            `/platform/notifications/${n.id}/read`,
                          ).then(() => client.invalidateQueries());
                          navigate(n.link);
                          setNotices(false);
                        }}
                      >
                        <i className={n.read ? "" : "unread"} />
                        <span>
                          {n.title}
                          <small>{date(n.createdAt)}</small>
                        </span>
                      </BlobButton>
                    ))
                  ) : (
                    <EmptyState
                      title="You're all caught up"
                      description="New work and account updates appear here."
                    />
                  )}
                </div>
              ) : null}
            </div>
            <div className="oq-nav-user oq-profile-wrap" ref={profileRef}>
              <span>
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{user.name}</strong>
                <small>{user.designation || roleLabel(user.role)}</small>
              </div>
              <BlobButton aria-label="Profile menu" aria-expanded={profileOpen} aria-controls="workspace-profile-menu" onClick={()=>setProfileOpen(v=>!v)}><ChevronDown size={15}/></BlobButton>
              {profileOpen?<div id="workspace-profile-menu" className="oq-profile-dropdown" role="region" aria-label="Profile actions">
                <div><strong>{user.name}</strong><small>{user.email}</small><span>{roleLabel(user.role)}</span></div>
                <Link to="/settings" onClick={()=>setProfileOpen(false)}><UserRound size={16}/>My profile & security</Link>
                <BlobButton disabled={logout.isPending} onClick={()=>logout.mutate()}><LogOut size={16}/>Sign out</BlobButton>
              </div>:null}
            </div>

          </div>
        </header>
        <main className="oq-content" id="main-content" tabIndex={-1}>
          <RouteSurface><Suspense fallback={<SkeletonLoader/>}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage user={user} />} />
            <Route
              path="/admin/dashboard"
              element={
                <PermissionGuard allowed={has("users.create")}>
                  <DashboardPage user={user} />
                </PermissionGuard>
              }
            />
            <Route
              path="/admin/users"
              element={
                <PermissionGuard allowed={has("users.create")}>
                  <UsersPage />
                </PermissionGuard>
              }
            />
            <Route
              path="/admin/teams"
              element={
                <PermissionGuard allowed={has("teams.manage")}>
                  <TeamsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="/admin/departments"
              element={
                <PermissionGuard allowed={has("teams.manage")}>
                  <DepartmentsPage />
                </PermissionGuard>
              }
            />
            <Route
              path="/admin/roles"
              element={
                <PermissionGuard allowed={has("users.create")}>
                    <RoleManager />
                </PermissionGuard>
              }
            />
            <Route
              path="/admin/client-allocation"
              element={
                <PermissionGuard allowed={has("clients.allocate")}>
                  <AllocationPage />
                </PermissionGuard>
              }
            />
            <Route path="/admin/organizations" element={<PermissionGuard allowed={has('clients.allocate')}><SaasAdmin page="organizations"/></PermissionGuard>}/>
            <Route path="/admin/subscription-plans" element={<PermissionGuard allowed={has('settings.manage')}><SaasAdmin page="plans"/></PermissionGuard>}/>
            <Route path="/admin/client-requests" element={<PermissionGuard allowed={has('clients.allocate')}><SaasAdmin page="requests"/></PermissionGuard>}/>
            <Route path="/admin/saas-dashboard" element={<PermissionGuard allowed={has('reports.view.all')}><SaasAdmin page="analytics"/></PermissionGuard>}/>
            <Route path="/clients" element={<ClientsPage user={user} />} />
            <Route path="/accounts" element={<AccountsPage user={user} />} />
            <Route path="/tasks" element={<WorkTasksPage user={session.user} />} />
            <Route path="/axis-dashboard" element={<PermissionGuard allowed={has("bot.extract.execute")}><AxisWorkspace/></PermissionGuard>}/>
            <Route
              path="/bots/extract"
              element={
                <PermissionGuard allowed={has("bot.extract.execute")}>
                  <BotPage kind="extract" session={session} />
                </PermissionGuard>
              }
            />
            <Route
              path="/bots/upload"
              element={
                <PermissionGuard allowed={has("bot.upload.execute")}>
                  <BotPage kind="upload" session={session} />
                </PermissionGuard>
              }
            />
            <Route
              path="/bots/delete"
              element={
                <PermissionGuard allowed={has("bot.delete.request")}>
                  <BotPage kind="delete" session={session} />
                </PermissionGuard>
              }
            />
            <Route
              path="/approvals"
              element={
                management ? <PermissionGuard allowed={has("approvals.review")}><ApprovalsPage /></PermissionGuard> : <Navigate to="/dashboard" replace />
              }
            />
            <Route path="/reports" element={<ReportsPage user={user} />} />
            <Route path="/ai-assistant" element={<AssistantPage />} />
            <Route
              path="/audit"
              element={
                <PermissionGuard allowed={has("audit.view")}>
                  <AuditPage />
                </PermissionGuard>
              }
            />
            <Route path="/settings" element={<SettingsPage user={user} />} />
            <Route
              path="/uploads"
              element={<Navigate to="/bots/upload" replace />}
            />
            <Route path="*" element={<EmptyState title="Page not found" />} />
          </Routes>
          </Suspense></RouteSurface>
          <footer className="oq-footer">
            <span>ORQIX · A A GARG & CO</span>
            <span>THINK BEYOND · INNOVATE · SIMPLIFY</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function DashboardPage({ user }: { user: User }) {
  const q = useData<Dashboard>("/platform/dashboard"),
    taskQuery = useData<{tasks:Doc[]}>("/platform/tasks"),
    [selected, setSelected] = useState<AssignmentView | null>(null);
  const [params,setParams] = useSearchParams();
  const reduce = useReducedMotion();
  if (q.isPending) return <SkeletonLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!,
    m = d.metrics;
  const selectedRow = d.rows.find(r=>r.id === (selected?.id ?? params.get("assignment")));
  const progressRows = selectedRow ? [selectedRow] : d.rows;
  const workTasks=taskQuery.data?.tasks??[];
  const taskStats={total:workTasks.length,pending:workTasks.filter(t=>t.status==='IN_PROGRESS').length,notStarted:workTasks.filter(t=>t.status==='NOT_STARTED').length,completed:workTasks.filter(t=>t.status==='COMPLETED').length};
  const upcoming=workTasks.filter(t=>t.dueDate&&t.status!=='COMPLETED').sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)));

  return (
    <motion.div
      className="oq-workflow-dashboard"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <PageHeader
        title={
          user.role === "manager"
            ? "Manager Dashboard"
            : user.permissions.includes("users.create")
              ? "Management Dashboard"
              : "My Workflow Dashboard"
        }
        subtitle={`Welcome back, ${user.name.split(" ")[0]}. A clear view of your authorized clients and work.`}
        actions={
          <Link className="oq-button primary" to="/bots/extract">
            <Bot size={20} />
            Open ExtractBot
            <ArrowUpRight size={17} />
          </Link>
        }
      />
      <ErrorAlert error={taskQuery.error}/>
      <div className="oq-metrics">
        {[
          {label:'Assigned Clients',value:m.clients,Icon:Users,color:'blue',to:'/clients'},
          {label:'CPCB IDs',value:m.cpcbIds,Icon:FileCheck2,color:'purple',to:'/clients'},
          {label:'Pending Tasks',value:taskStats.pending+taskStats.notStarted,Icon:Clock3,color:'amber',to:'/tasks'},
          {label:'Completed Tasks',value:taskStats.completed,Icon:CheckCheck,color:'green',to:'/tasks'},
        ].map(({label,value,Icon,color,to})=><Link key={label} to={to} className={`oq-dashboard-metric ${color}`}>
          <span className={`oq-metric-icon ${color}`}><Icon /></span>
          <div><span>{label}</span><strong>{value}</strong></div>
          <span className="oq-metric-arrow"><ArrowRight size={18}/></span>
        </Link>)}
      </div>
      <div className="oq-card">
        <div className="oq-card-heading">
          <h2>My Workflow Progress</h2>
          <span>{selectedRow ? `${selectedRow.client?.name} \u00b7 ${selectedRow.account?.cpcbId} \u00b7 ${selectedRow.financialYear}` : "Select a client to view its progress"}</span>
        </div>
        <label className="oq-workflow-select">Client / CPCB ID<select aria-label="Workflow client" value={selectedRow?.id??''} onChange={e=>{setSelected(d.rows.find(r=>r.id===e.target.value)??null);setParams(e.target.value?{assignment:e.target.value}:{});}}><option value="">All assigned clients</option>{d.rows.map(r=><option key={r.id} value={r.id}>{r.client?.name}{' \u00b7 '}{r.account?.cpcbId}{' \u00b7 '}{r.financialYear}</option>)}</select></label>
        <div className="oq-stage-counts">
          {['Client Assigned','Data Extraction','Upload','Completed'].map((label,i)=>{
            const count=[progressRows.length,progressRows.filter(r=>r.workflow?.extraction==='COMPLETED').length,progressRows.filter(r=>r.workflow?.upload==='VERIFIED').length,progressRows.filter(r=>r.workflow?.businessStatus==='Completed').length][i];
            const active=selectedRow && ((i===1&&selectedRow.workflow?.extraction==='IN_PROGRESS')||(i===2&&['IN_PROGRESS','AWAITING_VERIFICATION'].includes(selectedRow.workflow?.upload??'')));
            const failed=selectedRow&&((i===1&&['FAILED','PARTIAL'].includes(selectedRow.workflow?.extraction??''))||(i===2&&selectedRow.workflow?.upload==='FAILED'));
            return <div key={label} className={count && !failed && !active ? 'is-complete' : ''}><span className={failed?'error':active?'current':count?'accepted':''}>{i+1}</span><strong>{label}</strong><small>{selectedRow?(failed?'Needs retry':active?'In progress':count?'Completed':'Not started'):`${count} IDs`}</small></div>;
          })}
        </div>
      </div>
      {['admin','super_admin'].includes(user.role??'') && selectedRow && selectedRow.workflow?.upload==='AWAITING_VERIFICATION' && selectedRow.userId!==user.id && user.permissions.includes('approvals.approve') ? <UploadReview key={selectedRow.id} row={selectedRow}/> : null}
      <section className="oq-dashboard-clients">
      <div className="oq-section-title">
        <h2>My Assigned Clients</h2>
        <Link to="/clients">
          View all <ArrowUpRight size={15} />
        </Link>
      </div>
      <DataTable
        rows={d.rows}
        columns={[
          {
            key: "client",
            label: "Client / CPCB ID",
            render: (r) => (
              <div className="oq-client-cell">
                <span>
                  <Building2 size={18} />
                </span>
                <div>
                  <button type="button" className="oq-client-select" aria-pressed={selectedRow?.id===r.id} onClick={()=>{setSelected(r);setParams({assignment:r.id});}}>{r.client?.name}</button>
                  <button type="button" className="oq-client-id" onClick={()=>{setSelected(r);setParams({assignment:r.id});}}>{r.account?.cpcbId}</button>
                </div>
              </div>
            ),
          },
          { key: "financialYear", label: "Financial Year" },
          { key: "task", label: "Task Type", render: () => "EPR Compliance" },
          {
            key: "stage",
            label: "Current Stage",
            render: (r) =>
              String(r.workflow?.stage === "VALIDATION" ? "DATA_EXTRACTION" : r.workflow?.stage === "RECONCILIATION" ? "UPLOAD" : r.workflow?.stage ?? "CLIENT_ASSIGNED").replaceAll(
                "_",
                " ",
              ),
          },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge value={r.workflow?.businessStatus} />,
          },
          {
            key: "progress",
            label: "Progress",
            render: (r) => (
              <div className="oq-progress">
                <i style={{ width: r.progress + "%" }} />
                <span>{Math.round(r.progress)}%</span>
              </div>
            ),
          },
        ]}
      />
      </section>
      <div className="oq-bottom-grid">
        <section className="oq-card">
          <div className="oq-dashboard-card-title"><h2><CalendarDays size={21}/>Task Status</h2></div>
          {taskStats.total ? (
            <Suspense fallback={<div className="oq-chart-skeleton" aria-label="Loading chart"/>}><TaskStatusChart stats={taskStats}/></Suspense>
          ) : (
            <EmptyState
              title="No assigned work yet"
              description="Assigned tasks and personal to-dos will appear here."
            />
          )}
        </section>
        <section className="oq-card">
          <div className="oq-dashboard-card-title"><h2><CalendarDays size={21}/>Upcoming Tasks</h2><Link to="/tasks">View all <ArrowRight size={14}/></Link></div>
          {upcoming
            .slice(0, 4)
            .map((r) => (
              <div className="oq-upcoming" key={r.id}>
                <span>
                  <Clock3 size={18} />
                </span>
                <div>
                  <strong>{r.title}</strong>
                  <small>
                    {r.financialYear} · {String(r.dueDate)}
                  </small>
                </div>
                <StatusBadge value={r.priority} />
              </div>
            ))}
          {!upcoming.length ? (
            <EmptyState
              title="No upcoming deadlines"
              description="Task deadlines will appear here."
            />
          ) : null}
        </section>
        <section className="oq-card">
          <div className="oq-dashboard-card-title"><h2><Bot size={22}/>Recent BOT Activity</h2><Link to="/bots/extract">View all <ArrowRight size={14}/></Link></div>
          {d.jobs.length ? (
            d.jobs.slice(0, 4).map((j) => (
              <div className="oq-timeline" key={j.id}>
                <i />
                <div>
                  <strong>{j.name}</strong>
                  <p>{j.stage}</p>
                  <small>{date(j.updatedAt)}</small>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="No activity yet"
              description="Actual BOT executions are tracked here."
            />
          )}
        </section>
      </div>
    </motion.div>
  );
}
function UsersPage() {
  const q = useData<{ users: User[] }>("/platform/users"),
    teams = useData<{ teams: Doc[] }>("/platform/teams"),
    departments = useData<{ departments: Doc[] }>("/platform/departments"),
    client = useQueryClient(),
    [create, setCreate] = useState(false),
    [edit, setEdit] = useState<User | null>(null),
    [role, setRole] = useState(""),
    [status, setStatus] = useState(""),
    [team, setTeam] = useState(""),
    [dept, setDept] = useState(""),
    [link, setLink] = useState("");
  const mutate = useMutation({
    mutationFn: (values: any) =>
      edit
        ? api(`/platform/users/${edit.id}`, {
            method: "PATCH",
            body: JSON.stringify(values),
          })
        : post<any>("/platform/users", values),
    onSuccess: (r) => {
      toast.success(edit ? "User updated" : "User created");
      if ((r as any).setupLink) setLink((r as any).setupLink);
      setCreate(false);
      setEdit(null);
      void client.invalidateQueries();
    },
  });
  const change = useMutation({
    mutationFn: ({ u, active }: { u: User; active: boolean }) =>
      api(`/platform/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      toast.success("Account status updated");
      void client.invalidateQueries();
    },
  });
  const reset = useMutation({
    mutationFn: (id: string) =>
      post<{ setupLink: string }>(`/platform/users/${id}/reset-link`),
    onSuccess: (r) => setLink(r.setupLink),
  });
  const options = (items: Doc[] | undefined) =>
    items?.map((t) => ({ value: t.id, label: t.name })) ?? [];
  const fields: Field[] = [
    { name: "name", label: "Full Name", required: true },
    { name: "email", label: "Email Address", type: "email", required: true },
    { name: "mobile", label: "Mobile Number", required: true },
    { name: "username", label: "Username", required: true },
    {
      name: "teamId",
      label: "Team",
      type: "select",
      required: true,
      options: options(teams.data?.teams),
    },
    {
      name: "department",
      label: "Department",
      type: "select",
      required: true,
      options:
        departments.data?.departments.map((d) => ({
          value: d.name,
          label: d.name,
        })) ?? [],
    },
    {
      name: "role",
      label: "Role",
      type: "select",
      required: true,
      options: ["executive", "intern", "manager", "admin", "super_admin"].map(
        (r) => ({ value: r, label: roleLabel(r) }),
      ),
    },
    {
      name: "reportingManagerId",
      label: "Reporting Manager",
      type: "select",
      options:
        q.data?.users
          .filter((u) => u.permissions.includes("approvals.review"))
          .map((u) => ({ value: u.id, label: u.name })) ?? [],
    },
    {
      name: "active",
      label: "Active Account",
      type: "checkbox",
      defaultValue: true,
    },
  ].map((f) => ({
    ...f,
    defaultValue: edit ? (edit as any)[f.name] : f.defaultValue,
  })) as Field[];
  const users = q.data?.users ?? [],
    filtered = users.filter(
      (u) =>
        (!role || u.role === role) &&
        (!status || String(u.active) === status) &&
        (!team || u.teamId === team) &&
        (!dept || u.department === dept),
    );
  return (
    <>
      <PageHeader
        title="User Management"
        subtitle="Create and manage users, teams, departments, roles, and account status."
        actions={
          <>
            <Link className="oq-button secondary" to="/admin/teams">
              <Plus size={17} />
              Create Team
            </Link>
            <Button onClick={() => setCreate(true)}>
              <Plus size={17} />
              Create User
            </Button>
          </>
        }
      />
      <div className="oq-metrics">
        <MetricCard label="Total Users" value={users.length} icon={<Users />} />
        <MetricCard
          label="Active Users"
          value={users.filter((u) => u.active).length}
          icon={<UserRound />}
          color="green"
        />
        <MetricCard
          label="Inactive Users"
          value={users.filter((u) => !u.active).length}
          icon={<UserRound />}
          color="amber"
        />
        <MetricCard
          label="Total Teams"
          value={teams.data?.teams.length ?? 0}
          icon={<FolderKanban />}
          color="purple"
        />
      </div>
      <div className="oq-filter-panel">
        <select
          aria-label="Role filter"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">All Roles</option>
          {["super_admin", "admin", "manager", "executive", "intern"].map(
            (r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ),
          )}
        </select>
        <select
          aria-label="Department filter"
          value={dept}
          onChange={(e) => setDept(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.data?.departments.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select
          aria-label="Team filter"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        >
          <option value="">All Teams</option>
          {teams.data?.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          onClick={() => {
            setRole("");
            setStatus("");
            setTeam("");
            setDept("");
          }}
        >
          Reset filters
        </Button>
      </div>
      <DataTable
        rows={filtered}
        loading={q.isPending}
        error={q.error ?? change.error ?? reset.error}
        columns={[
          {
            key: "name",
            label: "User Name / Email",
            render: (u) => (
              <div className="oq-person">
                <span>{u.name[0]}</span>
                <div>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </div>
              </div>
            ),
          },
          {
            key: "teamId",
            label: "Team",
            render: (u) =>
              teams.data?.teams.find((t) => t.id === u.teamId)?.name ?? "—",
          },
          { key: "department", label: "Department" },
          { key: "role", label: "Role", render: (u) => roleLabel(u.role) },
          {
            key: "active",
            label: "Status",
            render: (u) => (
              <StatusBadge value={u.active ? "Active" : "Inactive"} />
            ),
          },
          {
            key: "reportingManagerId",
            label: "Reporting Manager",
            render: (u) =>
              users.find((m) => m.id === u.reportingManagerId)?.name ?? "—",
          },
          {
            key: "actions",
            label: "Actions",
            render: (u) => (
              <div className="oq-row-actions">
                <BlobButton
                  onClick={() => {
                    setEdit(u);
                    setCreate(true);
                  }}
                >
                  Edit
                </BlobButton>
                <BlobButton onClick={() => change.mutate({ u, active: !u.active })}>
                  {u.active ? "Deactivate" : "Activate"}
                </BlobButton>
                <BlobButton onClick={() => reset.mutate(u.id)}>Reset link</BlobButton>
              </div>
            ),
          },
        ]}
      />
      {create ? (
        <FormDialog
          key={edit?.id ?? "new"}
          title={edit ? "Edit User" : "Create User"}
          open
          onClose={() => {
            setCreate(false);
            setEdit(null);
          }}
          fields={fields}
          onSubmit={(v) => mutate.mutate(v)}
          pending={mutate.isPending}
          error={mutate.error}
          extra={
            <div className="oq-info">
              <LockKeyhole size={17} />A one-time password setup link is
              generated. Plaintext passwords are never emailed.
            </div>
          }
        />
      ) : null}
      <ConfirmationDialog
        open={!!link}
        onClose={() => setLink("")}
        title="One-time account setup link"
      >
        <p>
          Share this link securely with the intended employee. It expires and
          can be used only once. An email has not been sent automatically.
        </p>
        <input readOnly value={link} aria-label="Password setup link" />
        <Button
          onClick={() =>
            void navigator.clipboard
              .writeText(link)
              .then(() => toast.success("Setup link copied"))
          }
        >
          Copy setup link
        </Button>
      </ConfirmationDialog>
    </>
  );
}
function TeamsPage() {
  const q = useData<{ teams: Doc[] }>("/platform/teams"),
    users = useData<{ users: User[] }>("/platform/users"),
    departments = useData<{ departments: Doc[] }>("/platform/departments"),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Doc | null>(null),
    client = useQueryClient();
  const save = useMutation({
    mutationFn: (values: any) =>
      editing
        ? api(`/platform/teams/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...values, version: editing.version }),
          })
        : post("/platform/teams", values),
    onSuccess: () => {
      toast.success("Team saved");
      setOpen(false);
      setEditing(null);
      void client.invalidateQueries();
    },
  });
  const fields: Field[] = [
    { name: "name", label: "Team Name", required: true },
    { name: "code", label: "Team Code", required: true },
    {
      name: "department",
      label: "Department",
      type: "select",
      required: true,
      options:
        departments.data?.departments.map((d) => ({
          value: d.name,
          label: d.name,
        })) ?? [],
    },
    {
      name: "leadId",
      label: "Team Lead",
      type: "select",
      options:
        users.data?.users
          .filter(
            (u) =>
              u.role === "manager" ||
              u.role === "admin" ||
              u.role === "super_admin",
          )
          .map((u) => ({ value: u.id, label: u.name })) ?? [],
    },
    {
      name: "capacity",
      label: "Member Capacity",
      type: "number",
      defaultValue: 100,
    },
    {
      name: "defaultRole",
      label: "Default Role",
      type: "select",
      defaultValue: "executive",
      options: ["executive", "intern", "manager"].map((r) => ({
        value: r,
        label: roleLabel(r),
      })),
    },
    {
      name: "color",
      label: "Team Color",
      type: "color",
      defaultValue: "#075CF5",
    },
    {
      name: "visibility",
      label: "Visibility",
      type: "select",
      defaultValue: "team",
      options: [
        { value: "team", label: "Team" },
        { value: "management", label: "Management" },
      ],
    },
    { name: "active", label: "Active Team", type: "checkbox" },
    { name: "reporting", label: "Team-level Reporting", type: "checkbox" },
    { name: "description", label: "Description", type: "textarea" },
  ].map((f) => ({
    ...f,
    defaultValue: editing ? editing[f.name] : f.defaultValue,
  })) as Field[];
  return (
    <>
      <PageHeader
        title="Team Management"
        subtitle="Organize operations, assign team leads and keep reporting relationships clear."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={17} />
            Create Team
          </Button>
        }
      />
      <DataTable
        rows={q.data?.teams ?? []}
        loading={q.isPending}
        error={q.error}
        columns={[
          { key: "name", label: "Team Name" },
          { key: "code", label: "Team Code" },
          { key: "department", label: "Department" },
          {
            key: "leadId",
            label: "Team Lead",
            render: (t) =>
              users.data?.users.find((u) => u.id === t.leadId)?.name ?? "—",
          },
          { key: "capacity", label: "Capacity" },
          {
            key: "active",
            label: "Status",
            render: (t) => (
              <StatusBadge value={t.active ? "Active" : "Inactive"} />
            ),
          },
          {
            key: "actions",
            label: "Actions",
            render: (t) => (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(t);
                  setOpen(true);
                }}
              >
                Edit team
              </Button>
            ),
          },
        ]}
      />
      {open ? (
        <FormDialog
          key={editing?.id ?? "new"}
          title={editing ? "Edit Team" : "Create Team"}
          open
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          fields={fields}
          onSubmit={(v) => save.mutate(v)}
          pending={save.isPending}
          error={save.error}
        />
      ) : null}
    </>
  );
}
function DepartmentsPage() {
  const q = useData<{ departments: Doc[] }>("/platform/departments"),
    [open, setOpen] = useState(false),
    client = useQueryClient();
  const save = useMutation({
    mutationFn: (v: any) => post("/platform/departments", v),
    onSuccess: () => {
      toast.success("Department created");
      setOpen(false);
      void client.invalidateQueries();
    },
  });
  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="Maintain the departments used by your teams and employees."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={17} />
            Create Department
          </Button>
        }
      />
      <DataTable
        rows={q.data?.departments ?? []}
        loading={q.isPending}
        error={q.error}
        columns={[
          { key: "name", label: "Department" },
          { key: "code", label: "Code" },
        ]}
      />
      {open ? (
        <FormDialog
          open
          onClose={() => setOpen(false)}
          title="Create Department"
          fields={[
            { name: "name", label: "Department Name", required: true },
            { name: "code", label: "Code", required: true },
          ]}
          onSubmit={(v) => save.mutate(v)}
          pending={save.isPending}
          error={save.error}
        />
      ) : null}
    </>
  );
}
function RolesPage() {
  const q = useData<{
    roles: { id: string; name: string; permissions: string[] }[];
  }>("/platform/roles");
  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Server-enforced capabilities for each built-in role. User-level grants can be managed through the authorized API."
      />
      <div className="oq-role-grid">
        {q.data?.roles.map((r) => (
          <section className="oq-card" key={r.id}>
            <ShieldCheck className="oq-blue" />
            <h2>{roleLabel(r.id)}</h2>
            <ul>
              {r.permissions.map((p) => (
                <li key={p}>
                  <Check size={14} />
                  {p}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <ErrorAlert error={q.error} />
    </>
  );
}
function AllocationPage() {
  const [imported,setImported]=useState<Doc|null>(null);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<Doc | null>(null),
    [corrections, setCorrections] = useState<Record<number, string>>({}),
    [confirm, setConfirm] = useState(false),
    client = useQueryClient(),
    employees = useData<{ users: User[] }>("/platform/users"),
    history = useData<{ imports: Doc[] }>("/platform/allocation/history");
  const validate = useMutation({
      mutationFn: () => {
        const f = new FormData();
        f.append("file", file!);
        return api<{ preview: Doc }>("/platform/allocation/preview", {
          method: "POST",
          body: f,
        });
      },
      onSuccess: (r) => { setPreview(r.preview); setCorrections({}); setConfirm(false); void client.invalidateQueries(); },
    }),
    revalidate = useMutation({
      mutationFn: () => post<{preview:Doc}>(`/platform/allocation/${preview!.id}/revalidate`, {
        overrides: Object.entries(corrections).map(([row,email])=>({row:Number(row),email})),
      }),
      onSuccess: (r) => { setPreview(r.preview); setCorrections({}); setConfirm(false); void client.invalidateQueries(); toast.success("Preview revalidated. Review rows, then Import assignments."); },
    }),
    commit = useMutation({
      mutationFn: (validOnly: boolean = false) =>
        post<{import:Doc}>(`/platform/allocation/${preview!.id}/commit`, {
          confirmReassign: confirm,
          validOnly,
        }),
      onSuccess: (r) => {
        setImported(r.import);
        toast.success(r.import.pendingRows ? `${r.import.importedRows} assignments imported; ${r.import.pendingRows} rows pending correction` : "Client assignments imported");
        setPreview(null);
        setFile(null);
        void client.invalidateQueries();
      },
    });
  return (
    <>
      <PageHeader
        title="Client Allocation"
        subtitle="Upload a master file to assign clients and CPCB IDs to existing employees."
        actions={
          <a
            className="oq-button secondary"
            href="/api/platform/allocation/template"
          >
            <Download size={17} />
            Download Template
          </a>
        }
      />
      <ol className="oq-import-stages" aria-label="Allocation import stages">
        {['Upload','Validate','Import'].map((name,i)=><li key={name} aria-current={(!preview&&!imported?0:preview?1:2)===i?'step':undefined}><span>{i+1}</span><div><strong>{name}</strong><small>{i===0?'Select master Excel':i===1?'Review rows and ownership':'Save approved assignments'}</small></div></li>)}
      </ol>
      {imported&&!preview?<div className="oq-import-result" role="status"><CheckCheck size={22}/><div><strong>{imported.importedRows ?? imported.total} assignments imported</strong><p>The confirmed assignments are now available in authorized client lists. {imported.pendingRows ? `${imported.pendingRows} rows remain pending. Use Review pending rows in history to correct them.` : ''}</p></div><Link className="oq-button secondary" to="/clients">View clients</Link></div>:null}
      <div className="oq-two-columns">
        <section className="oq-card">
          <h2>Upload Client Allocation Excel</h2>
          <p>Preview and validate before any assignment changes are applied.</p>
          <p><strong>Upload → Preview & Validate → Import assignments.</strong> Clients appear for employees and administrators only after the final Import succeeds.</p>
          <label
            className="oq-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setFile(e.dataTransfer.files[0] ?? null);
              setPreview(null);
            }}
          >
            <CloudUpload size={37} />
            <strong>
              {file ? file.name : "Drag & drop your Excel file here"}
            </strong>
            <span>
              {file
                ? `${(file.size / 1024).toFixed(1)} KB`
                : "or click to browse · XLSX only"}
            </span>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </label>
          <div className="oq-actions">
            <Button
              disabled={!file || validate.isPending}
              onClick={() => validate.mutate()}
            >
              {validate.isPending ? (
                <LoaderCircle className="oq-spin" size={16} />
              ) : (
                <FileCheck2 size={16} />
              )}
              Preview & Validate
            </Button>
            {file ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
              >
                Remove file
              </Button>
            ) : null}
          </div>
        </section>
        <section className="oq-card">
          <h2>Excel Format Guide</h2>
          <p>Employees are matched by unique email, never by name.</p>
          <div className="oq-format-table">
            {[
              "Client Name *",
              "CPCB ID *",
              "User Email *",
              "Client Code",
              "Financial Year",
              "Priority",
              "Due Date",
            ].map((v) => (
              <div key={v}>
                <FileSpreadsheet size={15} />
                {v}
              </div>
            ))}
          </div>
          <div className="oq-info">
            <ShieldCheck size={18} />
            Reassignments require an explicit impact review. Re-importing a
            committed batch does not duplicate assignments.
          </div>
        </section>
      </div>
      <ErrorAlert error={validate.error ?? revalidate.error ?? commit.error ?? employees.error} />
      {preview ? (
        <>
          <section className="oq-card">
            <h2>Step 2: Review employee assignments</h2>
            <p>This preview has not assigned clients yet. If an employee was created after upload, click Revalidate preview.</p>
            <p>Correct each row's employee below, then revalidate. Assignments are saved only when Import succeeds.</p>
            <Button onClick={()=>revalidate.mutate()} disabled={revalidate.isPending || commit.isPending}>Revalidate preview</Button>
          </section>
          <div className="oq-metrics">
            <MetricCard
              label="Total Rows"
              value={preview.total}
              icon={<FileSpreadsheet />}
            />
            <MetricCard
              label="Valid Rows"
              value={preview.valid}
              color="green"
              icon={<Check />}
            />
            <MetricCard
              label="Errors"
              value={preview.errors}
              color="red"
              icon={<X />}
            />
            <MetricCard
              label="Reassignments"
              value={preview.reassignments}
              color="amber"
              icon={<Users />}
            />
          </div>
          <DataTable
            rows={preview.rows}
            columns={[
              { key: "row", label: "Excel Row" },
              { key: "clientName", label: "Client" },
              { key: "cpcbId", label: "CPCB ID" },
              { key: "email", label: "Assign to employee", render: (r:any) => <label>
                <span>{r.email}</span>
                <select aria-label={`Employee for Excel row ${r.row}`} value={corrections[r.row] ?? r.email} onChange={e=>setCorrections(old=>({...old,[r.row]:e.target.value}))}>
                  {!employees.data?.users.some(u=>u.email===r.email && u.active!==false) ? <option value={r.email}>{r.email} (not an active user)</option> : null}
                  {employees.data?.users.filter(u=>u.active!==false).map(u=><option key={u.id} value={u.email}>{u.name} — {u.email}</option>)}
                </select>
              </label> },
              { key: "financialYear", label: "FY" },
              {
                key: "issues",
                label: "Validation",
                render: (r: any) =>
                  r.issues.length ? (
                    <span className="oq-field-error">
                      {r.issues.join("; ")}
                    </span>
                  ) : (
                    <StatusBadge
                      value={r.reassign ? "Ownership change" : "Valid"}
                    />
                  ),
              },
            ]}
          />
          {preview.reassignments ? (
            <label className="oq-check-label">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              I reviewed and approve the displayed client reassignments.
            </label>
          ) : null}
          <div className="oq-actions">
            {preview.errors > 0 ? <div role="status"><p>{preview.valid} valid rows can be imported. {preview.errors} rows have errors and will remain pending for correction.</p><Button disabled={!preview.valid || commit.isPending || revalidate.isPending || Object.keys(corrections).length > 0 || (!!preview.reassignments && !confirm)} onClick={()=>commit.mutate(true)}>Import {preview.valid} valid assignments; keep {preview.errors} pending</Button></div> : null}
            <Button
              disabled={
                commit.isPending ||
                revalidate.isPending || Object.keys(corrections).length > 0 ||
                preview.errors > 0 ||
                (!!preview.reassignments && !confirm)
              }
              onClick={() => commit.mutate(false)}
            >
              Import {preview.valid} assignments
            </Button>
          </div>
        </>
      ) : null}
      <div className="oq-section-title">
        <h2>Import History</h2>
      </div>
      <DataTable
        rows={history.data?.imports ?? []}
        columns={[
          { key: "fileName", label: "File" },
          {
            key: "createdAt",
            label: "Imported",
            render: (r) => date(r.createdAt),
          },
          { key: "total", label: "Rows" },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge value={r.status} />,
          },
          { key: "valid", label: "Valid rows" },
          { key: "errors", label: "Errors" },
          { key: "importedRows", label: "Imported rows", render: r => r.importedRows ?? (r.status === 'COMMITTED' ? r.total : 0) },
          { key: "resume", label: "Review", render: (r) => r.status === "PARTIALLY_COMMITTED" ? <Button variant="secondary" disabled={revalidate.isPending} onClick={async()=>{try{const result=await post<{preview:Doc}>(`/platform/allocation/${r.id}/revalidate`,{overrides:[]});setPreview(result.preview);setCorrections({});setConfirm(false);void client.invalidateQueries();}catch(error){toast.error(error instanceof Error?error.message:'Could not load pending rows');}}}>Review pending rows</Button> : r.status === "PREVIEW" ? <Button variant="secondary" onClick={()=>{setPreview(r);setCorrections({});setConfirm(false);}}>Resume preview</Button> : <span>Imported</span> },
        ]}
      />
    </>
  );
}
function ClientsPage({ user }: { user: User }) {
  const d = useData<Dashboard>("/platform/dashboard"),
    [selected, setSelected] = useState<AssignmentView | null>(null),
    [params] = useSearchParams(),
    search = params.get("q")?.toLowerCase() ?? "";
  return (
    <>
      <PageHeader
        title={
          user.permissions.includes("clients.view.all")
            ? "Clients"
            : "My Clients"
        }
        subtitle="Authorized client, CPCB ID and financial-year assignments."
        actions={
          user.permissions.includes("clients.allocate") ? (
            <Link className="oq-button primary" to="/admin/client-allocation">
              <Plus size={17} />
              Allocate Clients
            </Link>
          ) : undefined
        }
      />
      <DataTable
        rows={
          d.data?.rows.filter((r) =>
            JSON.stringify(r).toLowerCase().includes(search),
          ) ?? []
        }
        loading={d.isPending}
        error={d.error}
        columns={[
          { key: "client", label: "Client", render: (r) => <Link to={`/dashboard?assignment=${r.id}`}>{r.client?.name}</Link> },
          {
            key: "account",
            label: "CPCB ID",
            render: (r) => r.account?.cpcbId,
          },
          { key: "financialYear", label: "Financial Year" },
          { key: "employee", label: "Assigned To" },
          {
            key: "priority",
            label: "Priority",
            render: (r) => <StatusBadge value={r.priority} />,
          },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge value={r.workflow?.businessStatus} />,
          },
        ]}
      />
    </>
  );
}
function AccountsPage({ user }: { user: User }) {
  const q = useData<{ accounts: Doc[] }>("/platform/accounts"),
    [selected, setSelected] = useState<Doc | null>(null),
    client = useQueryClient();
  const save = useMutation({
    mutationFn: (input: any) =>
      api(`/platform/accounts/${selected!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...input, version: selected!.version }),
      }),
    onSuccess: () => {
      toast.success("Account identity updated");
      setSelected(null);
      void client.invalidateQueries();
    },
  });
  return (
    <>
      <PageHeader
        title="CPCB IDs"
        subtitle="Account identities are separate from platform users. Portal credentials are supplied only to isolated sessions."
      />
      <DataTable
        rows={q.data?.accounts ?? []}
        loading={q.isPending}
        error={q.error}
        columns={[
          { key: "label", label: "Client" },
          { key: "cpcbId", label: "CPCB ID" },
          { key: "applicationId", label: "Verified Application ID" },
          {
            key: "active",
            label: "Status",
            render: (r) => (
              <StatusBadge value={r.active ? "Active" : "Inactive"} />
            ),
          },
          {
            key: "actions",
            label: "Actions",
            render: (r) =>
              user.permissions.includes("clients.allocate") ? (
                <Button variant="ghost" onClick={() => setSelected(r)}>
                  Set identity
                </Button>
              ) : (
                <Link to="/bots/extract">Open ExtractBot</Link>
              ),
          },
        ]}
      />
      {selected ? (
        <FormDialog
          open
          title="Set Account Identity"
          onClose={() => setSelected(null)}
          fields={[
            {
              name: "applicationId",
              label: "Expected portal Application ID",
              required: true,
            },
          ]}
          onSubmit={(v) => save.mutate(v)}
          error={save.error}
          pending={save.isPending}
        />
      ) : null}
    </>
  );
}
