import { BlobButton } from "./BlobButton";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  X,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <BlobButton
      {...props}
      className={`oq-button ${variant} ${props.className ?? ""}`}
    >
      {children}
    </BlobButton>
  );
}
export function StatusBadge({ value }: { value: unknown }) {
  const label = String(value ?? "Not Started").replaceAll("_", " "),
    v = label.toLowerCase();
  const tone =
    /approved|completed|success|verified|active$/.test(v) &&
    !v.includes("inactive")
      ? "success"
      : /failed|reject|inactive|blocked/.test(v)
        ? "danger"
        : /approval/.test(v)
          ? "purple"
          : /pending|waiting|partial|review|verification/.test(v)
            ? "warning"
            : "blue";
  return (
    <span className={`oq-badge ${tone}`}>
      <i />
      {label}
    </span>
  );
}
export function EmptyState({
  title = "No records yet",
  description = "Records will appear here when authorized work is added.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="oq-empty">
      <Inbox size={31} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function ErrorAlert({ error }: { error: unknown }) {
  return error ? (
    <div className="oq-error" role="alert">
      <AlertCircle size={18} />
      <span>{error instanceof Error ? error.message : String(error)}</span>
    </div>
  ) : null;
}
export function SkeletonLoader() {
  return (
    <div className="oq-skeleton oq-loading-surface" role="status" aria-label="Loading authorized records">
      <span className="oq-sr-only">Loading authorized records</span>
      <div className="oq-skeleton-heading"/>
      <div className="oq-skeleton-cards">{[0,1,2].map(i=><div key={i}/>)}</div>
      <div className="oq-skeleton-rows">{[0,1,2,3].map(i=><div key={i}/>)}</div>
    </div>
  );
}
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="oq-page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="oq-actions">{actions}</div>
    </div>
  );
}
export function MetricCard({
  label,
  value,
  icon,
  color = "blue",
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  color?: string;
}) {
  return (
    <div className="oq-metric">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className={`oq-metric-icon ${color}`}>{icon}</div>
    </div>
  );
}
export function ConfirmationDialog({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="oq-overlay" />
        <Dialog.Content className={`oq-modal ${wide ? "wide" : ""}`}>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>
            {description ?? "Review the details before continuing."}
          </Dialog.Description>
          <Dialog.Close className="oq-close" aria-label="Close dialog">
            <X size={20} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "number"
    | "select"
    | "checkbox"
    | "password"
    | "textarea"
    | "color";
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: unknown;
};
export function FormDialog({
  title,
  open,
  onClose,
  fields,
  onSubmit,
  pending,
  error,
  extra,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  fields: Field[];
  onSubmit: (values: any) => void;
  pending?: boolean;
  error?: unknown;
  extra?: ReactNode;
}) {
  const schema = useMemo(
    () =>
      z.object(
        Object.fromEntries(
          fields.map((f) => [
            f.name,
            f.type === "checkbox"
              ? z.boolean()
              : f.type === "number"
                ? z.coerce.number().min(1)
                : f.type === "email"
                  ? z.email()
                  : f.required
                    ? z.string().min(1, `${f.label} is required`)
                    : z.string().optional(),
          ]),
        ),
      ),
    [fields],
  );
  const form = useForm({
    resolver: zodResolver(schema) as any,
    defaultValues: Object.fromEntries(
      fields.map((f) => [
        f.name,
        f.defaultValue ?? (f.type === "checkbox" ? true : ""),
      ]),
    ),
  });
  // Populate the selected record when opening, without resetting a user's
  // in-progress edits when background queries refresh the field definitions.
  useEffect(()=>{if(open)form.reset(Object.fromEntries(fields.map(f=>[f.name,f.defaultValue??(f.type==='checkbox'?true:'')])));},[open,form.reset]);
  return (
    <ConfirmationDialog open={open} onClose={onClose} title={title}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="oq-form-grid">
          {fields.map((f) => (
            <label key={f.name} className={f.type === "textarea" ? "full" : ""}>
              {f.label}
              {f.required ? " *" : ""}
              {f.type === "select" ? (
                <select aria-label={f.label} aria-required={f.required} {...form.register(f.name)}>
                  <option value="">Select {f.label.toLowerCase()}</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea aria-label={f.label} aria-required={f.required} {...form.register(f.name)} />
              ) : (
                <input aria-label={f.label} aria-required={f.required} type={f.type ?? "text"} {...form.register(f.name)} />
              )}
              <small className="oq-field-error">
                {String(form.formState.errors[f.name]?.message ?? "")}
              </small>
            </label>
          ))}
        </div>
        {extra}
        <ErrorAlert error={error} />
        <div className="oq-modal-footer">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending}>
            {pending ? <LoaderCircle className="oq-spin" size={16} /> : null}
            Save {title.toLowerCase().replace("create ", "")}
          </Button>
        </div>
      </form>
    </ConfirmationDialog>
  );
}
export function DataTable<T extends object>({
  rows,
  columns,
  searchPlaceholder = "Search records…",
  loading = false,
  error,
}: {
  rows: T[];
  columns: { key: string; label: string; render?: (row: T) => ReactNode }[];
  searchPlaceholder?: string;
  loading?: boolean;
  error?: unknown;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        JSON.stringify(row).toLowerCase().includes(search.toLowerCase()),
      ),
    [rows, search],
  );
  const defs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        accessorFn: (row: any) => row[c.key],
        header: c.label,
        cell: (ctx) =>
          c.render ? c.render(ctx.row.original) : String(ctx.getValue() ?? "—"),
      })),
    [columns],
  );
  const table = useReactTable({
    data: filtered,
    columns: defs,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });
  return (
    <section className="oq-card oq-table-card">
      <div className="oq-table-toolbar">
        <span>{filtered.length.toLocaleString()} {filtered.length===1?'record':'records'}{search?` of ${rows.length.toLocaleString()}`:''}</span>
        <label className="oq-search">
          <Search size={16} />
          <input
            aria-label="Search table"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <ErrorAlert error={error} />
      {loading ? (
        <SkeletonLoader />
      ) : !filtered.length ? (
        <EmptyState title={search?"No matching records":"No records yet"} description={search?"Try another search or clear the current query.":"Records will appear here when authorized work is added."}/>
      ) : (
        <>
          <div className="oq-table-scroll">
            <table>
              <thead>
                {table.getHeaderGroups().map((g) => (
                  <tr key={g.id}>
                    {g.headers.map((h) => (
                      <th key={h.id} scope="col" aria-sort={h.column.getIsSorted()==='asc'?'ascending':h.column.getIsSorted()==='desc'?'descending':'none'}>
                        <BlobButton onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(
                            h.column.columnDef.header,
                            h.getContext(),
                          )}
                          <ArrowDownUp size={11} />
                        </BlobButton>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((r) => (
                  <tr key={r.id}>
                    {r.getVisibleCells().map((c) => (
                      <td key={c.id}>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="oq-pagination">
            <span>
              Showing {table.getState().pagination.pageIndex * 10 + 1}–
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * 10,
                filtered.length,
              )}{" "}
              of {filtered.length}
            </span>
            <div>
              <Button
                variant="ghost"
                aria-label="Previous page"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft size={15} />
              </Button>
              <span>
                {table.getState().pagination.pageIndex + 1} /{" "}
                {table.getPageCount()}
              </span>
              <Button
                variant="ghost"
                aria-label="Next page"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
export const workflowStages=['Client Assigned','Data Extraction','Upload','Completed'];
export function WorkflowStepper({workflow}:{workflow?:Record<string,any>}) {
  const complete=[!!workflow,workflow?.extraction==='COMPLETED',workflow?.upload==='VERIFIED',workflow?.businessStatus==='Completed'];
  return <div className="oq-stepper">{workflowStages.map((stage,i)=><div key={stage} className={complete[i]?'done':'pending'}><span>{i+1}</span><strong>{stage}</strong><small>{complete[i]?'Completed':'Not started'}</small></div>)}</div>;
}
export function PermissionGuard({
  allowed,
  children,
}: {
  allowed: boolean;
  children: ReactNode;
}) {
  return allowed ? (
    <>{children}</>
  ) : (
    <EmptyState
      title="Access restricted"
      description="Your account does not have permission to access this module."
    />
  );
}
