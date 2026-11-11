import { beforeEach, describe, expect, it } from "vitest";
import { Store, type User } from "../store.js";
import { Repository } from "./repository.js";
import { EnterpriseService } from "./service.js";
import { initialWorkflow, transition } from "./workflow.js";
import { can } from "./permissions.js";
describe("enterprise authorization and workflow", () => {
  let store: Store,
    repo: Repository,
    service: EnterpriseService,
    admin: User,
    manager: User,
    employee: User,
    other: User;
  beforeEach(async () => {
    store = new Store(true);
    repo = new Repository(true);
    service = new EnterpriseService(repo, store);
    admin = await store.createUser({
      name: "Admin",
      email: "admin@test.example",
      passwordHash: "x",
      role: "super_admin",
      active: true,
    });
    manager = await store.createUser({
      name: "Raj",
      email: "raj@test.example",
      passwordHash: "x",
      role: "manager",
      active: true,
    });
    employee = await store.createUser({
      name: "Riya",
      email: "riya@test.example",
      passwordHash: "x",
      role: "executive",
      reportingManagerId: manager.id,
      active: true,
    });
    other = await store.createUser({
      name: "Other",
      email: "other@test.example",
      passwordHash: "x",
      role: "manager",
      active: true,
    });
  });
  async function allocate() {
    const preview = await service.importPreview(
      admin,
      [
        {
          "Client Name": "Authorized client",
          "CPCB ID": "CEPR001",
          "User Email": employee.email,
          "Financial Year": "2026-27",
        },
      ],
      "master.xlsx",
    );
    await service.importCommit(admin, preview.id, false);
    return (await service.assignments(employee))[0];
  }
  it("imports real assignments, starts Not Started and is idempotent", async () => {
    const preview = await service.importPreview(
      admin,
      [
        {
          "Client Name": "A client",
          "CPCB ID": "CEPR001",
          "User Email": employee.email,
          "Financial Year": "2026-27",
        },
      ],
      "a.xlsx",
    );
    await service.importCommit(admin, preview.id, false);
    await service.importCommit(admin, preview.id, false);
    expect((await repo.list("clientassignments")).length).toBe(1);
    expect((await repo.list("financialyearworkflows"))[0].businessStatus).toBe(
      "Not Started",
    );
  });
  it("imports valid rows explicitly and preserves invalid rows for correction without duplicating assignments", async () => {
    const preview = await service.importPreview(admin, [
      {'Client Name':'Riya client','CPCB ID':'RIYA001','User Email':employee.email},
      {'Client Name':'Pending client','CPCB ID':'AMIT001','User Email':'amit@test.example'},
    ], 'mixed.xlsx');
    await expect(service.importCommit(admin,preview.id,false)).rejects.toThrow('Correct all errors');
    const result = await service.importCommit(admin,preview.id,false,true);
    expect(result.status).toBe('PARTIALLY_COMMITTED');
    expect(result.importedRows).toBe(1);
    expect(result.pendingRows).toBe(1);
    await service.importCommit(admin,preview.id,false,true);
    expect((await service.dashboard(employee)).rows).toHaveLength(1);
    expect((await service.dashboard(other)).rows).toHaveLength(0);
    expect((await service.dashboard(admin)).rows).toHaveLength(1);
    const pending = await service.importRevalidate(admin,preview.id,[{row:3,email:employee.email}]);
    expect(pending?.total).toBe(1);
    await service.importCommit(admin,pending!.id,false);
    expect((await service.assignments(employee))).toHaveLength(2);
    expect(await repo.list('financialyearworkflows')).toHaveLength(2);
  });
  it("rejects unknown/inactive users and duplicate rows", async () => {
    await store.updateUser(employee.id, { active: false });
    const row = {
      "Client Name": "Client",
      "CPCB ID": "CEPR001",
      "User Email": employee.email,
    };
    const p = await service.importPreview(
      admin,
      [row, row, { ...row, "User Email": "missing@test.example" }],
      "bad.xlsx",
    );
    expect(p.errors).toBe(3);
    await expect(service.importCommit(admin, p.id, false)).rejects.toThrow(
      "Correct all errors",
    );
  });
  it("revalidates a saved preview after user creation without assigning until commit", async () => {
    const p = await service.importPreview(admin, [{"Client Name":"New client","CPCB ID":"CEPR-LATE","User Email":"late@test.example"}], "late.xlsx");
    expect(p.errors).toBe(1);
    const late = await store.createUser({name:"Late employee",email:"late@test.example",passwordHash:"x",role:"executive",active:true});
    const fresh = await service.importRevalidate(admin,p.id);
    expect(fresh?.errors).toBe(0);
    expect(await service.assignments(late)).toHaveLength(0);
    await service.importCommit(admin,fresh!.id,false);
    expect(await service.assignments(late)).toHaveLength(1);
    expect(await service.assignments(employee)).toHaveLength(0);
    expect((await service.dashboard(late)).rows[0].account?.cpcbId).toBe("CEPR-LATE");
    expect(await service.assignments(admin)).toHaveLength(1);
    const regularAdmin=await store.createUser({name:"Admin",email:"admin2@test.example",passwordHash:"x",role:"admin",active:true});
    expect(await service.assignments(regularAdmin)).toHaveLength(1);
  });
  it("corrects unknown row emails explicitly and prevents unauthorized preview edits", async () => {
    const p = await service.importPreview(admin,[{"Client Name":"Client","CPCB ID":"CEPR-FIX","User Email":"missing@test.example"}],"fix.xlsx");
    await expect(service.importRevalidate(employee,p.id,[{row:2,email:employee.email}])).rejects.toThrow("permission");
    await expect(service.importRevalidate(admin,p.id,[{row:99,email:employee.email}])).rejects.toThrow("Unknown Excel row");
    const fresh=await service.importRevalidate(admin,p.id,[{row:2,email:employee.email}]);
    expect(fresh?.valid).toBe(1);
    await service.importCommit(admin,fresh!.id,false);
    expect(await service.assignments(employee)).toHaveLength(1);
    expect(await service.assignments(other)).toHaveLength(0);
    await expect(service.importRevalidate(admin,fresh!.id)).rejects.toThrow("pending rows");
  });
  it("scopes clients to the employee and reporting manager", async () => {
    const a = await allocate();
    expect((await service.assignments(manager)).length).toBe(1);
    expect(await service.assignments(other)).toEqual([]);
    await expect(service.assignment(other, a.id)).rejects.toThrow("not found");
  });
  it("requires explicit reassignment confirmation", async () => {
    await allocate();
    const p = await service.importPreview(
      admin,
      [
        {
          "Client Name": "Authorized client",
          "CPCB ID": "CEPR001",
          "User Email": other.email,
          "Financial Year": "2026-27",
        },
      ],
      "reassign.xlsx",
    );
    expect(p.reassignments).toBe(1);
    await expect(service.importCommit(admin, p.id, false)).rejects.toThrow(
      "confirmation",
    );
    await service.importCommit(admin, p.id, true);
    expect(await service.assignments(employee)).toEqual([]);
  });
  it("blocks role escalation and unsupported permissions", () => {
    expect(can(employee, "users.create")).toBe(false);
    expect(can(manager, "clients.allocate")).toBe(false);
    expect(can(admin, "users.create")).toBe(true);
  });
  it("prevents upload without extraction and legacy completion without evidence", () => {
    expect(() => transition(initialWorkflow(), "upload.start")).toThrow(
      "extraction",
    );
    expect(() =>
      transition(initialWorkflow(), "reconciliation.approve"),
    ).toThrow("mandatory");
  });
  it("completes the four-stage workflow only after verified upload", () => {
    let w = initialWorkflow();
    for (const event of [
      "extraction.start",
      "extraction.complete",
      "upload.start",
      "upload.submitted",
      "upload.verified",
    ])
      w = transition(w, event);
    expect(w.businessStatus).toBe("Completed");
    expect(w.stage).toBe('COMPLETED');
    expect(()=>transition({...w,upload:'AWAITING_VERIFICATION',blockingErrors:1},'upload.verified')).toThrow('blocking errors');
    expect(transition(w, "evidence.changed").validation).toBe("NOT_STARTED");
  });
  it("retains approval owner and blocks unrelated/duplicate reviews", async () => {
    const a = await allocate(),
      w = await service.workflow(employee, a.id);
    await repo.update("financialyearworkflows", w.id, w.version, {
      ...initialWorkflow(),
      extraction: "COMPLETED",
      stage: "VALIDATION",
    });
    const file = await repo.create("filerecords", { assignmentId: a.id });
    const approval = await service.submitApproval(
      employee,
      a.id,
      "validation",
      [file.id],
    );
    await expect(
      service.review(other, approval.id, "approve", "", approval.version),
    ).rejects.toThrow("not found");
    await service.review(
      manager,
      approval.id,
      "approve",
      "Reviewed evidence",
      approval.version,
    );
    await expect(
      service.review(manager, approval.id, "approve", "", approval.version),
    ).rejects.toThrow("already reviewed");
  });
  it("rejects stale evidence and mandatory rejection reason", async () => {
    const a = await allocate(),
      w = await service.workflow(employee, a.id);
    await repo.update("financialyearworkflows", w.id, w.version, {
      extraction: "COMPLETED",
    });
    const file = await repo.create("filerecords", { assignmentId: a.id });
    const approval = await service.submitApproval(
      employee,
      a.id,
      "validation",
      [file.id],
    );
    await expect(
      service.review(manager, approval.id, "reject", "", 0),
    ).rejects.toThrow("rejection reason");
    const updated = await service.workflow(employee, a.id);
    await repo.update("financialyearworkflows", updated.id, updated.version, {
      evidenceVersion: 5,
    });
    await expect(
      service.review(manager, approval.id, "approve", "ok", 0),
    ).rejects.toThrow("Evidence changed");
  });
});
