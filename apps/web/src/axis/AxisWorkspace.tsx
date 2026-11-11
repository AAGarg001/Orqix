import "./publishing.css";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CloudUpload,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { api, post } from "../api";
import {
  Button,
  PageHeader,
  DataTable,
  ErrorAlert,
  ConfirmationDialog,
  StatusBadge,
} from "../orqix/ui";
type Doc = Record<string, any>;
export function AxisWorkspace() {
  const reviewSection = useRef<HTMLElement>(null);
  const cache = useQueryClient(),
    options = useQuery({
      queryKey: ["/axis/options"],
      queryFn: () => api<{ targets: Doc[] }>("/axis/options"),
    }),
    history = useQuery({
      queryKey: ["/axis/datasets"],
      queryFn: () => api<{ datasets: Doc[] }>("/axis/datasets"),
      refetchInterval: 15000,
    }),
    actions = useQuery({
      queryKey: ["/axis/consultations"],
      queryFn: () => api<{ actions: Doc[] }>("/axis/consultations"),
    });
  const [company, setCompany] = useState(""),
    [target, setTarget] = useState(""),
    [unitLabel, setUnitLabel] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [dataset, setDataset] = useState<Doc | null>(null),
    [review, setReview] = useState<Doc | null>(null),
    [remark, setRemark] = useState("");
  const thread = useQuery({
    queryKey: ["/axis/consultations", review?.id],
    queryFn: () =>
      api<{ action: Doc; comments: Doc[]; documents: Doc[] }>(`/axis/consultations/${review!.id}`),
    enabled: !!review,
    refetchOnMount: "always",
    refetchInterval: 10000,
  });
  const [asOf, setAsOf] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16),
  );
  const selected = options.data?.targets.find((t) => t.key === target),
    reset = () => {
      setDataset(null);
    };
  useEffect(() => {
    if (dataset)
      reviewSection.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }, [dataset?.id, dataset?.status]);
  const refresh = () =>
    cache.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith("/axis/"),
    });
  const preview = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append("file", file!);
      body.append("targetKey", target);
      body.append("unitLabel", unitLabel);
      body.append("asOf", new Date(asOf).toISOString());
      return api<{ dataset: Doc }>("/axis/preview", { method: "POST", body });
    },
    onSuccess: (r) => {
      setDataset(r.dataset);
      void refresh();
      toast.success(
        r.dataset.status === "PREVIEW_ONLY"
          ? "Workbook validated. Link the client organization before publishing."
          : "Workbook validated. Review source identity before publishing.",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const publish = useMutation({
    mutationFn: () =>
      post<{ dataset: Doc }>(`/axis/${dataset!.id}/publish`, {
        version: dataset!.version,

      }),
    onSuccess: (r) => {
      setDataset(r.dataset);
      cache.setQueryData<{ datasets: Doc[] }>(["/axis/datasets"], (old) => ({ datasets: [r.dataset, ...(old?.datasets ?? []).filter(d => d.id !== r.dataset.id)] }));
      void refresh();
      toast.success("Data published to the client portal.");
    },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (status: string) =>
      api<{action:Doc}>(`/axis/consultations/${review!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: thread.data!.action.version,
          status,
          remarks: remark,
        }),
      }),
    onSuccess: async (r) => {
      cache.setQueryData<{actions:Doc[]}>(["/axis/consultations"], old => old ? {
        actions:old.actions.map(item=>item.id===r.action.id?{...item,...r.action}:item),
      }:old);
      await refresh();
      setReview(null);
      toast.success("Consultation updated.");
    },
    onError: (e) => {toast.error(e.message);void thread.refetch();},
  });
  return (
    <div className="client-publishing">
      <PageHeader
        title="Client Data Publishing"
        subtitle="Upload the final BOT Excel, select the client and unit, then publish it to their portal."
      />
      <div className="publishing-upload">
        <section className="oq-card">
          <h2>
            <CloudUpload size={22} /> Upload extracted workbook
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              preview.mutate();
            }}
          >
            <label>
              Client name
              <select
                required
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setTarget("");
                  reset();
                }}
              >
                <option value="">Select authorized client</option>
                {[
                  ...new Set(
                    options.data?.targets.map((t) => String(t.company)) ?? [],
                  ),
                ].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Unit / CPCB registration / financial year
              <select
                required
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setUnitLabel(
                    options.data?.targets.find((t) => t.key === e.target.value)
                      ?.unit ?? "",
                  );
                  reset();
                }}
              >
                <option value="">Select unit registration</option>
                {options.data?.targets
                  .filter((t) => t.company === company)
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.unit} · {t.cpcbId} · {t.financialYear}
                      {!t.tenantId ? " — organization link required" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <div className="oq-form-grid">
              <label>
                Unit display name
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={unitLabel}
                  onChange={(e) => {
                    setUnitLabel(e.target.value);
                    reset();
                  }}
                  placeholder="e.g. Noida Plant / Unit ID 27121"
                />
              </label>
              <label>
                Data extracted as of
                <input
                  required
                  type="datetime-local"
                  value={asOf}
                  onChange={(e) => {
                    setAsOf(e.target.value);
                    reset();
                  }}
                />
              </label>
            </div>
            <label className="oq-dropzone">
              <FileSpreadsheet size={32} />
              <strong>{file?.name ?? "Choose final extracted Excel"}</strong>
              <span>
                Available + Procurement data + Procurement Summary · XLSX
              </span>
              <input
                type="file"
                accept=".xlsx"
                required
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  reset();
                }}
              />
            </label>
            {selected && !selected.tenantId ? (
              <div className="oq-info amber">
                An administrator must link this client under{" "}
                <Link to="/admin/organizations">Client Organizations</Link>{" "}
                before publication. You can preview and validate the workbook
                now.
              </div>
            ) : null}
            <ErrorAlert error={options.error ?? preview.error} />
            <Button
              type="submit"
              disabled={!file || !target || preview.isPending}
            >
              {preview.isPending
                ? "Reading and validating…"
                : "Preview & Validate"}
            </Button>
          </form>
        </section>
      </div>
      {dataset ? (
        <section
          className="oq-card"
          ref={reviewSection}
          style={{ scrollMarginTop: 88 }}
        >
          <div className="oq-card-heading">
            <h2>Workbook ready to publish</h2>
            <StatusBadge value={dataset.status} />
          </div>
          <div className="oq-form-grid">
            <p>
              <strong>Client:</strong> {dataset.company}
              <br />
              <strong>Unit:</strong> {dataset.unit}
              <br />
              <strong>Registration:</strong> {dataset.cpcbId}
              <br />
              <strong>FY:</strong> {dataset.financialYear}
            </p>
            <p>
              <strong>Workbook entities:</strong>{" "}
              {dataset.entities?.join(", ") || "Not provided"}
              <br />
              <strong>Workbook units:</strong>{" "}
              {dataset.units?.join(", ") || "Not provided"}
              <br />
              <strong>Parsed rows:</strong>{" "}
              {dataset.rowCount?.toLocaleString("en-IN")}
              <br />

            </p>
          </div>
          {dataset.identityWarning ? (
            <div className="oq-info amber">
              Source entity name differs from the selected client label. Verify
              the legal identity and unit before continuing.
            </div>
          ) : null}
          <DataTable<Doc>
            rows={dataset.sheets ?? []}
            columns={[
              { key: "name", label: "Sheet" },
              { key: "rows", label: "Source rows" },
              {
                key: "supported",
                label: "Analytics coverage",
                render: (r) =>
                  r.supported ? "Recognized" : "Source / unsupported",
              },
              {
                key: "missing",
                label: "Missing columns",
                render: (r) => r.missing?.join(", ") || "—",
              },
            ]}
          />
          {dataset.errors?.length ? (
            <div className="oq-info amber">
              Source reports incomplete sections: {dataset.errors.join("; ")}
            </div>
          ) : null}
          {dataset.status === "DRAFT" ? (
            <>
              <ErrorAlert error={publish.error} />
              <Button disabled={publish.isPending}
                onClick={() => publish.mutate()}
              >
                <CheckCircle2 size={16} />
                {publish.isPending ? "Publishing…" : "Publish to client portal"}
              </Button>
            </>
          ) : dataset.status === "PREVIEW_ONLY" ? (
            <div className="oq-info amber">
              Validation complete. This preview is temporary and has not been
              saved or published. An administrator must link this client in{" "}
              <Link to="/admin/organizations">Client Organizations</Link>. Then
              return here and click Preview &amp; Validate again to create a
              publishable draft.
              <Button
                type="button"
                onClick={() => {
                  void refresh();
                  toast.success("Refreshing client organization links.");
                }}
              >
                Refresh client links
              </Button>
            </div>
          ) : dataset.status === "PUBLISHED" ? (
            <p>
              Publication complete. The client can view this snapshot from
              Business Dashboard.
            </p>
          ) : (
            <p>
              This snapshot is {String(dataset.status).toLowerCase()} and is not
              available as an active client publication.
            </p>
          )}
        </section>
      ) : null}
      <h2>Upload & Publication History</h2>
      <DataTable
        rows={history.data?.datasets ?? []}
        loading={history.isPending}
        error={history.error}
        columns={[
          { key: "company", label: "Client" },
          { key: "unit", label: "Unit" },
          { key: "cpcbId", label: "Registration" },
          { key: "financialYear", label: "FY" },
          { key: "fileName", label: "Workbook" },
          { key: "publishedAt", label: "Published", render: r => r.publishedAt ? new Date(r.publishedAt).toLocaleString("en-IN") : "Not published" },
          {
            key: "status",
            label: "Status",
            render: (r) => <StatusBadge value={r.status} />,
          },
        ]}
      />
      <h2>Client Consultation Requests</h2>
      <DataTable
        rows={actions.data?.actions ?? []}
        columns={[
          { key: "title", label: "Subject" },
          { key: "requestedBy", label: "Requested by" },
          { key: "priority", label: "Priority" },
          { key: "spocName", label: "Assigned SPOC" },
          { key: "company", label: "Client" },
          { key: "unit", label: "Topic" },
          { key: "status", label: "Status" },
          {
            key: "review",
            label: "Respond",
            render: (r) => (
              <Button
                variant="secondary"
                onClick={() => {
                  update.reset();
                  setReview(r);
                  setRemark("");
                }}
              >
                Open consultation
              </Button>
            ),
          },
        ]}
      />
      <ConfirmationDialog
        open={!!review}
        onClose={() => setReview(null)}
        title={review?.title ?? "Consultation"}
        description="Update the consultation status. Add a reply when needed."
      >
        <p>{review?.message}</p>
        <h3>Client comments</h3>
        {thread.data?.comments
          .slice()
          .reverse()
          .map((c) => (
            <p key={c.id}>
              <strong>{c.author}</strong>: {c.message}
            </p>
          ))}
        <label>
          Reply to client (optional)
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </label>
        <ErrorAlert error={update.error ?? thread.error} />
        <div className="oq-actions">
          {["IN_PROGRESS", "AWAITING_CLIENT", "RESOLVED"].map((s) => (
            <Button
              key={s}
              disabled={!thread.data?.action || thread.isFetching || !!thread.error || update.isPending}
              onClick={() => update.mutate(s)}
            >
              {s.replaceAll("_", " ")}
            </Button>
          ))}
        </div>
      </ConfirmationDialog>
    </div>
  );
}
