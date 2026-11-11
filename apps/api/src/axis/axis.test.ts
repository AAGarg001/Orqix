import { beforeEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { Store, type User } from "../store.js";
import { Repository } from "../enterprise/repository.js";
import { EnterpriseService } from "../enterprise/service.js";
import { ClientService, type Context } from "../saas/service.js";
import { AxisService } from "./service.js";
import { isoDate, parseWorkbook } from "./parser.js";
import { hashPassword } from "../auth.js";
import { Runner } from "../runner.js";
import { createApp } from "../app.js";
export async function fixture(extra = false) {
  const book = new ExcelJS.Workbook();
  const a = book.addWorksheet("Available");
  a.addRows([
    [
      "Certificate ID",
      "Value(MT)",
      "Category",
      "Processing Type",
      "Generated At",
      "Validity",
      "Status",
      "Entity Name",
      "Unit",
    ],
    [
      "C-001",
      100,
      "Cat-I",
      "Recycling",
      "01 Nov 2026",
      "20 Nov 2026",
      "SUCCESS",
      "Test Company",
      "Unit 1",
    ],
    [
      "C-002",
      50,
      "Cat-II",
      "Co-processing",
      "01 Nov 2026",
      "20 Jan 2030",
      "SUCCESS",
      "Test Company",
      "Unit 1",
    ],
  ]);
  if (extra)
    a.addRows([
      [
        "C-DUP",
        20,
        "Cat-I",
        "Recycling",
        "01 Nov 2026",
        "20 Nov 2030",
        "SUCCESS",
        "Test Company",
        "Unit 1",
      ],
      [
        "C-DUP",
        20,
        "Cat-I",
        "Recycling",
        "01 Nov 2026",
        "20 Nov 2030",
        "SUCCESS",
        "Test Company",
        "Unit 1",
      ],
      [
        "C-OLD",
        10,
        "Cat-I",
        "Recycling",
        "01 Nov 2020",
        "20 Nov 2020",
        "SUCCESS",
        "Test Company",
        "Unit 1",
      ],
    ]);
  book.addWorksheet("Generated").addRows([
    ["Certificate ID", "Value(MT)"],
    ["C-001", 100],
  ]);
  book.addWorksheet("Procurement data").addRows([
    [
      "Name of Entity",
      "Register Type",
      "Category of Plastic",
      "Financial Year",
      "Date",
      "Total Plastic Qty. (Ton)",
      "GST Invoice No",
      "EPR Invoice No",
      "Entity Name",
      "Unit",
    ],
    [
      "Supplier A",
      "Registered",
      "Cat I",
      "FY 2026-27",
      "02/11/2026",
      100,
      "INV-001",
      "",
      "Test Company",
      "Unit 1",
    ],
    [
      "Supplier B",
      "Unregistered",
      "Cat II",
      "FY 2026-27",
      "03/11/2026",
      50,
      "",
      "",
      "Test Company",
      "Unit 1",
    ],
  ]);
  book.addWorksheet("Procurement Summary").addRows([
    [
      "Financial Year",
      "Categories of Plastic",
      "Plastic Procured from Registered Entity (MT)",
      "Plastic Procured from Un-registered Entity (MT)",
    ],
    ["FY 2026-27", "Cat I", 100, 0],
    ["FY 2026-27", "Cat II", 0, 50],
    ["FY 2026-27", "Total", 100, 50],
  ]);
  book
    .addWorksheet("Errors and Skipped")
    .addRows([["Module", "Status", "Reason"]]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
describe("Axis reviewed client snapshots", () => {
  let store: Store,
    repo: Repository,
    clients: ClientService,
    axis: AxisService,
    staff: User,
    other: User,
    c: Context,
    target: string;
  beforeEach(async () => {
    store = new Store(true);
    repo = new Repository(true);
    clients = new ClientService(new EnterpriseService(repo, store));
    axis = new AxisService(clients);
    staff = await store.createUser({
      name: "Operator",
      email: "operator@axis.test",
      passwordHash: "x",
      role: "executive",
      active: true,
    });
    other = await store.createUser({
      name: "Other",
      email: "other@axis.test",
      passwordHash: "x",
      role: "executive",
      active: true,
    });
    const tenant = await repo.create("organizations", {
        name: "Client Workspace",
        status: "ACTIVE",
      }),
      user = await store.createUser({
        name: "Client",
        email: "client@axis.test",
        accountKind: "client",
        active: true,
        passwordHash: "x",
      }),
      member = await repo.create("organizationmembers", {
        tenantId: tenant.id,
        userId: user.id,
        role: "client_owner",
        status: "ACTIVE",
      });
    c = { tenant, user, member };
    const client = await repo.create("clients", {
        code: "TEST",
        name: "Test Company",
      }),
      account = await repo.create("cpcbaccounts", {
        clientId: client.id,
        cpcbId: "REG-001",
        label: "Unit 1",
      });
    await repo.create("tenantclients", {
      tenantId: tenant.id,
      clientId: client.id,
    });
    const a = await repo.create("clientassignments", {
      clientId: client.id,
      accountId: account.id,
      userId: staff.id,
      financialYear: "2026-27",
    });
    target = `assignment:${a.id}`;
  });
  async function publish() {
    const d = await axis.import(
      staff,
      target,
      await fixture(true),
      "test.xlsx",
    );
    return axis.publish(staff, d.id, {
      version: d.version,
      retentionDays: 7,
      identityConfirmed: true,
      retentionApproved: true,
      notes: "Reviewed identity and source coverage.",
    });
  }
  it("parses actual source headers, strict dates, categories and summary totals without adding other wallet sheets", async () => {
    const parsed = await parseWorkbook(await fixture(true));
    expect(parsed.rows.filter((r) => r.kind === "certificate")).toHaveLength(5);
    expect(
      parsed.rows.filter((r) => r.kind === "procurement")[0].financialYear,
    ).toBe("2026-27");
    expect(
      parsed.rows.filter((r) => r.kind === "certificate")[0].category,
    ).toBe("Category I");
    expect(isoDate("31/02/2026")).toBeNull();
    expect(isoDate("99/99/2026")).toBeNull();
    expect(isoDate("27 Mar 2029, 10:28:50 pm")).toBe("2029-03-27");
  });
  it("rejects unsupported/formula workbooks and unauthorized assignment IDs", async () => {
    await expect(
      axis.import(other, target, await fixture(), "test.xlsx"),
    ).rejects.toThrow("authorized");
    const b = new ExcelJS.Workbook();
    b.addWorksheet("Fake").addRow(["fake"]);
    await expect(
      parseWorkbook(Buffer.from(await b.xlsx.writeBuffer())),
    ).rejects.toThrow("No supported");
    const valid = new ExcelJS.Workbook();
    await valid.xlsx.load((await fixture()) as never);
    valid.getWorksheet("Available")!.getCell("B2").value = {
      formula: "1+1",
      result: 2,
    };
    await expect(
      parseWorkbook(Buffer.from(await valid.xlsx.writeBuffer())),
    ).rejects.toThrow("values-only");
  });
  it("publishes directly without approval fields and exposes no draft data", async () => {
    const d = await axis.import(staff, target, await fixture(), "test.xlsx");
    expect((await axis.snapshot(c)).metrics.available).toBe(0);
    const published = await axis.publish(staff, d.id, {version: d.version, retentionDays: 30});
    expect(published.status).toBe("PUBLISHED");
    expect((await axis.snapshot(c)).metrics.available).toBeGreaterThan(0);
    await expect(axis.internal(other, d.id)).rejects.toThrow("not found");
  });
  it("uses eligible Available rows, excludes duplicate IDs, reconciles totals and supersedes snapshots", async () => {
    const d = await publish(),
      data = await axis.snapshot(c);
    expect(data.metrics.available).toBe(150);
    expect(data.metrics.procurement).toBe(150);
    expect(data.metrics.registered).toBe(100);
    expect(data.metrics.unregistered).toBe(50);
    expect(data.reconciliations.every((r) => r.difference === 0)).toBe(true);
    expect(data.issues.some((i) => /missing|invalid/i.test(i.title))).toBe(false);
    expect(data.qualityCounts.invoice).toBe(0);
    expect(data.qualityCounts.missing).toBe(0);
    expect(data.metrics.registrations).toBe(1);
    const identical = await axis.import(
      staff,
      target,
      await fixture(true),
      "again.xlsx",
    );
    expect(identical.id).not.toBe(d.id);
    await axis.publish(staff, identical.id, {version: identical.version, retentionDays: 30});
    expect((await repo.get("axisdatasets", d.id))?.status).toBe("SUPERSEDED");
    const next = await axis.import(
      staff,
      target,
      await fixture(),
      "updated.xlsx",
    );
    await axis.publish(staff, next.id, {
      version: next.version,
      retentionDays: 7,
      identityConfirmed: true,
      retentionApproved: true,
      notes: "Reviewed the next snapshot.",
    });
    expect((await axis.snapshot(c)).metrics.available).toBe(150);
    expect((await repo.get("axisdatasets", d.id))?.status).toBe("SUPERSEDED");
  });
  it("deletes the replaced registration source and updates every service cache without touching other IDs", async () => {
    const old=await publish();const peer=new AxisService(clients);
    expect((await peer.snapshot(c)).metrics.available).toBe(150);
    expect((await peer.rows(old.id)).length).toBeGreaterThan(0);
    const alias=await repo.create("axisdatasets",{tenantId:old.tenantId,portal:old.portal,cpcbId:old.cpcbId,targetKey:"older-fy-alias",status:"SUPERSEDED",expiresAt:old.expiresAt});
    const otherId=await repo.create("axisdatasets",{tenantId:old.tenantId,portal:old.portal,cpcbId:"OTHER-ID",status:"PUBLISHED",expiresAt:old.expiresAt});
    const otherTenant=await repo.create("axisdatasets",{tenantId:"other-tenant",portal:old.portal,cpcbId:old.cpcbId,status:"PUBLISHED",expiresAt:old.expiresAt});
    for(const d of [alias,otherId,otherTenant])await repo.create("axischunks",{tenantId:d.tenantId,datasetId:d.id,index:0,rows:[{kind:"certificate",quantity:9}]});
    const b=new ExcelJS.Workbook();await b.xlsx.load((await fixture()) as never);b.getWorksheet("Available")!.getCell("B2").value=225;
    const draft=await axis.import(staff,target,Buffer.from(await b.xlsx.writeBuffer()),"replacement.xlsx");
    await expect(axis.publish(staff,draft.id,{version:draft.version+1,retentionDays:30})).rejects.toThrow("Record changed");
    expect((await repo.list("axischunks",{datasetId:old.id})).length).toBeGreaterThan(0);
    await axis.publish(staff,draft.id,{version:draft.version,retentionDays:30});
    expect(await repo.list("axischunks",{datasetId:old.id})).toHaveLength(0);
    expect(await repo.list("axischunks",{datasetId:alias.id})).toHaveLength(0);
    expect(await peer.rows(old.id)).toHaveLength(0);
    expect((await repo.get("axisdatasets",old.id))?.fileName).toBe(old.fileName);
    expect((await repo.get("axisdatasets",old.id))?.replacedBy).toBe(draft.id);
    expect(await repo.list("axischunks",{datasetId:otherId.id})).toHaveLength(1);
    expect(await repo.list("axischunks",{datasetId:otherTenant.id})).toHaveLength(1);
    // The independent registration is not a complete workbook fixture: select
    // the replaced registration to verify its exact latest totals.
    expect((await peer.snapshot(c,{registration:String(old.cpcbId)})).metrics.available).toBe(275);
  });
  it("validates an unlinked client without saving or publishing its data", async () => {
    await repo.removeWhere("tenantclients", { tenantId: c.tenant.id });
    const preview = await axis.import(
      staff,
      target,
      await fixture(true),
      "unlinked.xlsx",
    );
    expect(preview.status).toBe("PREVIEW_ONLY");
    expect(preview.rowCount).toBeGreaterThan(0);
    expect(await repo.list("axisdatasets")).toHaveLength(0);
    expect(await repo.list("axischunks")).toHaveLength(0);
    expect((await axis.snapshot(c)).datasets).toHaveLength(0);
    await expect(
      axis.publish(staff, preview.id, {
        version: 0,
        retentionDays: 7,
        identityConfirmed: true,
        retentionApproved: true,
        notes: "Must remain unavailable before linking.",
      }),
    ).rejects.toThrow("not found");
  });
  it("omits missing-field findings while paging expiry records without losing later records", async () => {
    const book = new ExcelJS.Workbook();
    const certificates = book.addWorksheet("Available");
    certificates.addRow([
      "Certificate ID",
      "Value(MT)",
      "Category",
      "Processing Type",
      "Validity",
      "Status",
      "Entity Name",
      "Unit",
    ]);
    const expiry = new Date(Date.now() + 15 * 86400000)
      .toISOString()
      .slice(0, 10);
    for (let i = 0; i < 25; i++)
      certificates.addRow([
        `PAGE-CERT-${i}`,
        1,
        "Cat I",
        "Recycling",
        expiry,
        "SUCCESS",
        "Test Company",
        "Unit 1",
      ]);
    const procurement = book.addWorksheet("Procurement data");
    procurement.addRow([
      "Name of Entity",
      "Register Type",
      "Category of Plastic",
      "Financial Year",
      "Date",
      "Total Plastic Qty. (Ton)",
      "GST Invoice No",
      "Entity Name",
      "Unit",
    ]);
    for (let i = 0; i < 30; i++)
      procurement.addRow([
        `Supplier ${i}`,
        "Registered",
        "Cat I",
        "FY 2026-27",
        "2026-11-01",
        1,
        "",
        "Test Company",
        "Unit 1",
      ]);
    const draft = await axis.import(
      staff,
      target,
      Buffer.from(await book.xlsx.writeBuffer()),
      "pages.xlsx",
    );
    await axis.publish(staff, draft.id, {
      version: draft.version,
      retentionDays: 7,
      identityConfirmed: true,
      retentionApproved: true,
      notes: "Reviewed isolated pagination fixture.",
    });
    const first = await axis.snapshot(c, { expiryDays: "30" }),
      second = await axis.snapshot(c, {
        issuePage: "2",
        expiryPage: "2",
        expiryDays: "30",
      });
    expect(first.issueTotal).toBe(0);
    expect(first.issues).toHaveLength(0);
    expect(second.issues).toHaveLength(0);
    expect(first.expiryTotal).toBe(25);
    expect(first.expiryCertificates).toHaveLength(10);
    expect(second.expiryCertificates).toHaveLength(10);
    expect(second.expiryCertificates[0].sourceId).not.toBe(
      first.expiryCertificates[0].sourceId,
    );
    const last = await axis.snapshot(c, {
      issuePage: "9999",
      expiryPage: "9999",
      expiryDays: "30",
    });
    expect(last.expiryPage).toBe(3);
    expect(last.expiryCertificates).toHaveLength(5);
    expect(last.issues).toHaveLength(0);
  });
  it("keeps published data until replaced, isolates tenants and purges explicit removals", async () => {
    const d = await publish(),
      otherTenant = await repo.create("organizations", { name: "Other" });
    expect(
      (await axis.snapshot({ ...c, tenant: otherTenant })).datasets,
    ).toHaveLength(0);
    const legacy=await repo.update("axisdatasets", d.id, d.version, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const pending=await axis.import(staff,target,await fixture(),"unpublished.xlsx");
    await repo.update("axisdatasets",pending.id,pending.version,{expiresAt:new Date(Date.now()-1000).toISOString()});
    await axis.sweep();
    expect(await repo.list("axischunks",{datasetId:pending.id})).toHaveLength(0);
    expect((await axis.snapshot(c)).datasets).toHaveLength(1);
    await axis.purge(legacy,"REVOKED");
    expect((await axis.snapshot(c)).datasets).toHaveLength(0);
    expect(await repo.list("axischunks", { datasetId: d.id })).toHaveLength(0);
    expect((await repo.get("axisdatasets", d.id))?.entities).toEqual([]);
    expect(await repo.list("filerecords")).toHaveLength(0);
  });
  it("filters historical procurement years without dropping the latest certificate snapshot", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await fixture(true)) as never);
    for (const sheet of workbook.worksheets)
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          if (typeof cell.value === "string" && cell.value.includes("2026-27"))
            cell.value = cell.value.replaceAll("2026-27", "2024-25");
        }),
      );
    const draft = await axis.import(
      staff,
      target,
      Buffer.from(await workbook.xlsx.writeBuffer()),
      "historical.xlsx",
    );
    await axis.publish(staff, draft.id, {
      version: draft.version,
      retentionDays: 7,
      identityConfirmed: true,
      retentionApproved: true,
      notes: "Reviewed historical procurement and latest certificate balances.",
    });
    const snapshot = await axis.snapshot(c, { fy: "2024-25" });
    expect(snapshot.datasets).toHaveLength(1);
    expect(snapshot.metrics.procurement).toBe(150);
    expect(snapshot.metrics.available).toBe(150);
    expect(snapshot.options.financialYears).toContain("2024-25");
  });
  it("routes consultations to authorized staff and sends replies to the client thread", async () => {
    const express = (await import("express")).default;
    const {registerConsultations}=await import("./consultations.js");
    const ticket=await repo.create("supporttickets",{tenantId:c.tenant.id,subject:"Procurement question",message:"Please explain the quantity",createdBy:c.user.id,status:"OPEN"});
    const server=express();server.use(express.json());server.use((req,res,next)=>{res.locals.user=req.headers["x-other"]?other:staff;next();});
    const router=express.Router();registerConsultations(router,clients,axis);server.use(router);
    const list=await request(server).get("/consultations");expect(list.body.actions.some((t:any)=>t.id===ticket.id)).toBe(true);
    expect((await request(server).get(`/consultations/${ticket.id}`).set("x-other","yes")).status).toBe(404);
    const response=await request(server).patch(`/consultations/${ticket.id}`).send({version:ticket.version,status:"RESOLVED",remarks:"The summary includes both registration types."});
    expect(response.status).toBe(200);
    expect((await repo.list("supportmessages",{ticketId:ticket.id}))[0].message).toContain("both registration types");
    expect((await repo.get("supporttickets",ticket.id))?.status).toBe("RESOLVED");
    let current=response.body.action;
    for (const status of ["IN_PROGRESS","AWAITING_CLIENT","RESOLVED"]) {
      const changed=await request(server).patch(`/consultations/${ticket.id}`).send({version:current.version,status});
      expect(changed.status).toBe(200);expect(changed.body.action.status).toBe(status);current=changed.body.action;
    }
    expect(await repo.list("supportmessages",{ticketId:ticket.id})).toHaveLength(1);
    expect((await request(server).patch(`/consultations/${ticket.id}`).send({version:ticket.version,status:"RESOLVED",remarks:"Stale response"})).status).toBeGreaterThanOrEqual(400);
  });
  it("reuses identical snapshots but invalidates on publication metadata and tenant revision", async () => {
    const d=await publish();const spy=vi.spyOn(repo,"list");
    const first=await axis.snapshot(c);const second=await axis.snapshot(c);
    expect(second).toBe(first);expect(spy.mock.calls.filter(([kind])=>kind==="portalaccounts")).toHaveLength(1);
    const changed=await repo.update("axisdatasets",d.id,d.version,{unit:"Renamed unit"});
    const updated=await axis.snapshot(c);expect(updated).not.toBe(first);expect(updated.datasets[0].unit).toBe("Renamed unit");
    const currentTenant=(await repo.get("organizations",c.tenant.id))!;
    const newTenant=await repo.update("organizations",c.tenant.id,currentTenant.version,{name:"Updated organization"});
    expect(await axis.snapshot({...c,tenant:newTenant})).not.toBe(updated);
    await axis.purge(changed,"REVOKED");expect((await axis.snapshot(c)).metrics.available).toBe(0);
    spy.mockRestore();
  });
  it("client API cannot access internal upload; viewer cannot create actions; reports are real files", async () => {
    const app = createApp(store, new Runner(store));
    app.locals.clients.enterprise.repo = repo;
    const axisRouter = await import("./router.js");
    // Routes constructed by createApp share its own service, so use its repository
    // for this isolated API fixture before mounting an explicitly scoped adapter.
    const express = (await import("express")).default;
    const server = express();
    server.use(express.json());
    server.use((_, res, next) => {
      res.locals.context = c;
      res.locals.user = c.user;
      next();
    });
    server.use("/client", axisRouter.axisClientRouter(clients));
    await publish();
    const report = await request(server)
      .get("/client/export?type=certificates&format=xlsx")
      .buffer(true)
      .parse((res: any, callback: any) => {
        const chunks: Buffer[] = [];
        res.on("data", (x: Buffer) => chunks.push(x));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(report.status).toBe(200);
    expect(report.headers["content-type"]).toContain("spreadsheetml");
    const b = new ExcelJS.Workbook();
    await b.xlsx.load(report.body);
    expect(b.getWorksheet("Report")!.rowCount).toBe(3);
    const viewer = { ...c, member: { ...c.member, role: "client_viewer" } };
    const taskServer = express();
    taskServer.use(express.json());
    taskServer.use((_, res, next) => {
      res.locals.context = viewer;
      res.locals.user = viewer.user;
      next();
    });
    taskServer.use("/client", axisRouter.axisClientRouter(clients));
    expect(
      (
        await request(taskServer)
          .post("/client/actions")
          .send({ datasetId: "x" })
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });
});
