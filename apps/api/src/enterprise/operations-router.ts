import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { z } from "zod";
import type { Runner } from "../runner.js";
import { EnterpriseService, failure } from "./service.js";
import { requirePermission, can } from "./permissions.js";
import { PrivateFiles, validateExcelArchive } from "./files.js";
import { transition, type WorkflowState } from "./workflow.js";
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const mode = z.enum(["pwp", "pibo", "sales", "sales_export"]);
export function operationsRouter(service: EnterpriseService, runner: Runner) {
  const router = Router(),
    files = new PrivateFiles();
  router.use("/:jobId", async (req, res, next) => {
    const job = await service.store.job(String(req.params.jobId));
    if (!job || job.userId !== res.locals.user.id || !job.assignmentId)
      failure("Authorized bot session not found.", 404);
    await service.assignment(res.locals.user, job.assignmentId, true);
    res.locals.job = job;
    next();
  });
  router.get("/:jobId/schema", async (req, res) => {
    requirePermission(res.locals.user, "bot.upload.execute");
    res.json(
      await (
        await runner.call(
          res.locals.job.id,
          "/ops/schema?mode=" + mode.parse(req.query.mode),
        )
      ).json(),
    );
  });
  router.get("/:jobId/template", async (req, res) => {
    requirePermission(res.locals.user, "bot.upload.execute");
    const m = mode.parse(req.query.mode),
      schema = (await (
        await runner.call(res.locals.job.id, "/ops/schema?mode=" + m)
      ).json()) as { columns: string[] };
    const w = new ExcelJS.Workbook(),
      s = w.addWorksheet(m);
    s.addRow(schema.columns);
    s.views = [{ state: "frozen", ySplit: 1 }];
    res
      .set("Content-Disposition", `attachment; filename="${m}_template.xlsx"`)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(Buffer.from(await w.xlsx.writeBuffer()));
  });
  router.post("/:jobId/file", fileUpload.single("file"), async (req, res) => {
    requirePermission(res.locals.user, "bot.upload.execute");
    if (res.locals.job.kind !== "upload") failure("Select an upload session.");
    if (!req.file) failure("File required.", 400);
    const name = req.file.originalname;
    if (/[\\/]/.test(name) || name.length > 160)
      failure("Unsafe filename.", 400);
    const isPdf = name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      if (
        !req.file.buffer
          .subarray(0, 1024)
          .toString()
          .trimStart()
          .startsWith("%PDF-")
      )
        failure("Invalid PDF.", 400);
    } else {
      if (!name.toLowerCase().endsWith(".xlsx"))
        failure("Only XLSX/PDF supported.", 400);
      validateExcelArchive(req.file.buffer);
    }
    await runner.sendFile(res.locals.job.id, name, req.file.buffer);
    const file = await service.repo.create("filerecords", {
      ...(await files.put(
        req.file.buffer,
        name,
        isPdf
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )),
      assignmentId: res.locals.job.assignmentId,
      ownerId: res.locals.user.id,
      purpose: "upload-input",
      jobId: res.locals.job.id,
    });
    await service.audit(res.locals.user, "upload.file_received", file.id, {
      jobId: res.locals.job.id,
    });
    await service.repo.transaction(async repo=>{const w=(await repo.list('financialyearworkflows',{assignmentId:res.locals.job.assignmentId}))[0];if(w){const next=transition(w as unknown as WorkflowState,'evidence.changed');await repo.update('financialyearworkflows',w.id,w.version,{...next,stage:w.extraction==='COMPLETED'?'DATA_EXTRACTION':w.stage});for(const approval of await repo.list('approvals',{workflowId:w.id}))if(approval.status==='PENDING')await repo.update('approvals',approval.id,approval.version,{status:'INVALIDATED',reason:'Upload input evidence changed'});}});
    res.json({ filename: name, fileId: file.id });
  });
  router.post("/:jobId/validate", async (req, res) => {
    requirePermission(res.locals.user, "bot.upload.execute");
    const input = z
      .object({ mode, filename: z.string().min(1).max(160) })
      .parse(req.body);
    const preview = (await (
      await runner.call(res.locals.job.id, "/ops/validate", input)
    ).json()) as {
      hash: string;
      total: number;
      valid: number;
      rows: unknown[];
    };
    const batch = await service.repo.create("uploadbatches", {
      jobId: res.locals.job.id,
      assignmentId: res.locals.job.assignmentId,
      userId: res.locals.user.id,
      mode: input.mode,
      hash: preview.hash,
      total: preview.total,
      valid: preview.valid,
      status: "VALIDATED",
      preview,
    });
    await service.audit(res.locals.user, "upload.validated", batch.id, {
      total: preview.total,
      valid: preview.valid,
    });
    res.json({ batch });
  });
  router.post("/:jobId/upload", async (req, res) => {
    requirePermission(res.locals.user, "bot.upload.execute");
    const input = z
      .object({
        batchId: z.uuid(),
        confirmation: z.literal("SUBMIT VALIDATED RECORDS"),
      })
      .parse(req.body);
    const batch = await service.repo.get("uploadbatches", input.batchId),
      job = res.locals.job;
    if (!batch || batch.jobId !== job.id || batch.userId !== res.locals.user.id)
      failure("Batch not found.", 404);
    if (
      batch.status !== "VALIDATED" ||
      batch.valid !== batch.total ||
      job.status !== "ready"
    )
      failure("Verified login and a valid, unattempted batch are required.");
    const w = await service.workflow(res.locals.user, job.assignmentId);
    const next = transition(w as unknown as WorkflowState, "upload.start");
    await service.repo.transaction(async repo=>{for(const row of (batch.preview as any).rows){if(!row.fingerprint)failure('Revalidate the workbook with the current adapter.');const existing=(await repo.list('uploadrows',{assignmentId:job.assignmentId,fingerprint:row.fingerprint}))[0];if(existing&&!['FAILED','NOT_ATTEMPTED'].includes(String(existing.status)))failure('This record was previously attempted and requires portal reconciliation before retry.');if(existing)await repo.update('uploadrows',existing.id,existing.version,{status:'ATTEMPTING',jobId:job.id});else await repo.create('uploadrows',{assignmentId:job.assignmentId,jobId:job.id,fingerprint:row.fingerprint,row:row.row,status:'ATTEMPTING'});}await repo.update('uploadbatches',batch.id,batch.version,{status:'ATTEMPTING',startedBy:res.locals.user.id});await repo.update('financialyearworkflows',w.id,w.version,next);});
    try {
      await runner.call(job.id, "/ops/upload", { hash: batch.hash });
      await runner.update(job.id, {
        status: "running",
        stage: "Uploading validated source records…",
      });
    } catch (error) {
      const fresh = await service.repo.get("financialyearworkflows", w.id);
      if (fresh)
        await service.repo.update(
          "financialyearworkflows",
          fresh.id,
          fresh.version,
          transition(fresh as unknown as WorkflowState, "upload.failed"),
        );
      throw error;
    }
    await service.audit(res.locals.user, "upload.execution_started", batch.id);
    res.json({ ok: true });
  });
  router.post("/:jobId/delete/fetch", async (req, res) => {
    requirePermission(res.locals.user, "bot.delete.request");
    if (res.locals.job.kind !== "delete") failure("Select a deletion session.");
    if(res.locals.job.status!=='ready')failure('Verify the selected account identity before fetching records.');
    const input = z
      .object({ year: z.string().regex(/^20\d{2}$/) })
      .parse(req.body);
    const snapshot = await (
      await runner.call(res.locals.job.id, "/ops/delete/fetch", input)
    ).json();
    await service.repo.create('deletionsnapshots',{...snapshot,jobId:res.locals.job.id,ownerId:res.locals.user.id,assignmentId:res.locals.job.assignmentId});
    await service.audit(
      res.locals.user,
      "delete.records_fetched",
      res.locals.job.id,
      { year: input.year },
    );
    res.json({ snapshot });
  });
  router.post("/:jobId/delete/request", async (req, res) => {
    requirePermission(res.locals.user, "bot.delete.request");
    const input = z
      .object({
        hash: z.string().length(64),
        year: z.string().regex(/^20\d{2}$/),
        ids: z.array(z.string().length(64)).min(1).max(500),
        reason: z.string().min(10).max(2000),
      })
      .parse(req.body);
    const actor = res.locals.user,
      manager = actor.reportingManagerId
        ? await service.store.user(actor.reportingManagerId)
        : null;
    if (!manager || !can(manager, "approvals.approve"))
      failure(
        "Configure an active reporting manager before requesting deletion.",
      );
    const snapshot=(await service.repo.list('deletionsnapshots',{jobId:res.locals.job.id})).find(s=>s.hash===input.hash&&s.year===input.year);
    if(!snapshot||new Set(input.ids).size!==input.ids.length)failure('Fetch the exact record snapshot before requesting deletion.');
    const records=snapshot.records as {id:string;values:unknown}[];
    if(input.ids.some(id=>!records.some(r=>r.id===id)))failure('Selected IDs are not in the fetched portal snapshot.',400);
    const previous=await service.repo.list('deletionrequests',{assignmentId:res.locals.job.assignmentId});
    if(previous.some(r=>['EXECUTING','REQUIRES_VERIFICATION'].includes(String(r.status))&&(r.ids as string[]).some(id=>input.ids.includes(id))))failure('An earlier attempt for these records requires manual reconciliation before another request.');
    const request = await service.repo.create("deletionrequests", {
      ...input,
      records:records.filter(r=>input.ids.includes(r.id)),
      jobId: res.locals.job.id,
      assignmentId: res.locals.job.assignmentId,
      requestedBy: actor.id,
      managerId: manager.id,
      status: "PENDING",
    });
    await service.audit(actor, "delete.approval_requested", request.id, {
      count: input.ids.length,
    });
    await service.notify(
      manager.id,
      actor,
      `${actor.name} requested deletion approval`,
      "/approvals",
      "delete.requested",
    );
    res.status(201).json({ request });
  });
  router.post("/:jobId/delete/execute", async (req, res) => {
    requirePermission(res.locals.user, "bot.delete.execute");
    if(res.locals.job.status!=='ready')failure('Verified CPCB session is required.');
    const input = z
      .object({
        requestId: z.uuid(),
        confirmation: z.literal("DELETE APPROVED RECORDS"),
        version: z.number().int(),
      })
      .parse(req.body);
    const request = await service.repo.get("deletionrequests", input.requestId);
    if (
      !request ||
      request.jobId !== res.locals.job.id ||
      request.requestedBy !== res.locals.user.id
    )
      failure("Deletion request not found.", 404);
    if (request.status !== "APPROVED" || request.version !== input.version)
      failure("A current manager approval is required.");
    await service.repo.update("deletionrequests", request.id, request.version, {
      status: "EXECUTING",
      executedBy: res.locals.user.id,
    });
    await service.audit(res.locals.user, "delete.confirmed", request.id, {
      hash: request.hash,
      ids: request.ids,
    });
    try {
      const result = await (
        await runner.call(res.locals.job.id, "/ops/delete/execute", {
          hash: request.hash,
          ids: request.ids,
          confirmation: input.confirmation,
        })
      ).json();
      const evidence = await service.repo.create("deletionresults", {
        requestId: request.id,
        assignmentId: request.assignmentId,
        jobId: request.jobId,
        ...result,
      });
      const current = await service.repo.get("deletionrequests", request.id);
      await service.repo.update(
        "deletionrequests",
        request.id,
        current!.version,
        { status: (result as {verified?:boolean}).verified?'VERIFIED':'REQUIRES_VERIFICATION', resultId: evidence.id },
      );
      res.json({ result: evidence });
    } catch (error) {
      const current = await service.repo.get("deletionrequests", request.id);
      await service.repo.update(
        "deletionrequests",
        request.id,
        current!.version,
        { status: "REQUIRES_VERIFICATION" },
      );
      throw error;
    }
  });
  return router;
}
