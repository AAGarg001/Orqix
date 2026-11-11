import { randomBytes } from "node:crypto";
import { Repository, type RecordDoc } from "./repository.js";
import {
  can,
  requirePermission,
  publicUser,
  type Role,
} from "./permissions.js";
import {
  initialWorkflow,
  transition,
  progress,
  type WorkflowState,
} from "./workflow.js";
import { hashPassword, tokenHash } from "../auth.js";
import type { Store, User, Job } from "../store.js";
export function failure(message: string, status = 409): never {
  throw Object.assign(new Error(message), { status });
}
export class EnterpriseService {
  currentFinancialYear(now=new Date()){const india=new Date(now.getTime()+330*60000),start=india.getUTCMonth()>=3?india.getUTCFullYear():india.getUTCFullYear()-1;return `${start}-${String((start+1)%100).padStart(2,'0')}`;}
  constructor(
    public repo: Repository,
    public store: Store,
  ) {}
  async audit(
    actor: User,
    action: string,
    targetId: string,
    details: Record<string, unknown> = {},
    repo = this.repo,
  ) {
    return repo.create("auditlogs", {
      actorId: actor.id,
      actorName: actor.name,
      action,
      targetId,
      details,
    });
  }
  async notify(
    recipientId: string,
    actor: User,
    title: string,
    link: string,
    type: string,
    repo = this.repo,
  ) {
    return repo.create("notifications", {
      recipientId,
      actorId: actor.id,
      title,
      message: title,
      link,
      type,
      read: false,
      priority: "normal",
    });
  }
  async users(actor: User) {
    const users = (await this.store.allUsers()).filter(u=>u.accountKind!=='client');
    if (can(actor, "clients.view.all")) return users;
    const scope = await this.teamScope(actor);
    return users.filter((u) => scope.has(u.id));
  }
  async teamScope(actor: User) {
    const all = await this.store.allUsers(),
      ids = new Set([actor.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of all)
        if (
          u.reportingManagerId &&
          ids.has(u.reportingManagerId) &&
          !ids.has(u.id)
        ) {
          ids.add(u.id);
          changed = true;
        }
    }
    return ids;
  }
  async assignments(actor: User) {
    const assignments = await this.repo.list("clientassignments");
    if (can(actor, "clients.view.all")) return assignments;
    const scope = can(actor, "reports.view.team")
      ? await this.teamScope(actor)
      : new Set([actor.id]);
    return assignments.filter((a) => scope.has(String(a.userId)));
  }
  async assignment(actor: User, id: string, execute = false) {
    const a = (await this.assignments(actor)).find((a) => a.id === id);
    if (!a) failure("Assignment not found.", 404);
    if (execute && a.userId !== actor.id && !can(actor, "clients.allocate"))
      failure("Only the assigned operator may run this client workflow.", 403);
    return a;
  }
  async workflow(actor: User, id: string) {
    const a = await this.assignment(actor, id);
    const w = (
      await this.repo.list("financialyearworkflows", { assignmentId: a.id })
    )[0];
    if (!w) failure("Workflow not found.", 404);
    return w;
  }
  async dashboard(actor: User) {
    const assignments = await this.assignments(actor),
      workflows = await this.repo.list("financialyearworkflows"),
      clients = await this.repo.list("clients"),
      accounts = await this.repo.list("cpcbaccounts"),
      users = await this.users(actor);
    const rows = assignments.map((a) => {
      const w = workflows.find((w) => w.assignmentId === a.id);
      return {
        ...a,
        client: clients.find((c) => c.id === a.clientId),
        account: accounts.find((c) => c.id === a.accountId),
        employee: users.find((u) => u.id === a.userId)?.name,
        workflow: w,
        progress: w ? progress(w as unknown as WorkflowState) : 0,
      };
    });
    const scopedJobs = (await this.store.list()).filter((j) =>
      assignments.some((a) => a.id === j.assignmentId),
    );
    return {
      rows,
      metrics: {
        clients: new Set(assignments.map((a) => a.clientId)).size,
        cpcbIds: new Set(assignments.map((a) => a.accountId)).size,
        total: rows.length,
        completed: rows.filter(
          (r) => r.workflow?.businessStatus === "Completed",
        ).length,
        pending: rows.filter((r) => r.workflow?.businessStatus === "Pending")
          .length,
        notStarted: rows.filter(
          (r) => r.workflow?.businessStatus === "Not Started",
        ).length,
        failedJobs: scopedJobs.filter((j) => j.status === "failed").length,
        awaitingApproval: rows.filter(
          (r) =>
            r.workflow?.validation === "WAITING_APPROVAL" ||
            r.workflow?.reconciliation === "WAITING_APPROVAL",
        ).length,
      },
      jobs: scopedJobs,
    };
  }
  async createTeam(actor: User, input: Record<string, unknown>) {
    requirePermission(actor, "teams.manage");
    if ((await this.repo.list("teams")).some((t) => t.code === input.code))
      failure("Team code already exists.");
    if (input.leadId) {
      const lead = await this.store.user(String(input.leadId));
      if (!lead || lead.active === false)
        failure("Team lead must be an active user.");
    }
    return this.repo.transaction(async (r) => {
      const t = await r.create("teams", input);
      await this.audit(actor, "team.created", t.id, {}, r);
      return t;
    });
  }
  async createUser(
    actor: User,
    input: {
      name: string;
      email: string;
      username: string;
      mobile: string;
      role: Role;
      teamId: string;
      department: string;
      reportingManagerId?: string;
      active: boolean;
    },
  ) {
    requirePermission(actor, "users.create");
    if (input.role === "super_admin" && actor.role !== "super_admin")
      failure("Only Super Admin can create a Super Admin.", 403);
    const team = await this.repo.get("teams", input.teamId);
    if (!team || team.active === false) failure("Select an active team.");
    if (
      (await this.store.allUsers()).some((u) => u.username === input.username)
    )
      failure("Username already exists.");
    const members = (await this.store.allUsers()).filter(
      (u) => u.teamId === team.id && u.active !== false,
    );
    if (members.length >= Number(team.capacity ?? 100))
      failure("Team capacity reached.");
    if (input.reportingManagerId) {
      const m = await this.store.user(input.reportingManagerId);
      if (!m || m.active === false || !can(m, "approvals.review"))
        failure(
          "Reporting manager must be active and able to review approvals.",
        );
      if (m.teamId && m.teamId !== team.id && !can(m, "clients.view.all"))
        failure("Reporting manager must lead the selected team.");
    }
    const user = await this.store.createUser({
      ...input,
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(randomBytes(48).toString("hex")),
      createdBy: actor.id,
    });
    const token = randomBytes(32).toString("hex");
    await this.repo.create("setuptokens", {
      userId: user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      used: false,
    });
    await this.audit(actor, "user.created", user.id, {
      role: input.role,
      managerId: input.reportingManagerId ?? null,
    });
    return { user: publicUser(user), setupToken: token };
  }
  async setupPassword(token: string, password: string) {
    const t = (
      await this.repo.list("setuptokens", { tokenHash: tokenHash(token) })
    )[0];
    if (!t || t.used || Date.parse(String(t.expiresAt)) <= Date.now())
      failure("Setup link is invalid or expired.", 400);
    await this.repo.update("setuptokens", t.id, t.version, { used: true });
    await this.store.updateUser(String(t.userId), {
      passwordHash: await hashPassword(password),
    });
    await this.store.deleteUserSessions(String(t.userId));
  }
  async importPreview(
    actor: User,
    rows: Record<string, unknown>[],
    fileName: string,
  ) {
    requirePermission(actor, "clients.allocate");
    const users = (await this.store.allUsers()).filter(u=>u.accountKind!=='client'),
      existing = await this.repo.list("clientassignments"),
      accounts = await this.repo.list("cpcbaccounts"),
      seen = new Set<string>();
    const results = rows.map((row, index) => {
      const clientName = String(row["Client Name"] ?? "").trim(),
        cpcbId = String(row["CPCB ID"] ?? "").trim(),
        email = String(row["User Email"] ?? "")
          .trim()
          .toLowerCase(),
        financialYear = String(row["Financial Year"] || this.currentFinancialYear()).trim(),
        key = cpcbId + "|" + financialYear,
        issues: string[] = [];
      const user = users.find((u) => u.email.trim().toLowerCase() === email);
      if (!clientName) issues.push("Client Name required");
      if (!/^[A-Za-z0-9_@./-]{3,100}$/.test(cpcbId))
        issues.push("Invalid CPCB ID");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        issues.push("Invalid email");
      if (!user) issues.push("Unknown user");
      else if (user.active === false) issues.push("Inactive user");
      if (!/^20\d{2}-\d{2}$/.test(financialYear)||Number(financialYear.slice(5))!==(Number(financialYear.slice(0,4))+1)%100)
        issues.push("Financial Year must be YYYY-YY");
      if (seen.has(key)) issues.push("Duplicate CPCB ID + FY in file");
      seen.add(key);
      const account = accounts.find((a) => a.cpcbId === cpcbId),
        assignment = existing.find(
          (a) =>
            a.accountId === account?.id && a.financialYear === financialYear,
        );
      const reassign = !!assignment && assignment.userId !== user?.id;
      return {
        row: index + 2,
        clientName,
        cpcbId,
        email,
        financialYear,
        userId: user?.id,
        clientCode: String(row["Client Code"] ?? cpcbId),
        priority: String(row.Priority ?? "normal"),
        dueDate: String(row["Due Date"] ?? ""),
        issues,
        reassign,
        existingAssignmentId: assignment?.id,
        existingVersion: assignment?.version,
      };
    });
    const batch = await this.repo.create("imports", {
      actorId: actor.id,
      fileName,
      rows: results,
      status: "PREVIEW",
      total: results.length,
      valid: results.filter((r) => !r.issues.length).length,
      errors: results.filter((r) => r.issues.length).length,
      reassignments: results.filter((r) => r.reassign).length,
    });
    await this.audit(actor, "allocation.preview", batch.id);
    return batch;
  }
  async importCommit(actor: User, id: string, confirmReassign: boolean, validOnly = false) {
    requirePermission(actor, "clients.allocate");
    return this.repo.transaction(async (repo) => {
      const batch = await repo.get("imports", id);
      if (!batch || batch.actorId !== actor.id)
        failure("Import not found.", 404);
      if (batch.status === "COMMITTED" || batch.status === "PARTIALLY_COMMITTED") return batch;
      if (batch.status !== "PREVIEW") failure("Import is not ready.");
      const allRows = batch.rows as any[];
      const rows = validOnly ? allRows.filter(r => !r.issues.length) : allRows;
      if (!rows.length) failure("No valid assignments to import.");
      if (rows.some((r) => r.issues.length))
        failure("Correct all errors before importing.");
      if (rows.some((r) => r.reassign) && !confirmReassign)
        failure("Explicit reassignment confirmation is required.");
      for (const row of rows) {
        const user = await this.store.user(row.userId);
        if (!user || user.active === false || user.accountKind === 'client')
          failure("An assigned user became inactive. Preview the file again.");
        let client = (await repo.list("clients", { code: row.clientCode }))[0];
        if (!client)
          client = await repo.create("clients", {
            code: row.clientCode,
            name: row.clientName,
          });
        let account = (
          await repo.list("cpcbaccounts", { cpcbId: row.cpcbId })
        )[0];
        if (account && account.clientId !== client.id)
          failure("CPCB ID already belongs to another client.");
        if (!account)
          account = await repo.create("cpcbaccounts", {
            clientId: client.id,
            cpcbId: row.cpcbId,
            label: row.clientName,
            active: true,
          });
        const old = (
          await repo.list("clientassignments", {
            accountId: account.id,
            financialYear: row.financialYear,
          })
        )[0];
        let assignment;
        if (old) {
          if (old.version !== row.existingVersion && old.userId !== row.userId)
            failure("Assignment changed since preview.");
          assignment =
            old.userId === row.userId
              ? old
              : await repo.update("clientassignments", old.id, old.version, {
                  userId: row.userId,
                  assignedBy: actor.id,
                  previousUserId: old.userId,
                });
        } else
          assignment = await repo.create("clientassignments", {
            clientId: client.id,
            accountId: account.id,
            userId: row.userId,
            financialYear: row.financialYear,
            priority: row.priority,
            dueDate: row.dueDate,
            assignedBy: actor.id,
          });
        if (
          !(
            await repo.list("financialyearworkflows", {
              assignmentId: assignment.id,
            })
          ).length
        )
          await repo.create("financialyearworkflows", {
            assignmentId: assignment.id,
            ...initialWorkflow(),
          });
        await this.notify(
          row.userId,
          actor,
          `Client assigned: ${row.clientName}`,
          "/dashboard",
          "client.assigned",
          repo,
        );
      }
      const committed = await repo.update("imports", batch.id, batch.version, {
        status: rows.length === allRows.length ? "COMMITTED" : "PARTIALLY_COMMITTED",
        importedRows: rows.length,
        pendingRows: allRows.length - rows.length,
        rows: allRows.map(r => ({...r, imported: rows.includes(r)})),
        committedAt: new Date().toISOString(),
      });
      await this.audit(
        actor,
        "allocation.committed",
        id,
        { rows: rows.length, pendingRows: allRows.length - rows.length },
        repo,
      );
      return committed;
    });
  }
  async importRevalidate(actor: User, id: string, overrides: { row: number; email: string }[] = []) {
    requirePermission(actor, "clients.allocate");
    const batch = await this.repo.get("imports", id);
    if (!batch || batch.actorId !== actor.id) failure("Import not found.", 404);
    if (!['PREVIEW', 'PARTIALLY_COMMITTED'].includes(String(batch.status))) failure("Only pending rows can be corrected.");
    const saved = (batch.rows as any[]).filter(r => !r.imported);
    if (overrides.some(o => !saved.some(r => r.row === o.row))) failure("Unknown Excel row.", 400);
    const preview = await this.importPreview(actor, saved.map(r => ({
      "Client Name": r.clientName, "CPCB ID": r.cpcbId,
      "User Email": overrides.find(o => o.row === r.row)?.email ?? r.email,
      "Client Code": r.clientCode, "Financial Year": r.financialYear,
      Priority: r.priority, "Due Date": r.dueDate,
    })), String(batch.fileName));
    await this.repo.update("imports", preview.id, preview.version, { sourceImportId: batch.id });
    await this.audit(actor, "allocation.revalidated", preview.id, { sourceImportId: batch.id, correctedRows: overrides.map(o => o.row) });
    return this.repo.get("imports", preview.id);
  }
  async submitApproval(
    actor: User,
    assignmentId: string,
    stage: "validation" | "reconciliation",
    evidenceIds: string[],
  ) {
    await this.assignment(actor, assignmentId, true);
    const manager = actor.reportingManagerId
      ? await this.store.user(actor.reportingManagerId)
      : null;
    if (!manager || !can(manager, "approvals.review"))
      failure(
        "An active reporting manager with approval permissions must be assigned.",
      );
    if (!evidenceIds.length)
      failure("Attach evidence before requesting approval.");
    for (const id of evidenceIds) {
      const file = await this.repo.get("filerecords", id);
      if (!file || file.assignmentId !== assignmentId)
        failure("Evidence is outside this assignment.", 403);
    }
    return this.repo.transaction(async (r) => {
      const w = (await r.list("financialyearworkflows", { assignmentId }))[0];
      if (!w) failure("Workflow not found.");
      const next = transition(w as unknown as WorkflowState, stage + ".submit");
      await r.update("financialyearworkflows", w.id, w.version, next);
      const approval = await r.create("approvals", {
        assignmentId,
        workflowId: w.id,
        stage,
        requestedBy: actor.id,
        managerId: manager.id,
        status: "PENDING",
        evidenceVersion: w.evidenceVersion,
        evidenceIds,
      });
      await this.audit(actor, "approval.requested", approval.id, { stage }, r);
      await this.notify(
        manager.id,
        actor,
        `${actor.name} requested ${stage} approval`,
        "/approvals",
        "approval.requested",
        r,
      );
      return approval;
    });
  }
  async approvals(actor: User) {
    requirePermission(actor, "approvals.review");
    const all = await this.repo.list("approvals");
    return can(actor, "clients.view.all")
      ? all
      : all.filter((a) => a.managerId === actor.id);
  }
  async review(
    actor: User,
    id: string,
    decision: "approve" | "reject",
    remarks: string,
    version: number,
  ) {
    requirePermission(actor, "approvals.approve");
    return this.repo.transaction(async (r) => {
      const a = await r.get("approvals", id);
      if (!a || (!can(actor, "clients.view.all") && a.managerId !== actor.id))
        failure("Approval not found.", 404);
      if (a.requestedBy === actor.id)
        failure("Self approval is prohibited.", 403);
      if (a.status !== "PENDING" || a.version !== version)
        failure("Approval was already reviewed or changed.");
      if (decision === "reject" && !remarks.trim())
        failure("A rejection reason is required.");
      const w = await r.get("financialyearworkflows", String(a.workflowId));
      if (!w || w.evidenceVersion !== a.evidenceVersion)
        failure("Evidence changed. Submit a new approval request.");
      const next = transition(
        w as unknown as WorkflowState,
        `${a.stage}.${decision}`,
      );
      await r.update("financialyearworkflows", w.id, w.version, next);
      const result = await r.update("approvals", a.id, a.version, {
        status: decision === "approve" ? "APPROVED" : "REJECTED",
        remarks,
        reviewedBy: actor.id,
        reviewedAt: new Date().toISOString(),
      });
      await this.audit(
        actor,
        "approval." + decision,
        id,
        { evidenceVersion: a.evidenceVersion, remarks },
        r,
      );
      await this.notify(
        String(a.requestedBy),
        actor,
        `Approval ${decision === "approve" ? "approved" : "rejected"}`,
        "/dashboard",
        "approval." + decision,
        r,
      );
      return result;
    });
  }
  async onJob(job: Job) {
    if (!job.assignmentId) return;
    const w = (
      await this.repo.list("financialyearworkflows", {
        assignmentId: job.assignmentId,
      })
    )[0];
    if (!w) return;
    let event = "";
    if (job.kind !== "upload" && job.kind !== "delete") {
      if (job.status === "running" && w.extraction !== "IN_PROGRESS")
        event = "extraction.start";
      if (job.status === "completed" && job.artifact !== false && w.extraction === "IN_PROGRESS")
        event = "extraction.complete";
      if (job.status === "partial" && w.extraction === "IN_PROGRESS")
        event = "extraction.partial";
      if (
        ["failed", "cancelled"].includes(job.status) &&
        w.extraction === "IN_PROGRESS"
      )
        event = "extraction.failed";
    }
    if (event)
      await this.repo.update(
        "financialyearworkflows",
        w.id,
        w.version,
        transition(w as unknown as WorkflowState, event),
      );
    if(job.kind==='upload'&&w.upload==='IN_PROGRESS'&&['partial','completed','failed'].includes(job.status)){
      const results=job.results??[],batch=(await this.repo.list('uploadbatches',{jobId:job.id}))[0],submitted=!String(batch?.mode).startsWith('sales')&&results.some(r=>['SUBMIT_CLICKED','AWAITING_VERIFICATION'].includes(r.status));
      const next=transition(w as unknown as WorkflowState,submitted?'upload.submitted':'upload.failed');
      await this.repo.update('financialyearworkflows',w.id,w.version,{...next,blockingErrors:results.filter(r=>['FAILED','NOT_ATTEMPTED'].includes(r.status)).length});
      for(const row of results){const ledger=row.fingerprint?(await this.repo.list('uploadrows',{assignmentId:job.assignmentId,fingerprint:row.fingerprint}))[0]:null;if(ledger)await this.repo.update('uploadrows',ledger.id,ledger.version,{...row,jobId:job.id});else await this.repo.create('uploadrows',{jobId:job.id,assignmentId:job.assignmentId,...row});}
    }
    if ((job.kind === 'upload' || job.kind === 'delete') && ["completed", "partial", "failed"].includes(job.status)) {
      const actor = await this.store.user(job.userId);
      if (actor) {
        await this.audit(actor, "bot." + job.status, job.id, {
          assignmentId: job.assignmentId,
        });
        await this.notify(
          actor.id,
          actor,
          `${job.name}: ${job.status}`,
          job.kind==='upload'?'/bots/upload':job.kind==='delete'?'/bots/delete':'/bots/extract',
          "bot." + job.status,
        );
      }
    }
  }
}
