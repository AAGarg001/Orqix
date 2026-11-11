import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, post } from "../api";
import type { Session, AssignmentView, Doc } from "./types";
import { Button, ErrorAlert } from "./ui";
export function UploadVerification({
  assignmentId,
  version,
  evidenceIds,
  uploadState,
  onVerified,
}: {
  assignmentId: string;
  version: number;
  evidenceIds: string[];
  uploadState: string;
  onVerified: () => void;
}) {
  const me = useQuery({
      queryKey: ["/me"],
      queryFn: () => api<Session>("/me"),
    }),
    [remarks, setRemarks] = useState(""),
    [checked, setChecked] = useState(false),
    client = useQueryClient();
  const verify = useMutation({
    mutationFn: () =>
      post(`/platform/workflows/${assignmentId}/verify-upload`, {
        version,
        evidenceIds,
        remarks,
        confirmation: "PORTAL RECORDS CHECKED",
      }),
    onSuccess: () => {
      toast.success("Manager portal verification recorded");
      void client.invalidateQueries();
      onVerified();
    },
  });
  if (
    !me.data?.user?.permissions.includes("approvals.approve") ||
    uploadState !== "AWAITING_VERIFICATION"
  )
    return null;
  return (
    <section className="oq-card">
      <h3>Manager Portal Verification</h3>
      <p>
        Use this only after independently checking the complete expected upload
        against CPCB and selecting supporting evidence above.
      </p>
      <label>
        Portal verification remarks
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          minLength={20}
        />
      </label>
      <label className="oq-check-label">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        I checked all expected portal records and attached evidence of the
        verified outcome.
      </label>
      <ErrorAlert error={verify.error} />
      <Button
        variant="secondary"
        disabled={
          !checked ||
          !evidenceIds.length ||
          remarks.length < 20 ||
          verify.isPending
        }
        onClick={() => verify.mutate()}
      >
        Record independent portal verification
      </Button>
    </section>
  );
}

export function UploadReview({ row }: { row: AssignmentView }) {
  const files = useQuery({
      queryKey: ["/platform/files"],
      queryFn: () => api<{ files: Doc[] }>("/platform/files"),
    }),
    client = useQueryClient(),
    [selected, setSelected] = useState<string[]>([]);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      body.append("assignmentId", row.id);
      return api("/platform/files", { method: "POST", body });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["/platform/files"] });
    },
  });
  return (
    <section className="oq-card">
      <h2>Verify selected client upload</h2>
      <p>
        Confirm the uploaded records in CPCB before marking this workflow
        complete.
      </p>
      <label>
        Upload verification evidence
        <input
          type="file"
          accept=".xlsx,.pdf"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.currentTarget.value = "";
          }}
        />
      </label>
      <ErrorAlert error={upload.error ?? files.error} />
      {files.data?.files
        .filter((f) => f.assignmentId === row.id)
        .map((file) => (
          <label key={file.id} className="oq-check-label">
            <input
              type="checkbox"
              checked={selected.includes(file.id)}
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked
                    ? [...old, file.id]
                    : old.filter((id) => id !== file.id),
                )
              }
            />
            {file.name}
          </label>
        ))}
      <UploadVerification
        assignmentId={row.id}
        version={row.workflow?.version ?? 0}
        evidenceIds={selected}
        uploadState={row.workflow?.upload ?? ""}
        onVerified={() => {
          setSelected([]);
          void client.invalidateQueries();
        }}
      />
    </section>
  );
}
