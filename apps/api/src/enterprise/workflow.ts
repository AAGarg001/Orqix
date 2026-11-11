export const stages = [
  "CLIENT_ASSIGNED",
  "DATA_EXTRACTION",
  "UPLOAD",
  "COMPLETED",
] as const;
export type WorkflowState = {
  stage: string;
  businessStatus: "Not Started" | "Pending" | "Completed";
  extraction:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "FAILED"
    | "PARTIAL";
  validation: "NOT_STARTED" | "WAITING_APPROVAL" | "APPROVED" | "REJECTED";
  upload:
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "AWAITING_VERIFICATION"
    | "VERIFIED"
    | "FAILED";
  reconciliation: "NOT_STARTED" | "WAITING_APPROVAL" | "APPROVED" | "REJECTED";
  evidenceVersion: number;
  blockingErrors: number;
  [key: string]: unknown;
};
export const initialWorkflow = (): WorkflowState => ({
  stage: "CLIENT_ASSIGNED",
  businessStatus: "Not Started",
  extraction: "NOT_STARTED",
  validation: "NOT_STARTED",
  upload: "NOT_STARTED",
  reconciliation: "NOT_STARTED",
  evidenceVersion: 0,
  blockingErrors: 0,
});
export function transition(w: WorkflowState, event: string): WorkflowState {
  const next = { ...w, businessStatus: "Pending" as const };
  const fail = (message: string): never => {
    throw Object.assign(new Error(message), { status: 409 });
  };
  switch (event) {
    case "extraction.start":
      return {
        ...next,
        stage: "DATA_EXTRACTION",
        extraction: "IN_PROGRESS",
        validation: "NOT_STARTED",
        upload: "NOT_STARTED",
        reconciliation: "NOT_STARTED",
        evidenceVersion: w.evidenceVersion + 1,
      };
    case "extraction.complete":
      if (w.extraction !== "IN_PROGRESS") fail("Extraction was not running.");
      return { ...next, stage: "DATA_EXTRACTION", extraction: "COMPLETED" };
    case "extraction.partial":
      return { ...next, stage: "DATA_EXTRACTION", extraction: "PARTIAL" };
    case "extraction.failed":
      return { ...next, stage: "DATA_EXTRACTION", extraction: "FAILED" };
    case "validation.submit":
      if (w.extraction !== "COMPLETED" || w.blockingErrors)
        fail("Successful extraction and no blocking errors are required.");
      if (w.validation === "WAITING_APPROVAL" || w.validation === "APPROVED")
        fail("Validation is already submitted or approved.");
      return { ...next, stage: "VALIDATION", validation: "WAITING_APPROVAL" };
    case "validation.approve":
      if (w.validation !== "WAITING_APPROVAL")
        fail("Validation is not awaiting approval.");
      return { ...next, stage: "UPLOAD", validation: "APPROVED" };
    case "validation.reject":
      return {
        ...next,
        stage: "VALIDATION",
        validation: "REJECTED",
        upload: "NOT_STARTED",
        reconciliation: "NOT_STARTED",
      };
    case "upload.start":
      if (w.extraction !== "COMPLETED")
        fail("Successful extraction is required before upload.");
      if (w.upload === "AWAITING_VERIFICATION" || w.upload === "VERIFIED")
        fail("Reconcile the previous upload before any retry.");
      return { ...next, stage: "UPLOAD", upload: "IN_PROGRESS" };
    case "upload.submitted":
      if (w.upload !== "IN_PROGRESS") fail("Upload was not started.");
      return { ...next, stage: "UPLOAD", upload: "AWAITING_VERIFICATION" };
    case "upload.failed":
      return { ...next, stage: "UPLOAD", upload: "FAILED" };
    case "upload.verified":
      if (w.upload !== "AWAITING_VERIFICATION")
        fail("Upload submission evidence is required.");
      if(w.extraction !== 'COMPLETED' || w.blockingErrors)
        fail('Successful extraction and no blocking errors are required for completion.');
      return { ...next, stage: "COMPLETED", upload: "VERIFIED", businessStatus: "Completed" };
    case "reconciliation.submit":
      if (
        w.upload !== "VERIFIED" ||
        w.validation !== "APPROVED" ||
        w.blockingErrors
      )
        fail(
          "Verified upload, validation approval and no blockers are required.",
        );
      if (
        w.reconciliation === "WAITING_APPROVAL" ||
        w.reconciliation === "APPROVED"
      )
        fail("Reconciliation already submitted.");
      return {
        ...next,
        stage: "RECONCILIATION",
        reconciliation: "WAITING_APPROVAL",
      };
    case "reconciliation.approve":
      if (
        w.reconciliation !== "WAITING_APPROVAL" ||
        w.validation !== "APPROVED" ||
        w.upload !== "VERIFIED" ||
        w.extraction !== "COMPLETED" ||
        w.blockingErrors
      )
        fail("All mandatory conditions and Step 5 approval are required.");
      return {
        ...next,
        stage: "COMPLETED",
        reconciliation: "APPROVED",
        businessStatus: "Completed",
      };
    case "reconciliation.reject":
      return { ...next, stage: "RECONCILIATION", reconciliation: "REJECTED" };
    case "evidence.changed":
      return {
        ...next,
        stage: w.extraction === 'COMPLETED' ? 'DATA_EXTRACTION' : 'CLIENT_ASSIGNED',
        validation: "NOT_STARTED",
        upload: "NOT_STARTED",
        reconciliation: "NOT_STARTED",
        evidenceVersion: w.evidenceVersion + 1,
      };
    default:
      return fail("Unsupported workflow transition.");
  }
}
export function progress(w: WorkflowState) {
  if(w.upload === 'VERIFIED' && w.businessStatus === 'Completed') return 100;
  if(w.upload === 'IN_PROGRESS' || w.upload === 'AWAITING_VERIFICATION') return 75;
  if(w.extraction === 'COMPLETED') return 50;
  if(w.extraction === 'IN_PROGRESS' || w.extraction === 'PARTIAL') return 25;
  return 0;
}
