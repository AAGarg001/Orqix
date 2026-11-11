import { SubscriptionModeBar } from "./SubscriptionStatus";
import { lazy, Suspense, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building2,
  FileCheck2,
  Workflow,
  Users,
  Bot,
  Files,
  ShieldCheck,
  CreditCard,
  Receipt,
  LifeBuoy,
  Sparkles,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  Eye,
  EyeOff,
  LockKeyhole,
  ArrowRight,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { api, post } from "../api";
import {
  Button,
  ErrorAlert,
  SkeletonLoader,
  EmptyState,
  ConfirmationDialog,
} from "../orqix/ui";
import {
  RouteSurface,
  useDrawerFocus,
  useDismissableLayer,
} from "../orqix/experience";
import type { Session } from "../orqix/types";
import {
  ClientDashboard,
  Accounts,
  Registrations,
  WorkProgress,
  Spocs,
  Documents,
  Approvals,
  Activity,
  Support,
  ClientAssistant,
  ClientSettings,
  Services,
  Automation,
  Subscriptions,
  Plans,
  Checkout,
  Billing,
  PaymentResult,
} from "./pages";
import "./client.css";
import { clientQuery } from "./hooks";
import {
  Bell,
  Search,
  ChevronDown,
  Layers,
  Award,
  CalendarDays,
  ShoppingCart,
  ClipboardList,
  Scale,
  Hexagon,
} from "lucide-react";
import "../axis/business.css";
const BusinessPage = lazy(() =>
  import("../axis/BusinessPages").then((m) => ({ default: m.BusinessPage })),
);

const menu = [
  ["/client/dashboard", "Business Dashboard", LayoutDashboard],
  ["/client/companies", "My Companies & Units", Building2],
  ["/client/certificates", "Certificate Inventory", Award],
  ["/client/expiry", "Expiry Monitoring", CalendarDays],
  ["/client/procurement", "Procurement", ShoppingCart],
  ["/client/reconciliation", "Reconciliation", Scale],
  ["/client/my-spoc", "SPOC & Advisory", Users],
  ["/client/reports", "Reports", FileCheck2],
  ["/client/notifications", "Notifications", Bell],
  ["/client/subscriptions", "Subscription", Layers],
  ["/client/settings", "Settings", Settings],
] as const;
const navigationGroups = [
  { label: "Overview", paths: ["/client/dashboard", "/client/companies"] },
  {
    label: "EPR Operations",
    paths: [
      "/client/certificates",
      "/client/expiry",
      "/client/procurement",
      "/client/reconciliation",
    ],
  },
  { label: "Work & Advisory", paths: ["/client/my-spoc"] },
  {
    label: "Insights & Account",
    paths: [
      "/client/reports",
      "/client/notifications",
      "/client/subscriptions",
      "/client/settings",
    ],
  },
];
export function ClientApp({
  session,
  onAuthenticated,
}: {
  session: Session;
  onAuthenticated: () => void;
}) {
  if (!session.user)
    return (
      <Routes>
        <Route
          path="login"
          element={<ClientLogin onAuthenticated={onAuthenticated} />}
        />
        <Route path="*" element={<Navigate to="/client/login" replace />} />
      </Routes>
    );
  if (session.user.accountKind !== "client")
    return (
      <div className="oq-setup">
        <EmptyState
          title="Client identity required"
          description="Internal staff manage organizations from their management workspace."
        />
        <Link className="oq-button" to="/dashboard">
          Open internal workspace
        </Link>
      </div>
    );
  return <ClientShell session={session} />;
}
function ClientLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [show, setShow] = useState(false),
    [help, setHelp] = useState(false),
    navigate = useNavigate();
  const login = useMutation({
    mutationFn: (data: Record<string, FormDataEntryValue>) =>
      post("/auth/login", { ...data, portal: "client" }),
    onSuccess: () => {
      onAuthenticated();
      navigate("/client/dashboard");
    },
  });
  return (
    <main className="oq-login client-login">
      <header>
        <img
          className="oq-company-logo"
          src="/aa-garg-logo.svg"
          alt="A A Garg & Co"
        />
        <Link to="/login">
          Employee access <ArrowRight size={14} />
        </Link>
      </header>
      <section className="client-login-grid">
        <div className="oq-login-card">
          <span className="client-eyebrow">ORQIX · Client workspace</span>
          <h1>Welcome back.</h1>
          <p>
            Your organization, compliance progress and dedicated team in one
            secure workspace.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate(Object.fromEntries(new FormData(e.currentTarget)));
            }}
          >
            <label>
              Email address
              <input
                required
                type="email"
                name="email"
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <div className="client-password">
                <input
                  required
                  type={show ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow((v) => !v)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <div className="client-login-options">
              <label className="oq-check-label">
                <input type="checkbox" name="remember" />
                Remember me
              </label>
              <button type="button" onClick={() => setHelp(true)}>
                Forgot password?
              </button>
            </div>
            <ErrorAlert error={login.error} />
            <Button disabled={login.isPending}>
              <LockKeyhole size={17} />
              {login.isPending ? "Signing in…" : "Secure client login"}
            </Button>
          </form>
          <p className="client-muted">
            Access is provided through an authorized organization invitation.
          </p>
        </div>
        <aside className="client-login-story">
          <span>ORQIX</span>
          <h2>
            One workspace.
            <br />A clearer path to compliance.
          </h2>
          <p>
            Track your CPCB accounts, work with your SPOC, review evidence and
            manage your services.
          </p>
          <div>
            {[
              "Organization-isolated access",
              "Real workflow visibility",
              "Controlled approvals",
            ].map((t) => (
              <p key={t}>
                <ShieldCheck size={18} />
                {t}
              </p>
            ))}
          </div>
        </aside>
      </section>
      <ConfirmationDialog
        open={help}
        onClose={() => setHelp(false)}
        title="Reset client password"
        description="Ask an authorized platform administrator for a secure one-time setup link. No plaintext password is sent."
      >
        <Button onClick={() => setHelp(false)}>Understood</Button>
      </ConfirmationDialog>
    </main>
  );
}
function ClientShell({ session }: { session: Session }) {
  const context = clientQuery<any>("/client/context"),
    [collapsed, setCollapsed] = useState(false),
    [drawer, setDrawer] = useState(false),
    [profile, setProfile] = useState(false),
    [search, setSearch] = useState(""),
    location = useLocation(),
    navigate = useNavigate(),
    query = useQueryClient(),
    refs = useDrawerFocus(drawer, () => setDrawer(false)),
    profileRef = useDismissableLayer(profile, () => setProfile(false));
  const notices = clientQuery<any>(
    "/client/axis/notifications",
    !!context.data?.activeTenantId || context.data?.memberships?.length === 1,
  );
  const switchOrg = useMutation({
    mutationFn: (tenantId: string) =>
      post("/client/switch-organization", { tenantId }),
    onSuccess: () => {
      query.clear();
      window.location.assign("/client/dashboard");
    },
  });
  const logout = useMutation({
    mutationFn: () => post("/auth/logout"),
    onSuccess: () => {
      query.clear();
      window.location.assign("/client/login");
    },
  });
  if (context.isPending)
    return (
      <div className="oq-setup">
        <SkeletonLoader />
      </div>
    );
  if (context.error)
    return (
      <div className="oq-setup">
        <ErrorAlert error={context.error} />
        <Button onClick={() => logout.mutate()}>Sign out</Button>
      </div>
    );
  const active = context.data.memberships.find(
      (m: any) => m.tenantId === context.data.activeTenantId,
    ),
    billingAllowed =
      active && ["client_owner", "client_admin"].includes(active.role);
  if (!active)
    return (
      <div className="oq-setup">
        <section className="oq-card">
          <h1>Select your organization</h1>
          {context.data.memberships.map((m: any) => (
            <Button
              key={m.id}
              disabled={switchOrg.isPending}
              onClick={() => switchOrg.mutate(m.tenantId)}
            >
              {m.name}
              <ArrowRight size={16} />
            </Button>
          ))}
          <ErrorAlert error={switchOrg.error} />
          <Button variant="ghost" onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </section>
      </div>
    );
  const selected = menu
    .filter(([path]) => location.pathname.startsWith(path))
    .sort((a, b) => b[0].length - a[0].length)[0];
  const unread =
    notices.data?.notifications.filter(
      (n: any) => !n.readBy.includes(session.user!.id),
    ).length ?? 0;
  const business = (page: string) => (
    <Suspense fallback={<SkeletonLoader />}>
      <BusinessPage page={page} role={active.role} user={session.user!} />
    </Suspense>
  );
  return (
    <div
      className={`oq-app client-app business-client ${collapsed ? "oq-sidebar-collapsed" : ""}`}
    >
      <a className="oq-skip-link" href="#client-main">
        Skip to content
      </a>
      <aside
        ref={refs.sidebar}
        id="client-sidebar"
        className={`oq-sidebar ${drawer ? "open" : ""}`}
        aria-label="Client navigation"
      >
        <div className="oq-sidebar-heading">
          <Link to="/client/dashboard" className="ab-brand">
            <svg width="38" height="40" viewBox="0 0 40 44" aria-hidden="true">
              <path fill="#73d3ff" d="M20 1 37 11 20 21 3 11Z" />
              <path fill="#1592f6" d="M3 11 20 21 20 42 3 32Z" />
              <path fill="#d0efff" d="M37 11 20 21 20 42 37 32Z" />
              <path fill="#0744b1" d="M20 12 28 17 28 27 20 32 12 27 12 17Z" />
            </svg>
            <strong>ORQIX</strong>
          </Link>
          <button
            className="oq-sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        </div>
        <button
          className="oq-mobile-close"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        >
          <X />
        </button>
        <nav>
          {navigationGroups.map((group) => (
            <section
              className="ab-nav-group"
              key={group.label}
              aria-label={group.label}
            >
              <h2>{group.label}</h2>
              {menu
                .filter(([path]) => group.paths.includes(path))
                .map(([path, label, Icon]) => (
                  <Link
                    key={path}
                    to={path}
                    aria-label={label}
                    title={label}
                    className={
                      location.pathname.startsWith(path) ? "active" : ""
                    }
                    onClick={() => setDrawer(false)}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </Link>
                ))}
            </section>
          ))}
        </nav>
        <div className="client-tenant-caption">
          <Building2 size={27} />
          <strong>{active.name}</strong>Client Account
        </div>
      </aside>
      {drawer ? (
        <button
          className="oq-drawer-backdrop"
          aria-label="Close navigation backdrop"
          onClick={() => setDrawer(false)}
        />
      ) : null}
      <div className="oq-main" ref={refs.content}>
        <header className="oq-navbar">
          <button
            className="oq-nav-toggle"
            aria-label="Open navigation"
            onClick={() => setDrawer(true)}
          >
            <Menu size={21} />
          </button>
          <div className="oq-breadcrumb">
            Client Portal
            <ChevronRight size={14} />
            <strong>{selected?.[1] ?? "Workspace"}</strong>
          </div>
          <form
            className="ab-global-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/client/certificates?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={18} />
            <input
              aria-label="Search client portal"
              placeholder="Search certificate ID or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <div className="client-navbar-right">
            <Link
              to="/client/notifications"
              className="ab-navbar-notice"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              <Bell size={22} />
              {unread ? <i /> : null}
            </Link>
            <div className="ab-nav-profile" ref={profileRef}>
              <button
                className="client-identity"
                aria-label="Client profile menu"
                aria-expanded={profile}
                onClick={() => setProfile((v) => !v)}
              >
                <span>
                  {session
                    .user!.name.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <ChevronDown size={15} />
              </button>
              {profile ? (
                <div className="ab-profile-menu">
                  <strong>{session.user!.name}</strong>
                  <small>{session.user!.email}</small>
                  <Link to="/client/settings" onClick={() => setProfile(false)}>
                    <Settings size={16} />
                    My profile & settings
                  </Link>
                  <button onClick={() => logout.mutate()}>
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
            {context.data.memberships.length > 1 ? (
              <select
                aria-label="Active organization"
                value={active.tenantId}
                disabled={switchOrg.isPending}
                onChange={(e) => switchOrg.mutate(e.target.value)}
              >
                {context.data.memberships.map((m: any) => (
                  <option value={m.tenantId} key={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </header>
        <SubscriptionModeBar />
        <main className="oq-content" id="client-main" tabIndex={-1}>
          <ErrorAlert error={switchOrg.error} />
          <RouteSurface>
            <Routes>
              <Route
                path="login"
                element={<Navigate to="/client/dashboard" replace />}
              />
              <Route
                index
                element={<Navigate to="/client/dashboard" replace />}
              />
              <Route path="dashboard" element={business("dashboard")} />
              <Route path="companies" element={business("companies")} />
              <Route path="certificates" element={business("certificates")} />
              <Route path="expiry" element={business("expiry")} />
              <Route path="procurement" element={business("procurement")} />
              <Route path="reconciliation" element={business("quality")} />
              <Route path="actions" element={<Navigate to="/client/my-spoc" replace />} />
              <Route path="my-spoc" element={business("support")} />
              <Route path="support" element={business("support")} />
              <Route path="reports" element={business("reports")} />
              <Route path="notifications" element={business("notifications")} />
              <Route path="settings" element={business("settings")} />
              <Route path="subscriptions" element={business("subscription")} />
              <Route
                path="accounts"
                element={<Accounts role={active.role} />}
              />
              <Route
                path="accounts/:id"
                element={<Accounts role={active.role} detail />}
              />
              <Route
                path="cpcb-ids"
                element={<Registrations role={active.role} />}
              />
              <Route
                path="cpcb-ids/:id"
                element={<Registrations role={active.role} detail />}
              />
              <Route
                path="progress"
                element={<Navigate to="/client/companies" replace />}
              />
              <Route
                path="services"
                element={<Navigate to="/client/my-spoc" replace />}
              />
              <Route
                path="automation/*"
                element={<Navigate to="/client/my-spoc" replace />}
              />
              <Route
                path="documents"
                element={<Documents role={active.role} />}
              />
              <Route
                path="approvals"
                element={<Approvals role={active.role} />}
              />
              <Route path="subscriptions/usage" element={<Subscriptions />} />
              <Route
                path="subscriptions/plans"
                element={<Plans billingAllowed={billingAllowed} />}
              />
              <Route
                path="subscriptions/compare"
                element={<Plans billingAllowed={billingAllowed} compare />}
              />
              <Route
                path="checkout"
                element={<Checkout billingAllowed={billingAllowed} />}
              />
              <Route path="payment-success" element={<PaymentResult />} />
              <Route
                path="billing/details"
                element={<Billing billingAllowed={billingAllowed} />}
              />
              <Route path="billing/*" element={business("subscription")} />
              <Route
                path="ai-assistant"
                element={<ClientAssistant role={active.role} />}
              />
              <Route path="activity" element={<Activity />} />
              <Route path="*" element={<EmptyState title="Page not found" />} />
            </Routes>
          </RouteSurface>
          <footer className="oq-footer">
            <span>
              {active.name}
              {" \u00b7 "}Powered by ORQIX
            </span>
            <span>
              A A GARG & CO{" \u00b7 "}THINK BEYOND{" \u00b7 "}INNOVATE
              {" \u00b7 "}SIMPLIFY
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
