import { Pagination, usePagination } from "../client/Pagination";
import { CurrentSubscription } from "../client/SubscriptionStatus";
import { Children, memo, useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  LabelList,
} from "recharts";
import {
  Building2,
  Award,
  TriangleAlert,
  ShoppingCart,
  ClipboardCheck,
  FileSearch,
  Download,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Clock3,
  Bell,
  FileText,
  Users,
  MessageCircle,
  Send,
  Upload,
  Settings,
  Layers,
  CreditCard,
  CalendarDays,
  Scale,
  Search,
  Mail,
  Phone,
  Info,
  ChevronRight,
  Check,
  Eye,
  Filter,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { api, post } from "../api";
import { clientQuery, money, stamp, canManage } from "../client/hooks";
import { ClientSettings, Plans } from "../client/pages";
import {
  ConfirmationDialog,
  ErrorAlert,
  SkeletonLoader,
  EmptyState,
} from "../orqix/ui";
import type { User } from "../orqix/types";
import "./business.css";
import { TestPurchase } from "../client/TestPurchase";
import { PdfDownloadButton } from "../client/PdfDownloadButton";
type Doc = Record<string, any>;
const colors = ["#075cf5", "#00b6b0", "#8860ed", "#ffb627", "#84d8ff"];
const fmt = (v: any) =>
  typeof v === "number"
    ? v.toLocaleString("en-IN", { maximumFractionDigits: 3 })
    : (v ?? "—");
const human = (v: string) =>
  v
    ?.replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
export function ABButton({
  children,
  onClick,
  secondary = false,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`ab-button ${secondary ? "secondary" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Badge({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`ab-badge ${tone}`}>{children}</span>;
}
function sectionIcon(title: string) {
  return /procurement|supplier|quantity/i.test(title)
    ? ShoppingCart
    : /certificat|expiry/i.test(title)
      ? Award
      : /action|task|checklist/i.test(title)
        ? ClipboardCheck
        : /report|download|invoice/i.test(title)
          ? FileText
          : /company|unit|profile/i.test(title)
            ? Building2
            : /notification|reminder/i.test(title)
              ? Bell
              : /permission|privacy|retention|access/i.test(title)
                ? ShieldCheck
                : /payment|plan|billing/i.test(title)
                  ? CreditCard
                  : /team|contact|advisory/i.test(title)
                    ? Users
                    : /quality|reconciliation|difference/i.test(title)
                      ? Scale
                      : /history|interaction/i.test(title)
                        ? Clock3
                        : Layers;
}
function Panel({
  title,
  icon,
  children,
  extra,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  const Icon = sectionIcon(title ?? "Overview");
  return (
    <section className={`ab-panel ${className}`}>
      {title ? (
        <div className="ab-panel-heading">
          <h2>
            {icon ?? <Icon size={18} aria-hidden="true" />}
            {title}
          </h2>
          {extra}
        </div>
      ) : null}
      {children}
    </section>
  );
}
function Metric({
  label,
  value,
  Icon = Building2,
  tone = "blue",
  note,
  href,
}: {
  label: string;
  value: any;
  Icon?: any;
  tone?: string;
  note?: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <div className="ab-metric-top">
        <span className="ab-metric-icon">
          <Icon size={22} />
        </span>
        <p>{label}</p>
        {href ? (
          <ArrowRight
            size={13}
            className="ab-metric-arrow"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className="ab-metric-number">
        <strong className={String(fmt(value)).length > 9 ? "long" : ""}>
          {fmt(value)}
        </strong>
      </div>
      {note ? <small>{note}</small> : null}
    </>
  );
  return href ? (
    <Link
      className={`ab-metric ${tone} actionable`}
      to={href}
      aria-label={`Open ${label}`}
    >
      {content}
    </Link>
  ) : (
    <div className={`ab-metric ${tone}`}>{content}</div>
  );
}
function Table({
  headers,
  children,
  page: serverPage,
  pageSize: serverSize,
  totalRows,
  onPageChange,
}: {
  headers: string[];
  children: ReactNode;
  page?: number;
  pageSize?: number;
  totalRows?: number;
  onPageChange?: (page: number) => void;
}) {
  const rows = Children.toArray(children),
    local = usePagination(
      rows,
      rows
        .map((r) => (typeof r === "object" && r && "key" in r ? r.key : ""))
        .join("|"),
    );
  const external = !!onPageChange,
    visible = external ? rows : local.items;
  return (
    <div className="ab-table-container">
      <div className="ab-table-scroll">
        <table className="ab-table">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible
            ) : (
              <tr>
                <td colSpan={headers.length}>
                  <div className="ab-table-empty">
                    <FileSearch size={23} />
                    <span>No matching records</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={external ? (serverPage ?? 1) : local.page}
        pageSize={external ? (serverSize ?? 25) : local.pageSize}
        total={external ? (totalRows ?? rows.length) : local.total}
        onPage={onPageChange ?? local.onPage}
        onSize={external ? undefined : local.onSize}
      />
    </div>
  );
}
const sameChartData = (a: {name:string;value:number}[], b: {name:string;value:number}[]) =>
  a===b || (a.length===b.length && a.every((row,i)=>row.name===b[i].name && row.value===b[i].value));
const Bars = memo(function Bars({
  data,
  horizontal = false,
  colorful = false,
}: {
  data: any[];
  horizontal?: boolean;
  colorful?: boolean;
}) {
  const reduce = useReducedMotion();
  return data?.length ? (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 18, right: 45, bottom: 15, left: horizontal ? 35 : 0 }}
      >
        <CartesianGrid
          stroke="#e2e9f5"
          vertical={!horizontal}
          horizontal={!horizontal}
        />
        <XAxis
          type={horizontal ? "number" : "category"}
          dataKey={horizontal ? undefined : "name"}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          type={horizontal ? "category" : "number"}
          dataKey={horizontal ? "name" : undefined}
          tick={{ fontSize: 11 }}
          width={horizontal ? 90 : 44}
        />
        <Tooltip formatter={(v: any) => `${fmt(v)} MT`} />
        <Bar
          dataKey="value"
          radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
          fill="#075cf5"
          isAnimationActive={!reduce}
          animationDuration={350}
        >
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={
                colorful
                  ? colors[i % colors.length]
                  : horizontal
                    ? "#00b2b5"
                    : "#075cf5"
              }
            />
          ))}
          <LabelList
            dataKey="value"
            position={horizontal ? "right" : "top"}
            formatter={(v: any) => fmt(Number(v))}
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  ) : (
    <div className="ab-no-chart">No published values in this scope</div>
  );
}, (a,b)=>a.horizontal===b.horizontal && a.colorful===b.colorful && sameChartData(a.data,b.data));

const Donut = memo(function Donut({
  data,
  total,
  label = "Available quantity",
}: {
  data: any[];
  total: number;
  label?: string;
}) {
  const reduce = useReducedMotion();
  return total > 0 ? (
    <div className="ab-donut">
      <div className="ab-donut-visual">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie
              data={data.filter((r) => r.value > 0)}
              dataKey="value"
              innerRadius="66%"
              outerRadius="92%"
              isAnimationActive={!reduce}
              animationDuration={350}
            >
              {data
                .filter((r) => r.value > 0)
                .map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
            </Pie>
            <Tooltip formatter={(v: any) => `${fmt(v)} MT`} />
          </PieChart>
        </ResponsiveContainer>
        <div>
          <strong className={String(fmt(total)).length > 9 ? "long" : ""}>
            {fmt(total)} <span>MT</span>
          </strong>
          <small>{label}</small>
        </div>
      </div>
      <div className="ab-legend">
        {data.map((d, i) => (
          <p key={d.name}>
            <i style={{ background: colors[i % colors.length] }} />
            <span>{d.name}</span>
            <strong>{fmt(d.value)} MT</strong>
          </p>
        ))}
      </div>
    </div>
  ) : (
    <div className="ab-no-chart">No eligible quantity</div>
  );
}, (a,b)=>a.total===b.total && a.label===b.label && sameChartData(a.data,b.data));

const titles: Record<string, [string, string]> = {
  dashboard: ["Business Dashboard", "Your EPR business at a glance"],
  companies: [
    "My Companies & Units",
    "Manage companies, units and CPCB registrations in one place",
  ],
  certificates: [
    "Certificate Inventory",
    "View, filter and review your available EPR certificates",
  ],
  expiry: [
    "Certificate Expiry Monitoring",
    "Track upcoming validity dates and coordinate timely reviews.",
  ],
  procurement: [
    "Procurement Analytics",
    "Analyse plastic procurement by supplier, category, unit and time period.",
  ],
  quality: [
    "Reconciliation",
    "Compare available procurement summary and detail quantities by financial year and category.",
  ],
  reports: [
    "Reports & Management Insights",
    "Reviewed management summaries and downloadable reports.",
  ],
  notifications: [
    "Notifications & Alerts",
    "Stay updated on certificates, consultation replies and published data.",
  ],
  support: [
    "SPOC & Advisory Support",
    "Connect with your assigned team for consultation and business guidance.",
  ],
  subscription: [
    "Subscription & Billing",
    "Manage your ORQIX plan, billing, invoices and payment details.",
  ],
  settings: [
    "Settings & Data Governance",
    "Your organization, access, preferences and approved data retention.",
  ],
};
function ScopeFilters({
  data,
  params,
  setParams,
}: {
  data: Doc;
  params: URLSearchParams;
  setParams: (p: URLSearchParams) => void;
}) {
  const update = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    p.delete("page");
    setParams(p);
  };
  return (
    <div className="ab-filterbar">
      {[
        ["company", "Company", "company"],
        ["unit", "Unit", "unit"],
        ["registration", "Registration", "cpcbId"],
        ["fy", "Financial Year", "financialYear"],
      ].map(([key, label, field]) => (
        <label key={key}>
          {label}
          <select
            aria-label={label}
            value={params.get(key) ?? ""}
            onChange={(e) => update(key, e.target.value)}
          >
            <option value="">
              All{" "}
              {label === "Financial Year"
                ? "financial years"
                : label.toLowerCase() + "s"}
            </option>
            {[
              ...new Set(
                (key === "fy"
                  ? (data.options.financialYears ?? []).map(
                      (financialYear: string) => ({
                        financialYear,
                        company: params.get("company"),
                      }),
                    )
                  : (data.registry ?? data.allDatasets ?? [])
                )
                  .filter(
                    (d: Doc) =>
                      key === "company" ||
                      !params.get("company") ||
                      d.company === params.get("company"),
                  )
                  .map((d: Doc) => String(d[field])),
              ),
            ]
              .sort()
              .map((v) => (
                <option key={String(v)}>{String(v)}</option>
              ))}
          </select>
        </label>
      ))}
      <button
        className="ab-text-button"
        onClick={() => setParams(new URLSearchParams())}
      >
        Clear filters
      </button>
    </div>
  );
}
function SourceFooter({ data, onSource }: { data: Doc; onSource: () => void }) {
  return (
    <div className="ab-source">
      <ShieldCheck size={24} />
      <strong>
        {data.datasets.length
          ? "Latest reviewed data refresh"
          : "No published client data yet"}
      </strong>
      <span>
        {data.verifiedAt
          ? stamp(data.verifiedAt)
          : "Internal team publishes reviewed Excel data here"}
      </span>
      <button onClick={onSource}>
        View source & coverage <ArrowRight size={15} />
      </button>
    </div>
  );
}
export function BusinessPage({
  page,
  role,
  user,
}: {
  page: string;
  role: string;
  user: User;
}) {
  const [params, setParams] = useSearchParams(),
    cache = useQueryClient(),
    [source, setSource] = useState(false),
    [detail, setDetail] = useState<Doc | null>(null),
    [windowDays, setWindowDays] = useState(60),
    [selected, setSelected] = useState<string[]>([]);
  const search = params.get("q") ?? "";
  const [debouncedSearch,setDebouncedSearch] = useState(search);
  useEffect(()=>{const timer=setTimeout(()=>setDebouncedSearch(search),250);return ()=>clearTimeout(timer);},[search]);
  const snapshotParams = new URLSearchParams(params);
  if(debouncedSearch) snapshotParams.set("q",debouncedSearch); else snapshotParams.delete("q");
  if (page === "expiry") snapshotParams.set("expiryDays", String(windowDays));
  const path =
      "/client/axis" +
      (snapshotParams.toString() ? "?" + snapshotParams.toString() : ""),
    q = clientQuery<Doc>(path,true,true),
    data = q.data;
  const refresh = () =>
    cache.invalidateQueries({
      predicate: (x) => String(x.queryKey[0]).startsWith("/client/axis"),
    });
  const exp = (type = "summary", format = "xlsx") =>
    `/api/client/axis/export?${new URLSearchParams({ ...Object.fromEntries(params), type, format })}`;
  const change = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    p.delete("page");
    setParams(p);
  };
  if (q.isPending) return <SkeletonLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  if (!data) return null;
  const HeadingIcon = sectionIcon((titles[page] ?? titles.dashboard)[0]);
  const t = titles[page] ?? titles.dashboard,
    ready = data.datasets.length > 0,
    v = (n: number) => (ready ? n : "—");
  return (
    <div className="ab-page" aria-busy={q.isFetching}>
      {(q.isFetching || search !== debouncedSearch) && data ? <div className="ab-filter-updating" role="status">Updating data...</div> : null}
      <div className="ab-page-title">
        <div>
          <span className="ab-banner-eyebrow">YOUR CLIENT WORKSPACE</span>
          <h1>
            <span className="ab-page-icon">
              <HeadingIcon size={23} aria-hidden="true" />
            </span>
            {t[0]}
          </h1>
          <p>{t[1]}</p>
        </div>
        <div className="ab-title-actions">
          <Badge tone={ready ? "teal" : "purple"}>
            <Info size={14} />
            {ready ? "Published client data" : "Awaiting publication"}
          </Badge>
          {page === "procurement" ? (
            <PdfDownloadButton
              href={exp("procurement", "pdf")}
              title="Procurement Analysis Report"
              company={data.organization.name}
              disabled={!ready}
            />
          ) : null}
          {page === "dashboard" ? (
            <select
              className="ab-title-fy"
              aria-label="Dashboard financial year"
              value={params.get("fy") ?? ""}
              onChange={(e) => change("fy", e.target.value)}
            >
              <option value="">All financial years</option>
              {[
                ...new Set(
                  data.options.financialYears ??
                    data.allDatasets.map((d: Doc) => String(d.financialYear)),
                ),
              ].map((fy) => (
                <option key={String(fy)}>{String(fy)}</option>
              ))}
            </select>
          ) : null}
          {[
            "dashboard",
            "certificates",
            "expiry",
            "procurement",
            "reports",
            "companies",
            "quality",
          ].includes(page) ? (
            <a
              className={`ab-button ${!ready ? "disabled" : ""}`}
              aria-disabled={!ready}
              href={
                ready
                  ? exp(
                      ["dashboard", "reports"].includes(page)
                        ? "summary"
                        : page === "quality"
                          ? "quality"
                          : page,
                    )
                  : undefined
              }
            >
              <Download size={17} />
              {page === "certificates"
                ? "Export Eligible Records"
                : "Export Report"}
            </a>
          ) : null}
        </div>
      </div>

      {!ready &&
      !["subscription", "settings", "support", "notifications"].includes(
        page,
      ) ? (
        <div className="ab-empty-banner">
          <FileSpreadsheetIcon />
          <div>
            <strong>
              Your internal team has not published a snapshot for this scope.
            </strong>
            <p>
              No demo figures are shown. Data will appear after authorized Excel
              review and publication in Client Data Publishing.
            </p>
          </div>
        </div>
      ) : null}
      {page === "companies" && canManage(role) ? (
        <p>
          <Link className="ab-text-link" to="/client/accounts">
            Manage portal accounts
          </Link>{" "}
          ?{" "}
          <Link className="ab-text-link" to="/client/cpcb-ids">
            Manage registrations
          </Link>
        </p>
      ) : null}
      {page === "dashboard" ? (
        <>
          <div className="ab-kpis six">
            <Metric
              label="Total Registered Units"
              value={v(data.metrics.units)}
              note="Across linked units"
              href="/client/companies"
            />
            <Metric
              label="Available Certificates (MT)"
              value={v(data.metrics.available)}
              Icon={Award}
              tone="teal"
              note="Reviewed inventory"
              href="/client/certificates?status=eligible"
            />
            <Metric
              label="Expiring Soon (MT)"
              value={v(data.buckets[0].quantity)}
              Icon={TriangleAlert}
              tone="amber"
              note="Within 30 days"
              href="/client/expiry"
            />
            <Metric
              label="Procurement Quantity (MT)"
              value={v(data.metrics.procurement)}
              Icon={ShoppingCart}
              tone="teal"
              note="Recorded source quantity"
              href="/client/procurement"
            />
            <Metric
              label="Reconciliation Reviews"
              value={v(data.metrics.issues)}
              Icon={FileSearch}
              tone="purple"
              note={
                data.metrics.issues ? "Review required" : "No open findings"
              }
              href="/client/reconciliation"
            />
          </div>
          <div className="ab-grid two">
            <Panel
              title="Category-wise Certificate Availability"
              extra={
                <Badge tone="teal">
                  Total: {fmt(data.metrics.available)} MT
                </Badge>
              }
            >
              <Bars data={data.charts.categories} horizontal />
            </Panel>
            <Panel
              title="Procurement Trend by Financial Year"
              extra={<Badge tone="gray">Unit: MT</Badge>}
            >
              <Bars data={data.charts.trend} />
            </Panel>
          </div>
          <div className="ab-grid overview-bottom">
            <Panel title="Certificate Expiry Distribution">
              <Donut
                data={data.charts.expiry}
                total={data.metrics.available}
                label="Total available"
              />
            </Panel>

          </div>
        </>
      ) : null}
      {page === "companies" ? (
        <>
          <div className="ab-kpis four">
            <Metric
              label="Companies"
              value={new Set(data.registry.map((d: Doc) => d.company)).size}
            />
            <Metric
              label="Units"
              value={
                new Set(data.registry.map((d: Doc) => `${d.company}|${d.unit}`))
                  .size
              }
              Icon={Building2}
              tone="teal"
            />
            <Metric
              label="Unique Registrations"
              value={
                new Set(
                  data.registry.map((d: Doc) => `${d.portal}|${d.cpcbId}`),
                ).size
              }
              Icon={FileText}
              tone="purple"
            />
            <Metric
              label="Reviewed Snapshots"
              value={data.datasets.length}
              Icon={ShieldCheck}
              tone="green"
            />
          </div>
          <ScopeFilters data={data} params={params} setParams={setParams} />
          <Panel
            title="Company & Registration Overview"
            icon={<Layers size={22} />}
            extra={
              <Badge>{data.metrics.registrations} unique registrations</Badge>
            }
          >
            <Table
              headers={[
                "Select",
                "Company",
                "Unit",
                "Portal",
                "Registration",
                "FY",
                "Source coverage",
                "Data status",
              ]}
            >
              {data.registry.map((d: Doc) => (
                <tr key={d.id}>
                  <td>
                    <input
                      aria-label={`Compare ${d.cpcbId}`}
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked
                            ? [...old, d.id]
                            : old.filter((id) => id !== d.id),
                        )
                      }
                    />
                  </td>
                  <td>{d.company}</td>
                  <td>{d.unit}</td>
                  <td>
                    <Badge>{String(d.portal).toUpperCase()} EPR</Badge>
                  </td>
                  <td>{d.cpcbId}</td>
                  <td>{d.financialYear}</td>
                  <td>
                    <div className="ab-coverage">
                      <span>{d.coverage}%</span>
                      <i>
                        <b style={{ width: d.coverage + "%" }} />
                      </i>
                    </div>
                  </td>
                  <td>
                    <Badge tone={d.errors?.length ? "amber" : "green"}>
                      {!d.published
                        ? "Not published"
                        : d.errors?.length
                          ? "Partial source"
                          : "Reviewed"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          </Panel>
          <div className="ab-grid two">
            <Panel title="Account Comparison">
              <p>
                Select two registrations to compare current snapshot quantities.
                Source coverage is not a compliance score.
              </p>
              <Table
                headers={[
                  "Metric",
                  ...data.datasets
                    .filter((d: Doc) => selected.includes(d.id))
                    .slice(0, 2)
                    .map((d: Doc) => String(d.unit) + " · " + d.cpcbId),
                ]}
              >
                {[
                  "Available certificates (MT)",
                  "Procurement (MT)",
                  "Source coverage",
                  "Financial year",
                  "Data as of",
                ].map((label, i) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {data.datasets
                      .filter((d: Doc) => selected.includes(d.id))
                      .slice(0, 2)
                      .map((d: Doc) => (
                        <td key={d.id}>
                          {i === 0
                            ? fmt(data.registrationMetrics[d.id]?.available)
                            : i === 1
                              ? fmt(data.registrationMetrics[d.id]?.procurement)
                              : i === 2
                                ? d.coverage + "%"
                                : i === 3
                                  ? d.financialYear
                                  : stamp(d.asOf)}
                        </td>
                      ))}
                  </tr>
                ))}
              </Table>
            </Panel>
            <Panel
              title="Data Refresh & Publication"
              icon={<RefreshCw size={22} />}
            >
              <strong>{data.datasets.length} active reviewed snapshots</strong>
              <div className="ab-large-progress">
                <i style={{ width: ready ? "100%" : "0%" }} />
              </div>
              <p>
                Each snapshot has its own extraction timestamp, review and
                retention expiry.
              </p>
              <ABButton secondary onClick={() => setSource(true)}>
                View refresh history
              </ABButton>
            </Panel>
          </div>
          <div className="ab-note">
            <ShieldCheck />
            Duplicate-safe counting: each portal registration is counted once.
            Multiple login identities never add certificate quantities.
          </div>
        </>
      ) : null}
      {page === "certificates" ? (
        <>
          <div className="ab-kpis four">
            <Metric
              label="Available Quantity (MT)"
              value={v(data.metrics.available)}
              Icon={Layers}
            />
            <Metric
              label="Total Certificate Count"
              value={v(data.metrics.certificateCount)}
              Icon={FileText}
            />
            <Metric
              label="Categories"
              value={v(data.charts.categories.length)}
              Icon={Layers}
              tone="purple"
            />
            <Metric
              label="Expired Quantity (MT)"
              value={v(data.metrics.expiredQuantity)}
              Icon={Clock3}
              tone="amber"
            />
          </div>
          <div className="ab-grid two">
            <Panel title="Category-wise Availability">
              <Bars data={data.charts.categories} horizontal colorful />
            </Panel>
            <Panel title="Processing-type Availability">
              <Donut
                data={data.charts.processing}
                total={data.metrics.available}
              />
            </Panel>
          </div>
          <div className="ab-filterbar">
            <label>
              Search certificate ID
              <input
                aria-label="Search certificate ID"
                value={params.get("q") ?? ""}
                onChange={(e) => change("q", e.target.value)}
              />
            </label>
            <label>
              Category
              <select
                value={params.get("category") ?? ""}
                onChange={(e) => change("category", e.target.value)}
              >
                <option value="">All categories</option>
                {data.charts.categories.map((c: Doc) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </label>
            <label>
              Processing Type
              <select
                value={params.get("processing") ?? ""}
                onChange={(e) => change("processing", e.target.value)}
              >
                <option value="">All types</option>
                {data.charts.processing.map((c: Doc) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={params.get("status") ?? ""}
                onChange={(e) => change("status", e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="eligible">Eligible</option>
                <option value="expired">Expired</option>
                <option value="review">Needs review</option>
              </select>
            </label>
          </div>
          <Panel
            title="Certificate Records"
            extra={<Badge>{data.certificateTotal} records</Badge>}
          >
            <Table
              page={data.page}
              pageSize={data.pageSize}
              totalRows={data.certificateTotal}
              onPageChange={(n) => change("page", String(n))}
              headers={[
                "Certificate ID",
                "Category",
                "Processing Type",
                "Value (MT)",
                "Validity",
                "Status",
                "Action",
              ]}
            >
              {data.certificates.map((r: Doc) => (
                <tr
                  key={r.sourceId}
                  className={
                    r.daysLeft !== null && r.daysLeft <= 30 ? "highlight" : ""
                  }
                >
                  <td>
                    <button
                      className="ab-text-button"
                      onClick={() => setDetail(r)}
                    >
                      {r.certificateId || "Missing ID"}
                    </button>
                  </td>
                  <td>{r.category}</td>
                  <td>{r.processingType}</td>
                  <td>{fmt(r.quantity)}</td>
                  <td>{r.validity ?? "Not provided"}</td>
                  <td>
                    <Badge tone={r.eligible ? "green" : "amber"}>
                      {r.eligible ? "Available" : "Review"}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="ab-text-button"
                      onClick={() => setDetail(r)}
                    >
                      View details <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      ) : null}
      {page === "expiry" ? (
        <>
          <div className="ab-kpis three">
            {data.buckets.map((b: Doc, i: number) => (
              <div
                className={`ab-expiry-card ${["red", "amber", "blue"][i]}`}
                key={b.days}
              >
                <CalendarDays size={34} />
                <div>
                  <h2>{["Expiring soon", "Upcoming", "Early warning"][i]}</h2>
                  <strong>
                    {b.days}
                    <small>Days window</small>
                  </strong>
                  <p>
                    Within {b.days} days · {fmt(b.quantity)} MT · {b.count}{" "}
                    certificates
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="ab-info">
            <Info size={17} />
            Cumulative windows: 30-day records are included in 60 and 90 days.
          </p>
          <div className="ab-grid detail-layout">
            <Panel>
              <div className="ab-tabs">
                {[30, 60, 90].map((n) => (
                  <ABButton
                    key={n}
                    secondary={windowDays !== n}
                    onClick={() => {
                      setWindowDays(n);
                      change("expiryPage", "1");
                    }}
                  >
                    Within {n} days
                  </ABButton>
                ))}
              </div>
              <h2>Certificates approaching expiry</h2>
              <Table
                page={data.expiryPage}
                pageSize={data.expiryPageSize}
                totalRows={data.expiryTotal}
                onPageChange={(n) => change("expiryPage", String(n))}
                headers={[
                  "Certificate ID",
                  "Category",
                  "Quantity MT",
                  "Validity",
                  "Days left",
                ]}
              >
                {data.expiryCertificates
                  .filter((r: Doc) => r.daysLeft <= windowDays)
                  .map((r: Doc) => (
                    <tr key={r.sourceId}>
                      <td>{r.certificateId}</td>
                      <td>{r.category}</td>
                      <td>{fmt(r.quantity)}</td>
                      <td>{r.validity}</td>
                      <td>
                        <Badge tone={r.daysLeft <= 30 ? "red" : "amber"}>
                          {r.daysLeft} days
                        </Badge>
                      </td>

                    </tr>
                  ))}
              </Table>
              <p>Browse every matching certificate with the page controls.</p>
            </Panel>
            <Panel title="Upcoming Expiry Alerts" icon={<Bell size={23} />}>
              <p>Validity windows</p>
              <div className="ab-timeline">
                {[90, 60, 30, 7].map((n) => (
                  <div key={n}>
                    <i />
                    <Badge>{n} days before</Badge>
                  </div>
                ))}
              </div>
              <p>
                In-app expiry alerts use published data and expire with its
                approved retention. No automatic compliance decision is made.
              </p>
              <Link className="ab-button secondary" to="/client/notifications">
                Notification preferences
              </Link>
            </Panel>
          </div>
          <div className="ab-note amber">
            <ShieldCheck />
            <div>
              <strong>Validity requires business-rule verification</strong>
              <p>
                Monitoring uses configured validity dates. Review the applicable
                business rules before taking action.
              </p>
            </div>
          </div>
        </>
      ) : null}
      {page === "procurement" ? (
        <>
          <div className="ab-kpis five">
            <Metric
              label="Total Procurement (MT)"
              value={v(data.metrics.procurement)}
              Icon={ShoppingCart}
            />
            <Metric
              label="Suppliers"
              value={v(data.metrics.suppliers)}
              Icon={Users}
              tone="teal"
            />
            <Metric
              label="Registered Supplier Quantity (MT)"
              value={v(data.metrics.registered)}
              Icon={Check}
              tone="green"
            />
            <Metric
              label="Unregistered Supplier Quantity (MT)"
              value={v(data.metrics.unregistered)}
              Icon={Users}
              tone="amber"
            />
            <Metric
              label="Review Findings"
              value={v(data.issueTotal)}
              Icon={TriangleAlert}
              tone="amber"
            />
          </div>
          <ScopeFilters data={data} params={params} setParams={setParams} />
          <div className="ab-filterbar">
            {[
              ["supplier", "Supplier", "suppliers"],
              ["registerType", "Registration type", "registerTypes"],
              ["plasticCategory", "Plastic category", "categories"],
            ].map(([k, label, options]) => (
              <label key={k}>
                {label}
                <select
                  value={params.get(k) ?? ""}
                  onChange={(e) => change(k, e.target.value)}
                >
                  <option value="">All</option>
                  {data.options[options].map((v: string) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Invoice date from
              <input
                type="date"
                value={params.get("from") ?? ""}
                onChange={(e) => change("from", e.target.value)}
              />
            </label>
            <label>
              Until
              <input
                type="date"
                value={params.get("to") ?? ""}
                onChange={(e) => change("to", e.target.value)}
              />
            </label>
          </div>
          <div className="ab-grid three ab-procurement-charts">
            <Panel title="FY Procurement Trend">
              <Bars data={data.charts.trend} />
            </Panel>
            <Panel title="Category Quantity">
              <Bars data={data.charts.procurementCategories} colorful />
            </Panel>
            <Panel
              title="Leading Suppliers"
              extra={<Badge>{data.metrics.suppliers} suppliers</Badge>}
            >
              <div className="ab-supplier-ranking">
                {data.charts.suppliers
                  .filter((r: Doc) => r.name !== "Others")
                  .slice(0, 5)
                  .map((r: Doc, i: number) => (
                    <div key={r.name}>
                      <span>{i + 1}</span>
                      <p title={r.name}>{r.name}</p>
                      <strong>
                        {fmt(r.value)}
                        <small>MT</small>
                      </strong>
                    </div>
                  ))}
              </div>
              <p className="ab-chart-caption">
                Top five suppliers by recorded quantity. Use Supplier filters
                for a detailed view.
              </p>
            </Panel>
            <Panel title="Supplier Concentration">
              <Donut
                data={[
                  ...data.charts.suppliers
                    .filter((r: Doc) => r.name !== "Others")
                    .slice(0, 3),
                  {
                    name: "Remaining suppliers",
                    value: Math.max(
                      0,
                      data.metrics.procurement -
                        data.charts.suppliers
                          .filter((r: Doc) => r.name !== "Others")
                          .slice(0, 3)
                          .reduce((n: number, r: Doc) => n + r.value, 0),
                    ),
                  },
                ]}
                total={data.metrics.procurement}
                label="Recorded quantity"
              />
            </Panel>
            <Panel title="Unit Procurement Overview">
              <div className="ab-unit-overview">
                {data.charts.units.map((r: Doc) => (
                  <div key={r.name}>
                    <span>
                      <Building2 size={20} />
                      {r.name}
                    </span>
                    <strong>
                      {fmt(r.value)} <small>MT</small>
                    </strong>
                    <progress
                      max={Math.max(1, data.metrics.procurement)}
                      value={r.value}
                    />
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Supplier Registration Mix">
              <div className="ab-registration-mix">
                {[
                  ["Registered suppliers", data.metrics.registered, "green"],
                  [
                    "Unregistered suppliers",
                    data.metrics.unregistered,
                    "amber",
                  ],
                ].map(([label, amount, tone]) => (
                  <div key={String(label)}>
                    <span>
                      <Badge tone={String(tone)}>{String(label)}</Badge>
                      <strong>
                        {data.metrics.procurement
                          ? (
                              (Number(amount) / data.metrics.procurement) *
                              100
                            ).toFixed(1)
                          : "0"}
                        %
                      </strong>
                    </span>
                    <h3>
                      {fmt(amount)} <small>MT</small>
                    </h3>
                    <progress
                      max={Math.max(1, data.metrics.procurement)}
                      value={Number(amount)}
                    />
                  </div>
                ))}
              </div>
              <p className="ab-chart-caption">
                Recorded source quantities, grouped by supplier registration
                type.
              </p>
            </Panel>
          </div>
          <div className="ab-note">
            <Info />
            {data.definitions.procurement}
          </div>
        </>
      ) : null}
      {page === "quality" ? (
        <>
          <div className="ab-kpis four">
            <Metric label="Comparable FY / categories" value={data.reconciliations.length} Icon={Layers} tone="blue" />
            <Metric label="Matching quantities" value={data.reconciliations.filter((r: Doc) => Math.abs(r.difference) <= 0.000001).length} Icon={CheckCircle2} tone="green" />
            <Metric label="Quantity differences" value={data.reconciliations.filter((r: Doc) => Math.abs(r.difference) > 0.000001).length} Icon={Scale} tone="amber" />
            <Metric label="Procurement detail (MT)" value={fmt(data.metrics.procurement)} Icon={FileText} tone="blue" />
          </div>
          <Panel title="Summary & Detail Comparison" icon={<Scale size={22} />}>
            <ScopeFilters data={data} params={params} setParams={setParams} />
            <p className="ab-chart-caption">Procurement Summary quantities compared with Procurement data totals for the same financial year and category. Difference = summary minus detail, in MT. Small differences may reflect source rounding; these are comparisons, not confirmed errors.</p>
            <Table headers={["Company / Unit", "Registration", "Financial Year", "Category", "Summary (MT)", "Detail (MT)", "Difference (MT)"]}>
              {data.reconciliations.map((r: Doc) => (
                <tr key={r.id}>
                  <td><strong>{r.company}</strong><small>{r.unit}</small></td>
                  <td>{r.cpcbId}</td><td>{r.financialYear}</td><td>{r.category}</td>
                  <td>{fmt(r.summary)}</td><td>{fmt(r.detail)}</td>
                  <td><Badge tone={Math.abs(r.difference) <= 0.000001 ? "green" : "blue"}>{fmt(r.difference)}</Badge></td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      ) : null}
      {page === "reports" ? (
        <Reports
          data={data}
          exportUrl={exp}
          scope={
            <ScopeFilters data={data} params={params} setParams={setParams} />
          }
        />
      ) : null}
      {page === "notifications" ? (
        <Notifications user={user} role={role} />
      ) : null}
      {page === "support" ? <Advisory data={data} role={role} /> : null}
      {page === "subscription" ? <Subscription role={role} /> : null}
      {page === "settings" ? (
        <Governance data={data} role={role} user={user} />
      ) : null}
      {[
        "dashboard",
        "companies",
        "certificates",
        "expiry",
        "procurement",
        "quality",
        "reports",
      ].includes(page) ? (
        <SourceFooter data={data} onSource={() => setSource(true)} />
      ) : null}
      <ConfirmationDialog
        open={source}
        onClose={() => setSource(false)}
        title="Data source & publication coverage"
        description="Review timestamps, source coverage and retention. This is an internal reviewed upload, not independent CPCB certification."
      >
        {data.datasets.map((d: Doc) => (
          <div key={d.id}>
            <h3>
              {d.company} / {d.unit}
            </h3>
            <p>
              {d.cpcbId} · {d.financialYear}
            </p>
            <p>
              Extracted as of {stamp(d.asOf)} · Published {stamp(d.publishedAt)}
            </p>
            <p>
              Published by {d.publisherName}; available until replaced.
            </p>
            <p>{d.reviewNotes}</p>
            <p>{d.errors?.join("; ")}</p>
          </div>
        ))}
        <p>{data.definitions.coverage}</p>
        <p>{data.definitions.available}</p>
      </ConfirmationDialog>
      <ConfirmationDialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={
          detail?.certificateId ? "Certificate details" : "Data quality review"
        }
        description="Source findings require human review; they are not a statutory compliance determination."
      >
        {detail ? (
          <>
            <div className="ab-detail-list">
              {Object.entries(detail)
                .filter(([k]) => !["issues", "id"].includes(k))
                .map(([k, value]) => (
                  <p key={k}>
                    <span>{human(k)}</span>
                    <strong>{String(value ?? "Not provided")}</strong>
                  </p>
                ))}
            </div>
            {detail.issues?.map((s: string) => (
              <p key={s}>{s}</p>
            ))}

          </>
        ) : null}
      </ConfirmationDialog>
    </div>
  );
}
function FileSpreadsheetIcon() {
  return <FileText size={30} />;
}
const reports = [
  [
    "summary",
    "Monthly EPR Business Summary",
    "An overview of available certificates and procurement.",
  ],
  [
    "certificates",
    "Certificate Availability Report",
    "Eligible certificate inventory by category and processing type.",
  ],
  [
    "expiry",
    "Certificate Expiry Review Report",
    "Upcoming validity dates and certificate quantities.",
  ],
  [
    "procurement",
    "Procurement Analysis Report",
    "Procurement quantities, supplier distribution and financial years.",
  ],
  [
    "quality",
    "Procurement Reconciliation Report",
    "Comparable summary and detail procurement quantities.",
  ],
  [
    "companies",
    "Consolidated Company/Unit Report",
    "Authorized portfolio and publication coverage.",
  ],
];
function Reports({
  data,
  exportUrl,
  scope,
}: {
  data: Doc;
  exportUrl: (type?: string, format?: string) => string;
  scope: ReactNode;
}) {
  const q = clientQuery<Doc>("/client/axis/reports"),
    ready = data.datasets.length > 0;
  return (
    <>
      <Panel className="ab-report-hero">
        <FileText size={50} />
        <div>
          <h2>Monthly EPR Business Summary</h2>
          <p>
            {data.asOf
              ? new Date(data.asOf).toLocaleDateString("en-IN", {
                  month: "long",
                  year: "numeric",
                })
              : "No publication yet"}{" "}
            ·{" "}
            <Badge tone="green">
              {ready ? "Published snapshot" : "Awaiting data"}
            </Badge>
          </p>
        </div>
        <div className="ab-mini-stats">
          <span>
            Availability<strong>{fmt(data.metrics.available)} MT</strong>
          </span>
          <span>
            Procurement<strong>{fmt(data.metrics.procurement)} MT</strong>
          </span>
          <span>
            Registrations<strong>{data.metrics.registrations}</strong>
          </span>
        </div>
        <div>
          <PdfDownloadButton
            href={exportUrl("summary", "pdf")}
            title="Monthly EPR Business Summary"
            company={data.organization.name}
            disabled={!ready}
            className="ab-button"
          />
          <a
            className={`ab-button secondary ${!ready ? "disabled" : ""}`}
            href={ready ? exportUrl("summary") : undefined}
          >
            Download Excel
          </a>
        </div>
      </Panel>
      {scope}
      <h2>Report Catalog</h2>
      <div className="ab-report-catalog">
        {reports.map(([type, title, description], i) => (
          <Panel key={type}>
            <span
              className="ab-report-icon"
              style={{ color: colors[i % colors.length] }}
            >
              <FileText size={29} />
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
            <Badge tone={ready ? "green" : "gray"}>
              {ready ? "Available" : "No published data"}
            </Badge>
            <small>{data.verifiedAt ? stamp(data.verifiedAt) : "—"}</small>
            <PdfDownloadButton
              href={exportUrl(type, "pdf")}
              title={title}
              company={data.organization.name}
              disabled={!ready}
            />
            <a
              className={`ab-button secondary ${!ready ? "disabled" : ""}`}
              href={ready ? exportUrl(type) : undefined}
            >
              <Download size={13} />
              Download Excel
            </a>
          </Panel>
        ))}
      </div>
      <div className="ab-grid overview-bottom">
        <Panel title="Recent Downloads" icon={<Download size={22} />}>
          <Table headers={["Report", "Downloaded on", "Format"]}>
            {q.data?.downloads.map((d: Doc) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{stamp(d.downloadedAt)}</td>
                <td>
                  <Badge tone={d.format === "pdf" ? "red" : "green"}>
                    {String(d.format).toUpperCase()}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Management Insight" icon={<Info size={22} />}>
          <div className="ab-recommendation">
            <h3>
              {data.asOf
                ? new Date(data.asOf).toLocaleDateString("en-IN", {
                    month: "long",
                    year: "numeric",
                  })
                : "Current"}{" "}
              Review
            </h3>
            <p>
              For questions about your data, contact your assigned SPOC through Request Consultation.
            </p>
            <p>
              Certificate availability and procurement are separate measures. No
              compliance buffer is inferred by subtracting them.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}

function Preferences({
  preferences,
  role,
}: {
  preferences: Doc;
  role: string;
}) {
  const [p, setP] = useState<Doc>(preferences),
    cache = useQueryClient();
  useEffect(() => setP(preferences), [preferences]);
  const save = useMutation({
    mutationFn: () =>
      post(
        "/client/axis/preferences",
        Object.fromEntries(
          [
            "email",
            "inApp",
            "certificates",
            "actions",
            "advisory",
            "reports",
            "data",
            "quality",
            "quietStart",
            "quietEnd",
            "frequency",
            "formatPdf",
            "formatExcel",
          ].map((k) => [k, p[k]]),
        ),
      ),
    onSuccess: () => {
      toast.success("Preferences saved. Email delivery is not configured.");
      void cache.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("/client/axis"),
      });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Panel title="Notification Preferences">
      <p>Choose the updates you want to receive.</p>
      {[
        ["email", "Email notifications"],
        ["inApp", "In-app notifications"],
        ["certificates", "Certificates"],
        ["advisory", "Advisory"],
        ["reports", "Reports"],
        ["data", "Data updates"],
        ["quality", "Data quality issues"],
      ].map(([key, label]) => (
        <label className="ab-toggle-row" key={key}>
          <span>{label}</span>
          <input
            role="switch"
            type="checkbox"
            checked={!!p[key]}
            onChange={(e) => setP({ ...p, [key]: e.target.checked })}
            disabled={role === "client_viewer"}
          />
        </label>
      ))}
      <h3>Quiet Hours</h3>
      <div className="ab-grid two">
        <label>
          From
          <input
            aria-label="Quiet hours start"
            type="time"
            value={p.quietStart ?? "22:00"}
            onChange={(e) => setP({ ...p, quietStart: e.target.value })}
          />
        </label>
        <label>
          Until
          <input
            aria-label="Quiet hours end"
            type="time"
            value={p.quietEnd ?? "07:00"}
            onChange={(e) => setP({ ...p, quietEnd: e.target.value })}
          />
        </label>
      </div>
      <p className="ab-info">
        In-app feed is available. Email, SMS and WhatsApp delivery are not
        configured; toggles do not imply a message was sent.
      </p>
      <ABButton
        disabled={role === "client_viewer" || save.isPending}
        onClick={() => save.mutate()}
      >
        Save Preferences
      </ABButton>
    </Panel>
  );
}
function Notifications({ user, role }: { user: User; role: string }) {
  const q = clientQuery<Doc>("/client/axis/notifications"),
    [tab, setTab] = useState("ALL"),
    cache = useQueryClient();
  const mark = useMutation({
    mutationFn: (id?: string) =>
      post("/client/axis/notifications/read", id ? { id } : {}),
    onSuccess: () =>
      void cache.invalidateQueries({
        predicate: (x) => String(x.queryKey[0]).startsWith("/client/axis"),
      }),
  });
  const rows = q.data?.notifications ?? [],
    unread = rows.filter((n: Doc) => !n.readBy.includes(user.id));
  const noticePager = usePagination<Doc>(
    rows.filter((r: Doc) =>
      tab === "ALL" || tab === "UNREAD"
        ? !r.readBy.includes(user.id) || tab === "ALL"
        : r.type === tab,
    ),
    tab,
  );
  return (
    <div className="ab-grid detail-layout">
      <div>
        <div className="ab-kpis three">
          <Metric
            label="Unread Notifications"
            value={unread.length}
            Icon={Bell}
          />
          <Metric
            label="Consultation Updates"
            value={rows.filter((r: Doc) => r.type === "ADVISORY").length}
            Icon={TriangleAlert}
            tone="red"
          />
          <Metric
            label="Data Updates"
            value={rows.filter((r: Doc) => r.type === "DATA").length}
            Icon={FileText}
            tone="green"
          />
        </div>
        <div className="ab-tabs">
          {["ALL", "UNREAD", "CERTIFICATE", "ADVISORY", "DATA"].map((t) => (
            <ABButton key={t} secondary={tab !== t} onClick={() => setTab(t)}>
              {human(t)}
            </ABButton>
          ))}
          <ABButton secondary onClick={() => mark.mutate(undefined)}>
            Mark all as read
          </ABButton>
        </div>
        <Panel>
          {noticePager.items.map((r: Doc) => (
            <div
              className={`ab-notice ${r.readBy.includes(user.id) ? "read" : ""}`}
              key={r.id}
            >
              <span>
                <Bell size={23} />
              </span>
              <div>
                <h3>{r.title}</h3>
                <p>{r.message}</p>
                <small>{stamp(r.createdAt)}</small>
              </div>
              <Link
                className="ab-button secondary"
                to={r.link}
                onClick={() => mark.mutate(r.id)}
              >
                View
              </Link>
            </div>
          ))}
          <Pagination {...noticePager} label="notifications" />
          {!rows.length ? (
            <p>
              No notifications yet. Updates appear when client data is published.
            </p>
          ) : null}
        </Panel>
      </div>
      {q.data ? (
        <Preferences preferences={q.data.preferences} role={role} />
      ) : (
        <SkeletonLoader />
      )}
    </div>
  );
}

function Advisory({ data, role }: { data: Doc; role: string }) {
  const spocs = clientQuery<Doc>("/client/spocs"),
    tickets = clientQuery<Doc>("/client/support"),
    [selected, setSelected] = useState(""),
    [requestOpen, setRequestOpen] = useState(false),
    [message, setMessage] = useState(""),
    cache = useQueryClient();
  const thread = clientQuery<Doc>(`/client/support/${selected}`, !!selected);
  const refresh = () =>
    cache.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith("/client/support"),
    });
  const request = useMutation({
    mutationFn: (values: Record<string, FormDataEntryValue>) =>
      post<{ ticket: Doc }>("/client/support", {
        subject: values.subject,
        topic: values.topic,
        message: `${values.company} / ${values.unit}\nTopic: ${values.topic}\nPreferred date: ${values.date}\n${values.description}`,
        priority: "normal",
      }),
    onSuccess: (r) => {
      void refresh();
      setSelected(r.ticket.id);
      setRequestOpen(false);
      toast.success("Consultation request submitted.");
    },
    onError: (e) => toast.error(e.message),
  });
  const reply = useMutation({
    mutationFn: () => post(`/client/support/${selected}/messages`, { message }),
    onSuccess: () => {
      setMessage("");
      void refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="ab-advisory">
      <div className="ab-support-toolbar">
        <div>
          <h2>Your dedicated support team</h2>
          <p>SPOC and manager from your authorized client assignments.</p>
        </div>
        <ABButton
          disabled={role === "client_viewer"}
          onClick={() => setRequestOpen(true)}
        >
          <MessageCircle size={16} />
          Request Consultation
        </ABButton>
      </div>
      <ErrorAlert error={spocs.error} />
      <div className="ab-contact-cards">
        {(spocs.data?.spocs ?? []).map((s: Doc, i: number) => (
          <Panel key={s.id}>
            <span className="ab-contact-avatar">{s.name.slice(0, 1)}</span>
            <div>
              <Badge tone={i ? "purple" : "blue"}>
                {s.contactRole === "manager"
                  ? "Reporting Manager"
                  : s.contactRole === "backup"
                    ? "Backup SPOC"
                    : s.contactRole === "primary"
                      ? "Primary SPOC"
                      : "Assigned contact"}
              </Badge>
              <h3>{s.name}</h3>
              <p>
                <Mail size={14} />
                {s.email ? (
                  <a href={`mailto:${s.email}`}>{s.email}</a>
                ) : (
                  <span>Contact through support</span>
                )}
              </p>
              <p>
                <Phone size={14} />
                {s.businessContact || "Contact through support"}
              </p>
              <small>{s.designation}</small>
            </div>
          </Panel>
        ))}
        <Panel>
          <Building2 size={36} />
          <div>
            <Badge tone="amber">Operations</Badge>
            <h3>A A GARG & CO</h3>
            <p>Your assigned advisory and operations team.</p>
          </div>
        </Panel>
      </div>
      {!spocs.isPending && !spocs.error && !spocs.data?.spocs.length ? (
        <div className="ab-note">
          No business SPOC has been assigned yet. Your consultation request will
          reach the internal support queue.
        </div>
      ) : null}
      <div className="ab-advisory-overview">
        <div>
          <div className="ab-kpis three">
            <Metric
              label="Open advisory requests"
              value={
                (tickets.data?.tickets ?? []).filter(
                  (t: Doc) => !["CLOSED", "RESOLVED"].includes(t.status),
                ).length
              }
              Icon={MessageCircle}
            />
            <Metric
              label="Awaiting client"
              value={
                (tickets.data?.tickets ?? []).filter(
                  (t: Doc) => t.status === "AWAITING_CLIENT",
                ).length
              }
              Icon={Clock3}
              tone="amber"
            />
            <Metric
              label="Resolved"
              value={
                (tickets.data?.tickets ?? []).filter((t: Doc) =>
                  ["CLOSED", "RESOLVED"].includes(t.status),
                ).length
              }
              Icon={CheckCircle2}
              tone="green"
            />
          </div>
          <Panel title="Advisory Requests">
            <Table headers={["Request", "Subject", "Created", "Status"]}>
              {tickets.data?.tickets.map((t: Doc) => (
                <tr key={t.id}>
                  <td>
                    <button
                      className="ab-text-button"
                      onClick={() => setSelected(t.id)}
                    >
                      {t.id.slice(0, 8)}
                    </button>
                  </td>
                  <td><button className="ab-text-button" onClick={() => setSelected(t.id)}>{t.subject}</button></td>
                  <td>{stamp(t.createdAt)}</td>
                  <td>
                    <Badge>{human(t.status)}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Previous Interactions">
            {thread.data?.messages
              .slice()
              .reverse()
              .map((m: Doc) => (
                <div className="ab-interaction" key={m.id}>
                  <MessageCircle size={20} />
                  <div>
                    <small>
                      {m.actorName} · {stamp(m.createdAt)}
                    </small>
                    <p>{m.message}</p>
                  </div>
                </div>
              ))}
            {!selected ? (
              <p>Select a request to see its actual conversation.</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  reply.mutate();
                }}
              >
                <textarea
                  aria-label="Advisory reply"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Reply to your team…"
                />
                <ABButton
                  type="submit"
                  disabled={
                    role === "client_viewer" ||
                    !message.trim() ||
                    reply.isPending
                  }
                >
                  Send reply
                </ABButton>
              </form>
            )}
          </Panel>
        </div>
        <ConfirmationDialog
          open={requestOpen}
          onClose={() => {
            if (!request.isPending) setRequestOpen(false);
          }}
          title="Request Consultation"
          description="Share your question with your assigned operations team."
          wide
        >
          <form
            className="ab-form ab-consultation-form"
            onSubmit={(e) => {
              e.preventDefault();
              request.mutate(Object.fromEntries(new FormData(e.currentTarget)));
            }}
          >
            <label>
              Subject
              <input
                name="subject"
                minLength={5}
                maxLength={150}
                required
                placeholder="Enter a short subject"
              />
            </label>
            <label>
              Topic
              <select name="topic" required>
                <option>Certificate expiry review</option>
                <option>Procurement clarification</option>
                <option>Data quality review</option>
                <option>Monthly planning</option>
              </select>
            </label>
            <label>
              Company
              <select name="company" required>
                {[
                  ...new Set(
                    data.allDatasets.map((d: Doc) => String(d.company)),
                  ),
                ].map((c) => (
                  <option key={String(c)}>{String(c)}</option>
                ))}
                {!data.allDatasets.length ? (
                  <option>{data.organization.name}</option>
                ) : null}
              </select>
            </label>
            <label>
              Unit
              <select name="unit">
                {[
                  ...new Set(data.allDatasets.map((d: Doc) => String(d.unit))),
                ].map((c) => (
                  <option key={String(c)}>{String(c)}</option>
                ))}
                {!data.allDatasets.length ? (
                  <option>Corporate account</option>
                ) : null}
              </select>
            </label>
            <label>
              Description
              <textarea
                name="description"
                rows={3}
                minLength={10}
                maxLength={3000}
                required
                placeholder="Describe your query or advisory requirement…"
              />
            </label>
            <label>
              Preferred date
              <input type="date" name="date" required />
            </label>
            <ErrorAlert error={request.error} />
            <ABButton
              type="submit"
              disabled={role === "client_viewer" || request.isPending}
            >
              <Send size={16} />
              Submit Request
            </ABButton>
          </form>
        </ConfirmationDialog>
      </div>
      <Panel title="Advisory Request Workflow">
        <div className="ab-advisory-steps">
          {[
            "Request raised",
            "Internal team assignment",
            "In progress",
            "Response shared",
            "Closed",
          ].map((s, i) => (
            <div key={s}>
              <span>{i + 1}</span>
              <strong>{s}</strong>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Subscription({ role }: { role: string }) {
  const allowed = canManage(role),
    sub = clientQuery<Doc>("/client/subscription"),
    billing = clientQuery<Doc>("/client/billing", allowed),
    plans = clientQuery<Doc>("/client/plans"),
    profile = clientQuery<Doc>("/client/billing/profile", allowed),
    term = 12,
    s = sub.data?.subscription;
  return (
    <>
      <CurrentSubscription
        data={sub.data as any}
        pending={sub.isPending}
        allowed={allowed}
      />
      <TestPurchase allowed={allowed} />
      <details
        className="sc-commercial"
        open={sub.data?.displayMode === "LIVE"}
      >
        <summary>
          Live billing & invoices{" "}
          <span>Commercial contracts, tax invoices and billing contact</span>
        </summary>
        <div className="ab-grid two">
          <Panel title="Plan Comparison">
            <div className="ab-grid two">
              {plans.data?.plans.map((p: Doc) => (
                <div className="ab-plan-option" key={p.id}>
                  <Crown size={23} />
                  <h3>{p.name}</h3>
                  <strong>{money(p.monthlyPaise)} / month base</strong>
                  <p>{p.terms}</p>
                  <p>
                    {p.limits.accounts} account slots · {p.limits.registrations}{" "}
                    registrations
                  </p>
                  {allowed ? (
                    <Link
                      className="ab-button secondary"
                      to={`/client/checkout?planId=${p.id}&months=${term}`}
                    >
                      Review Plan
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
            {!plans.data?.plans.length ? (
              <p>
                No reviewed plans have been published. No example price is
                charged.
              </p>
            ) : null}
          </Panel>
          <Panel title="Latest & Previous Invoices">
            <Table headers={["Invoice", "Date", "Amount", "Status", "Action"]}>
              {billing.data?.invoices.map((i: Doc) => (
                <tr key={i.id}>
                  <td>{i.number}</td>
                  <td>{stamp(i.createdAt)}</td>
                  <td>{money(i.total ?? i.amount ?? 0)}</td>
                  <td>
                    <Badge tone="green">Issued</Badge>
                  </td>
                  <td>
                    <PdfDownloadButton
                      href={`/api/client/billing/invoices/${i.id}/pdf`}
                      title="Tax Invoice"
                    />
                  </td>
                </tr>
              ))}
            </Table>
            {!billing.data?.invoices.length ? (
              <p>No issued invoices for this organization.</p>
            ) : null}
          </Panel>
        </div>
        <div className="ab-grid three">
          <Panel title="Payment History">
            <Table headers={["Payment date", "Amount", "Status"]}>
              {billing.data?.payments.map((p: Doc) => (
                <tr key={p.id}>
                  <td>{stamp(p.createdAt)}</td>
                  <td>{money(p.amount)}</td>
                  <td>
                    <Badge tone={p.status === "CAPTURED" ? "green" : "amber"}>
                      {human(p.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Billing Contact">
            <p>{profile.data?.profile?.legalName ?? "Not configured"}</p>
            <p>{profile.data?.profile?.email ?? "No billing email provided"}</p>
            <p>{profile.data?.profile?.contact ?? ""}</p>
            {allowed ? (
              <Link
                className="ab-button secondary"
                to="/client/billing/details"
              >
                Edit billing details
              </Link>
            ) : null}
          </Panel>
          <Panel title="Renewal Reminders">
            <Bell size={28} />
            <p>Renewal date: {s ? stamp(s.endsAt) : "Not set"}</p>
            <p>
              Email reminders require a configured delivery integration. No
              email or renewal charge is simulated.
            </p>
            <Link className="ab-text-link" to="/client/notifications">
              Notification preferences
            </Link>
          </Panel>
        </div>
      </details>
      <ErrorAlert error={sub.error ?? billing.error} />
    </>
  );
}

function Governance({
  data,
  role,
  user,
}: {
  data: Doc;
  role: string;
  user: User;
}) {
  const q = clientQuery<Doc>("/client/axis/governance"),
    [tab, setTab] = useState("Data Governance");
  const names = [
    "Company Profile",
    "Authorized Users",
    "Permissions",
    "Notifications",
    "Reporting",
    "Data Governance",
    "Audit History",
  ];
  return (
    <>
      <div className="ab-tabs governance">
        {names.map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {["Authorized Users", "Company Profile"].includes(tab) ? (
        <div className="ab-settings-legacy">
          <ClientSettings role={role} user={user} />
        </div>
      ) : null}
      {tab === "Data Governance" ? (
        <>
          <div className="ab-grid three">
            <Panel title="Company Profile" icon={<Building2 size={23} />}>
              <div className="ab-plan-name">
                <Building2 size={45} />
                <div>
                  <h2>{data.organization.name}</h2>
                  <p>Authorized users: {q.data?.members.length ?? 0}</p>
                </div>
              </div>
            </Panel>
            <Panel title="Data Coverage" icon={<Layers size={23} />}>
              <Table headers={["Supported source", "Coverage"]}>
                {["Available", "Procurement data", "Procurement Summary"].map(
                  (name) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>
                        <Badge
                          tone={
                            data.datasets.some((d: Doc) =>
                              d.sheets?.some(
                                (s: Doc) => s.name === name && s.supported,
                              ),
                            )
                              ? "green"
                              : "gray"
                          }
                        >
                          {data.datasets.some((d: Doc) =>
                            d.sheets?.some(
                              (s: Doc) => s.name === name && s.supported,
                            ),
                          )
                            ? "Recognized"
                            : "Not published"}
                        </Badge>
                      </td>
                    </tr>
                  ),
                )}
                <tr>
                  <td>Other waste portals</td>
                  <td>
                    <Badge tone="gray">Adapter not configured</Badge>
                  </td>
                </tr>
              </Table>
            </Panel>
            <Panel title="Privacy & Retention" icon={<ShieldCheck size={23} />}>
              <p>
                Agreement status{" "}
                <Badge tone={data.datasets.length ? "green" : "gray"}>
                  {data.datasets.length
                    ? "Authorized on publication"
                    : "No retained snapshot"}
                </Badge>
              </p>
              <p>
                Normalized snapshot storage:{" "}
                {data.datasets.length
                  ? "Available until replaced"
                  : "Not active"}
              </p>
              {data.datasets.map((d: Doc) => (
                <p key={d.id}>
                  {d.unit}: available until the next publication
                </p>
              ))}
              <p>Raw workbook: not archived.</p>
            </Panel>
          </div>
          <div className="ab-grid two">
            <Panel title="Access Permissions">
              <Table headers={["Role", "Permissions"]}>
                <tr>
                  <td>Client Owner / Admin</td>
                  <td>
                    Organization management, billing, views and permitted client
                    actions
                  </td>
                </tr>
                <tr>
                  <td>Operator / Approver</td>
                  <td>
                    Authorized views, support and consultation messages
                  </td>
                </tr>
                <tr>
                  <td>Viewer</td>
                  <td>Read-only analytics and reports</td>
                </tr>
              </Table>
            </Panel>
            <Panel title="Retention policy">
              <p>{q.data?.policy}</p>
              <p>
                Client dashboard publication is separate from the internal BOT
                file deletion policy.
              </p>
            </Panel>
          </div>
        </>
      ) : null}
      {tab === "Permissions" ? (
        <Panel title="Your access">
          <h3>{human(role.replace("client_", ""))}</h3>
          <p>
            Every request is scoped on the backend to your authenticated
            organization. Changing a URL does not grant access to another
            client's snapshots.
          </p>
          <p>
            BOT controls are restricted to internal staff. Client access does
            not expose portal credentials.
          </p>
        </Panel>
      ) : null}
      {tab === "Notifications" && q.data ? (
        <Preferences preferences={q.data.preferences} role={role} />
      ) : null}
      {tab === "Reporting" && q.data ? (
        <ReportingPreferences preferences={q.data.preferences} role={role} />
      ) : null}
      {["Audit History", "Data Governance"].includes(tab) ? (
        <Panel title="Audit History" icon={<Clock3 size={23} />}>
          <Table
            headers={["Timestamp", "User", "Action", "Evidence reference"]}
          >
            {q.data?.history.map((h: Doc) => (
              <tr key={h.id}>
                <td>{stamp(h.createdAt)}</td>
                <td>{h.actorName}</td>
                <td>{human(h.action.replaceAll(".", " "))}</td>
                <td>{h.targetId}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      ) : null}
      <ErrorAlert error={q.error} />
    </>
  );
}

function ReportingPreferences({
  preferences,
  role,
}: {
  preferences: Doc;
  role: string;
}) {
  const [p, setP] = useState(preferences),
    cache = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      post(
        "/client/axis/preferences",
        Object.fromEntries(
          [
            "email",
            "inApp",
            "certificates",
            "actions",
            "advisory",
            "reports",
            "data",
            "quality",
            "quietStart",
            "quietEnd",
            "frequency",
            "formatPdf",
            "formatExcel",
          ].map((k) => [k, p[k]]),
        ),
      ),
    onSuccess: () => {
      toast.success(
        "Reporting preferences saved. Reports remain available on demand.",
      );
      void cache.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("/client/axis"),
      });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Panel title="Reporting Preferences">
      <label>
        Frequency
        <select
          value={p.frequency}
          onChange={(e) => setP({ ...p, frequency: e.target.value })}
        >
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
        </select>
      </label>
      <label className="ab-toggle-row">
        PDF reports
        <input
          type="checkbox"
          checked={!!p.formatPdf}
          onChange={(e) => setP({ ...p, formatPdf: e.target.checked })}
        />
      </label>
      <label className="ab-toggle-row">
        Excel reports
        <input
          type="checkbox"
          checked={!!p.formatExcel}
          onChange={(e) => setP({ ...p, formatExcel: e.target.checked })}
        />
      </label>
      <p>
        These preferences control requested report formats. Automatic email
        delivery is not configured; no scheduled delivery is claimed.
      </p>
      <ABButton
        disabled={role === "client_viewer" || save.isPending}
        onClick={() => save.mutate()}
      >
        Save reporting preferences
      </ABButton>
    </Panel>
  );
}
