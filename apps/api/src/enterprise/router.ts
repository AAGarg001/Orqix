import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import {workflowReportPdf, pdfLogoUpload} from '../pdf/documents.js';
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { EnterpriseService, failure } from "./service.js";
import {
  roles,
  permissions,
  grants,
  can,
  publicUser,
  requirePermission,
} from "./permissions.js";
import { PrivateFiles, validateExcelArchive } from "./files.js";
import { transition, type WorkflowState } from "./workflow.js";
import type { User } from "../store.js";
import { operationsRouter } from "./operations-router.js";
import type { Runner } from "../runner.js";
import { intelligenceRouter } from "./intelligence.js";
import {tasksRouter} from './tasks.js';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 },
});
const teamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().regex(/^[A-Z0-9-]{2,20}$/),
  department: z.string().min(1),
  leadId: z.string().optional(),
  description: z.string().max(500).default(""),
  capacity: z.coerce.number().int().min(1).max(1000).default(100),
  active: z.boolean().default(true),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#075CF5"),
  defaultRole: z.enum(roles).default("executive"),
  reporting: z.boolean().default(true),
  visibility: z.enum(["team", "management"]).default("team"),
});
const userSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().transform((v) => v.toLowerCase()),
  username: z.string().regex(/^[a-zA-Z0-9_.-]{3,40}$/),
  mobile: z.string().regex(/^\+?[0-9]{10,15}$/),
  role: z.enum(roles),
  teamId: z.uuid(),
  department: z.string().min(1),
  reportingManagerId: z.string().optional(),
  active: z.boolean().default(true),
});
export function enterpriseRouter(service: EnterpriseService, runner: Runner) {
  const router = Router(),
    files = new PrivateFiles();
  router.use('/tasks',tasksRouter(service));
  router.use("/operations", operationsRouter(service, runner));
  router.use(intelligenceRouter(service));
  router.get("/deletion-requests", async (_req, res) => {
    const a = res.locals.user,
      all = await service.repo.list("deletionrequests");
    res.json({
      requests: all.filter(
        (r) =>
          r.requestedBy === a.id ||
          r.managerId === a.id ||
          can(a, "clients.view.all"),
      ),
    });
  });
  router.post("/deletion-requests/:id/review", async (req, res) => {
    const actor = res.locals.user;
    requirePermission(actor, "approvals.approve");
    const input = z
      .object({
        decision: z.enum(["approve", "reject"]),
        remarks: z.string().min(3).max(2000),
        version: z.number().int(),
      })
      .parse(req.body);
    const request = await service.repo.get(
      "deletionrequests",
      String(req.params.id),
    );
    if (
      !request ||
      (request.managerId !== actor.id && !can(actor, "clients.view.all"))
    )
      failure("Request not found.", 404);
    if (request.requestedBy === actor.id)
      failure("Self approval prohibited.", 403);
    if (request.status !== "PENDING") failure("Request already reviewed.");
    const updated = await service.repo.update(
      "deletionrequests",
      request.id,
      input.version,
      {
        status: input.decision === "approve" ? "APPROVED" : "REJECTED",
        reviewedBy: actor.id,
        reviewedAt: new Date().toISOString(),
        remarks: input.remarks,
      },
    );
    await service.audit(actor, "delete.approval_" + input.decision, request.id);
    res.json({ request: updated });
  });
  router.get("/dashboard", async (_req, res) =>
    res.json(await service.dashboard(res.locals.user)),
  );
  router.get("/users", async (_req, res) => {
    requirePermission(res.locals.user, "users.view");
    res.json({ users: (await service.users(res.locals.user)).map(publicUser) });
  });
  router.post("/users", async (req, res) => {
    const result = await service.createUser(
      res.locals.user,
      userSchema.parse(req.body),
    );
    res
      .status(201)
      .json({
        ...result,
        setupLink: `${req.get("Origin")}/setup-password?token=${result.setupToken}`,
        emailSent: false,
        emailStatus:
          "Use the one-time setup link. Organizational invitation email is not configured for this operation.",
      });
  });
  router.patch("/users/:id", async (req, res) => {
    const actor: User = res.locals.user;
    requirePermission(actor, "users.edit");
    const id = z.string().parse(req.params.id),
      target = await service.store.user(id);
    if (!target) failure("User not found.", 404);
    if (target.role === "super_admin" && actor.role !== "super_admin")
      failure("Super Admin account is protected.", 403);
    const input = userSchema
      .partial()
      .extend({ permissions: z.array(z.enum(permissions)).optional() })
      .parse(req.body);
    if(input.active!==undefined)requirePermission(actor,'users.deactivate');
    if(input.permissions?.some(p=>!can(actor,p)))failure('You cannot grant a permission you do not hold.',403);
    if (input.role === "super_admin" && actor.role !== "super_admin")
      failure("Cannot grant Super Admin.", 403);
    if (id === actor.id && input.active === false)
      failure("You cannot deactivate your own account.");
    if (input.reportingManagerId) {
      if (input.reportingManagerId === id)
        failure("User cannot report to themselves.");
      const all = await service.store.allUsers();
      let manager = all.find((u) => u.id === input.reportingManagerId);
      const visited = new Set([id]);
      while (manager) {
        if (visited.has(manager.id))
          failure("Reporting hierarchy cannot contain cycles.");
        visited.add(manager.id);
        if (!manager.reportingManagerId) break;
        manager = all.find((u) => u.id === manager!.reportingManagerId);
      }
      const selected = all.find((u) => u.id === input.reportingManagerId);
      if (!selected || !can(selected, "approvals.review"))
        failure("Invalid reporting manager.");
    }
    const updated = await service.store.updateUser(id, input);
    if(input.active===false)await service.store.deleteUserSessions(id);
    await service.audit(actor, "user.updated", id, {
      fields: Object.keys(input),
    });
    res.json({ user: publicUser(updated!) });
  });
  router.post("/users/:id/reset-link", async (req, res) => {
    requirePermission(res.locals.user, "users.edit");
    const user = await service.store.user(String(req.params.id));
    if (!user) failure("User not found.", 404);
    if (user.role === "super_admin" && res.locals.user.role !== "super_admin")
      failure("Super Admin is protected.", 403);
    const token = randomBytes(32).toString("hex");
    const { tokenHash } = await import("../auth.js");
    await service.repo.create("setuptokens", {
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      used: false,
    });
    await service.audit(res.locals.user, "user.reset_link", user.id);
    res.json({
      setupLink: `${req.get("Origin")}/setup-password?token=${token}`,
    });
  });
  router.get("/teams", async (_req, res) => {
    const actor: User = res.locals.user;
    const rows = await service.repo.list("teams");
    res.json({
      teams: can(actor, "teams.manage")
        ? rows
        : rows.filter((t) => t.id === actor.teamId || t.leadId === actor.id),
    });
  });
  router.post("/teams", async (req, res) =>
    res
      .status(201)
      .json({
        team: await service.createTeam(
          res.locals.user,
          teamSchema.parse(req.body),
        ),
      }),
  );
  router.patch("/teams/:id", async (req, res) => {
    requirePermission(res.locals.user, "teams.manage");
    const t = await service.repo.get("teams", String(req.params.id));
    if (!t) failure("Team not found.", 404);
    const input = teamSchema
      .partial()
      .extend({ version: z.number().int() })
      .parse(req.body);
    const team = await service.repo.update("teams", t.id, input.version, input);
    await service.audit(res.locals.user, "team.updated", team.id);
    res.json({ team });
  });
  router.get("/departments", async (_req, res) =>
    res.json({ departments: await service.repo.list("departments") }),
  );
  router.post("/departments", async (req, res) => {
    requirePermission(res.locals.user, "teams.manage");
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
        code: z.string().trim().min(2).max(20),
      })
      .parse(req.body);
    const department = await service.repo.create("departments", input);
    await service.audit(res.locals.user, "department.created", department.id);
    res.status(201).json({ department });
  });
  router.get("/roles", async (_req, res) => {
    requirePermission(res.locals.user, "users.view");
    const configured=await service.repo.list('roles');
    res.json({
      roles: roles.map((id) => ({
        id,
        name: id.replaceAll("_", " "),
        permissions: configured.find(r=>r.roleKey===id)?.permissions??grants[id],
      })),
      permissions,
    });
  });
  router.post('/roles/:role/permissions',async(req,res)=>{const actor:User=res.locals.user;requirePermission(actor,'settings.manage');const role=z.enum(roles).parse(req.params.role),input=z.object({permissions:z.array(z.enum(permissions)).max(permissions.length)}).parse(req.body);if(role==='super_admin'&&actor.role!=='super_admin')failure('Only Super Admin can change its role policy.',403);if(input.permissions.some(p=>!can(actor,p)))failure('Cannot grant permissions you do not hold.',403);if(role==='super_admin'&&['settings.manage','users.create','users.edit','users.view'].some(p=>!input.permissions.includes(p as any)))failure('Core Super Admin recovery permissions must remain enabled.');const old=(await service.repo.list('roles',{roleKey:role}))[0];const record=old?await service.repo.update('roles',old.id,old.version,input):await service.repo.create('roles',{roleKey:role,...input});req.app.locals.clearRoleCache?.();await service.audit(actor,'role.permissions_updated',record.id,{role,permissions:input.permissions});res.json({role:record});});
  router.get("/clients", async (_req, res) => {
    const actor: User = res.locals.user,
      a = await service.assignments(actor),
      clients = await service.repo.list("clients");
    res.json({
      clients: can(actor, "clients.view.all")
        ? clients
        : clients.filter((c) => a.some((a) => a.clientId === c.id)),
    });
  });
  router.post("/clients", async (req, res) => {
    requirePermission(res.locals.user, "clients.allocate");
    const input = z
      .object({
        name: z.string().trim().min(2),
        code: z.string().trim().min(2),
      })
      .parse(req.body);
    const client = await service.repo.create("clients", input);
    await service.audit(res.locals.user, "client.created", client.id);
    res.status(201).json({ client });
  });
  router.get("/accounts", async (_req, res) => {
    const actor: User = res.locals.user,
      a = await service.assignments(actor),
      accounts = await service.repo.list("cpcbaccounts");
    res.json({
      accounts: can(actor, "clients.view.all")
        ? accounts
        : accounts.filter((c) => a.some((a) => a.accountId === c.id)),
    });
  });
  router.post("/accounts", async (req, res) => {
    requirePermission(res.locals.user, "clients.allocate");
    const input = z
      .object({
        clientId: z.uuid(),
        cpcbId: z.string().trim().min(3).max(100),
        label: z.string().min(2),
        applicationId: z.string().optional(),
        active: z.boolean().default(true),
      })
      .parse(req.body);
    if (!(await service.repo.get("clients", input.clientId)))
      failure("Client not found.");
    const account = await service.repo.create("cpcbaccounts", input);
    await service.audit(res.locals.user, "account.created", account.id);
    res.status(201).json({ account });
  });
  router.patch("/accounts/:id", async (req, res) => {
    requirePermission(res.locals.user, "clients.allocate");
    const a = await service.repo.get("cpcbaccounts", String(req.params.id));
    if (!a) failure("Account not found.", 404);
    const input = z
      .object({ applicationId: z.string().min(1), version: z.number().int() })
      .parse(req.body);
    const account = await service.repo.update(
      "cpcbaccounts",
      a.id,
      input.version,
      { applicationId: input.applicationId },
    );
    await service.audit(res.locals.user, "account.identity_configured", a.id);
    res.json({ account });
  });
  router.get("/assignments", async (_req, res) =>
    res.json({ assignments: await service.assignments(res.locals.user) }),
  );
  router.get("/allocation/template", async (_req, res) => {
    requirePermission(res.locals.user, "clients.allocate");
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet("Assignments");
    sheet.addRow([
      "Client Name",
      "CPCB ID",
      "User Email",
      "Client Code",
      "Financial Year",
      "Priority",
      "Due Date",
    ]);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    res
      .set(
        "Content-Disposition",
        'attachment; filename="Client_Allocation_Template.xlsx"',
      )
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(Buffer.from(await workbook.xlsx.writeBuffer()));
  });
  router.post(
    "/allocation/preview",
    upload.single("file"),
    async (req, res) => {
      requirePermission(res.locals.user, "clients.allocate");
      if (!req.file || !req.file.originalname.toLowerCase().endsWith(".xlsx"))
        failure("Select an XLSX file.", 400);
      validateExcelArchive(req.file.buffer);
      const w = new ExcelJS.Workbook();
      await w.xlsx.load(req.file.buffer as never);
      const sheet = w.worksheets[0];
      if (!sheet || sheet.rowCount > 5001)
        failure("Workbook must contain 1–5000 data rows.", 400);
      const headers = (sheet.getRow(1).values as any[]).slice(1).map(String);
      for (const h of ["Client Name", "CPCB ID", "User Email"])
        if (!headers.includes(h)) failure(`Missing column: ${h}`, 400);
      const rows: Record<string, unknown>[] = [];
      sheet.eachRow((row, n) => {
        if (n === 1) return;
        const values: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          const c = row.getCell(i + 1);
          if (c.type === ExcelJS.ValueType.Formula)
            failure("Use literal values, not formulas.", 400);
          values[h] = c.text;
        });
        rows.push(values);
      });
      if (!rows.length) failure("No allocation rows.", 400);
      res.json({
        preview: await service.importPreview(
          res.locals.user,
          rows,
          req.file.originalname,
        ),
      });
    },
  );
  router.post("/allocation/:id/revalidate", async (req, res) => {
    const input = z.object({ overrides: z.array(z.object({ row: z.number().int().min(2), email: z.email() })).max(5000).default([]) }).parse(req.body);
    res.json({ preview: await service.importRevalidate(res.locals.user, String(req.params.id), input.overrides) });
  });
  router.post("/allocation/:id/commit", async (req, res) => {
    const input = z
      .object({ confirmReassign: z.boolean().default(false), validOnly: z.boolean().default(false) })
      .parse(req.body);
    res.json({
      import: await service.importCommit(
        res.locals.user,
        String(req.params.id),
        input.confirmReassign,
        input.validOnly,
      ),
    });
  });
  router.get("/allocation/history", async (_req, res) => {
    requirePermission(res.locals.user, "clients.allocate");
    res.json({ imports: await service.repo.list("imports") });
  });
  router.post("/workflows/:id/submit", async (req, res) => {
    const input = z
      .object({
        stage: z.enum(["validation", "reconciliation"]),
        evidenceIds: z.array(z.uuid()).min(1),
      })
      .parse(req.body);
    res
      .status(201)
      .json({
        approval: await service.submitApproval(
          res.locals.user,
          String(req.params.id),
          input.stage,
          input.evidenceIds,
        ),
      });
  });
  router.post("/workflows/:id/verify-upload", async (req, res) => {
    requirePermission(res.locals.user, "approvals.approve");
    const input = z
      .object({
        evidenceIds: z.array(z.uuid()).min(1),
        remarks: z.string().min(20),
        confirmation:z.literal('PORTAL RECORDS CHECKED'),
        version: z.number().int(),
      })
      .parse(req.body);
    const w = await service.workflow(res.locals.user, String(req.params.id));
    const assignment=await service.assignment(res.locals.user,String(req.params.id));if(assignment.userId===res.locals.user.id)failure('An independent authorized manager must verify the upload.',403);
    for (const id of input.evidenceIds) {
      const f = await service.repo.get("filerecords", id);
      if (!f || f.assignmentId !== w.assignmentId)
        failure("Evidence not authorized.", 403);
    }
    res.json({
      workflow: await service.repo.update(
        "financialyearworkflows",
        w.id,
        input.version,
        {
          ...transition(w as unknown as WorkflowState, "upload.verified"),
          uploadVerifiedBy: res.locals.user.id,
          uploadVerificationRemarks: input.remarks,
          uploadEvidenceIds: input.evidenceIds,
          blockingErrors:0,
        },
      ),
    });
    await service.audit(res.locals.user, "upload.manually_verified", w.id, {
      evidenceIds: input.evidenceIds,
    });
  });
  router.get("/approvals", async (_req, res) =>
    res.json({ approvals: await service.approvals(res.locals.user) }),
  );
  router.post("/approvals/:id/review", async (req, res) => {
    const input = z
      .object({
        decision: z.enum(["approve", "reject"]),
        remarks: z.string().max(2000),
        version: z.number().int(),
      })
      .parse(req.body);
    res.json({
      approval: await service.review(
        res.locals.user,
        String(req.params.id),
        input.decision,
        input.remarks,
        input.version,
      ),
    });
  });
  router.post("/files", upload.single("file"), async (req, res) => {
    const assignmentId = z.uuid().parse(req.body.assignmentId);
    await service.assignment(res.locals.user, assignmentId, true);
    if (!req.file) failure("Select evidence.", 400);
    const pdf = req.file.originalname.toLowerCase().endsWith(".pdf");
    if (
      pdf &&
      !req.file.buffer
        .subarray(0, 1024)
        .toString()
        .trimStart()
        .startsWith("%PDF-")
    )
      failure("Invalid PDF header.", 400);
    if (!pdf) {
      if (!req.file.originalname.toLowerCase().endsWith(".xlsx"))
        failure("Only PDF/XLSX evidence is supported.", 400);
      validateExcelArchive(req.file.buffer);
    }
    const stored = await files.put(
      req.file.buffer,
      req.file.originalname,
      pdf
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const file = await service.repo.create("filerecords", {
      ...stored,
      assignmentId,
      ownerId: res.locals.user.id,
      purpose: "evidence",
    });
    await service.audit(res.locals.user, "evidence.uploaded", file.id);
    res.status(201).json({ file });
  });
  router.get("/files", async (req, res) => {
    const a = await service.assignments(res.locals.user);
    const all = await service.repo.list("filerecords");
    res.json({
      files: all
        .filter((f) => a.some((a) => a.id === f.assignmentId))
        .map(({ key, ...f }) => f),
    });
  });
  router.get("/files/:id/download", async (req, res) => {
    const f = await service.repo.get("filerecords", String(req.params.id));
    if (!f) failure("File not found.", 404);
    const scope=await service.assignments(res.locals.user);const pending=await service.repo.list('approvals',{managerId:res.locals.user.id});
    if(!scope.some(a=>a.id===f.assignmentId)&&!pending.some(a=>(a.evidenceIds as string[]|undefined)?.includes(f.id)))failure('File not found.',404);
    res
      .set({
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(f.name))}`,
      })
      .type(String(f.contentType))
      .send(await files.get(f as any));
  });
  router.get("/notifications", async (_req, res) =>
    res.json({
      notifications: await service.repo.list("notifications", {
        recipientId: res.locals.user.id,
      }),
    }),
  );
  router.post("/notifications/:id/read", async (req, res) => {
    const n = await service.repo.get("notifications", String(req.params.id));
    if (!n || n.recipientId !== res.locals.user.id)
      failure("Notification not found.", 404);
    res.json({
      notification: n.read
        ? n
        : await service.repo.update("notifications", n.id, n.version, {
            read: true,
          }),
    });
  });
  router.get("/audit", async (_req, res) => {
    requirePermission(res.locals.user, "audit.view");
    res.json({ events: await service.repo.list("auditlogs") });
  });
  router.get("/reports", async (_req, res) => {
    requirePermission(res.locals.user, "reports.view.self");
    res.json(await service.dashboard(res.locals.user));
  });
  router.post("/reports/export",pdfLogoUpload.single("logo"),async(req,res)=>{
    requirePermission(res.locals.user,'reports.view.self');
    if(req.query.format!=='pdf')failure('Logo customization is supported for PDF exports only.',400);
    const d=await service.dashboard(res.locals.user);
    const records=(d.rows as any[]).map(r=>[r.client?.name,r.account?.cpcbId,r.financialYear,r.employee,r.workflow?.stage,r.workflow?.businessStatus,Math.round(r.progress)]);
    res.attachment('AAGarg_Workflow_Report.pdf').type('application/pdf').send(await workflowReportPdf(records,res.locals.user.name,req.file?.buffer));
  });
  router.get("/reports/export", async (req, res) => {
    requirePermission(res.locals.user, "reports.view.self");
    const d = await service.dashboard(res.locals.user),
      w = new ExcelJS.Workbook(),
      s = w.addWorksheet("Workflow report");
    const format=z.enum(['xlsx','csv','pdf']).default('xlsx').parse(req.query.format);
    const headers=['Client','CPCB ID','Financial Year','Employee','Stage','Status','Progress'];
    const records=(d.rows as any[]).map(r=>[r.client?.name,r.account?.cpcbId,r.financialYear,r.employee,r.workflow?.stage,r.workflow?.businessStatus,Math.round(r.progress)]);
    if(format==='csv'){const cell=(v:unknown)=>{let text=String(v??'');if(/^[=+@\t\r-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};res.set('Content-Disposition','attachment; filename="ORQIX_Workflow_Report.csv"').type('text/csv').send('\uFEFF'+[headers,...records].map(r=>r.map(cell).join(',')).join('\r\n'));return;}
    if(format==='pdf'){res.attachment('AAGarg_Workflow_Report.pdf').type('application/pdf').send(await workflowReportPdf(records,res.locals.user.name));return;}
    s.addRow([
      "Client",
      "CPCB ID",
      "Financial Year",
      "Employee",
      "Stage",
      "Status",
      "Progress",
    ]);
    for (const row of d.rows) {
      const r = row as any;
      s.addRow([
        r.client?.name,
        r.account?.cpcbId,
        r.financialYear,
        r.employee,
        r.workflow?.stage,
        r.workflow?.businessStatus,
        r.progress,
      ]);
    }
    res
      .set(
        "Content-Disposition",
        'attachment; filename="ORQIX_Workflow_Report.xlsx"',
      )
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(Buffer.from(await w.xlsx.writeBuffer()));
  });
  return router;
}
