import { registerConsultations } from "./consultations.js";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import ExcelJS from "exceljs";
import { createReportPdf } from "./report-pdf.js";
import { AxisService } from "./service.js";
import { ClientService, type Context } from "../saas/service.js";
import { failure } from "../enterprise/service.js";
import { requirePermission, can } from "../enterprise/permissions.js";
import { PrivateFiles } from "../enterprise/files.js";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 12 },
});
const filters = (query: any) =>
  Object.fromEntries(
    [
      "company",
      "unit",
      "registration",
      "fy",
      "q",
      "category",
      "processing",
      "status",
      "page",
      "issuePage",
      "expiryPage",
      "expiryDays",
      "supplier",
      "registerType",
      "plasticCategory",
      "from",
      "to",
      "month",
    ].map((k) => [
      k,
      typeof query[k] === "string" ? query[k].slice(0, 200) : "",
    ]),
  );
const preferences = z.object({
  email: z.boolean(),
  inApp: z.boolean(),
  certificates: z.boolean(),
  actions: z.boolean(),
  advisory: z.boolean(),
  reports: z.boolean(),
  data: z.boolean(),
  quality: z.boolean(),
  quietStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietEnd: z.string().regex(/^\d{2}:\d{2}$/),
  frequency: z.enum(["monthly", "quarterly"]),
  formatPdf: z.boolean(),
  formatExcel: z.boolean(),
});
const defaults = {
  email: false,
  inApp: true,
  certificates: true,
  actions: true,
  advisory: true,
  reports: true,
  data: true,
  quality: true,
  quietStart: "22:00",
  quietEnd: "07:00",
  frequency: "monthly",
  formatPdf: true,
  formatExcel: true,
};
async function exportReport(axis: AxisService, c: Context, req: any, res: any) {
  const snapshot = await axis.snapshot(c, filters(req.query));
  if (!snapshot.datasets.length)
    failure("No published dataset is available for these filters.", 404);
  const type = z
      .enum([
        "summary",
        "certificates",
        "expiry",
        "procurement",
        "quality",
        "companies",
      ])
      .default("summary")
      .parse(req.query.type),
    format = z.enum(["xlsx", "pdf"]).default("xlsx").parse(req.query.format);
  const title = {
    summary: "Monthly EPR Business Summary",
    certificates: "Certificate Availability Report",
    expiry: "Certificate Expiry Review Report",
    procurement: "Procurement Analysis Report",
    quality: "Procurement Reconciliation Report",
    companies: "Consolidated Company and Unit Report",
  }[type];
  let records: any[] =
    type === "certificates"
      ? snapshot._all.eligible
      : type === "expiry"
        ? snapshot._all.eligible.filter(
            (r) => r.daysLeft !== null && r.daysLeft <= 90,
          )
        : type === "procurement"
          ? snapshot._all.procurement
          : type === "quality"
            ? snapshot.reconciliations
            : type === "companies"
                ? snapshot.datasets.map((d) => ({
                    company: d.company,
                    unit: d.unit,
                    registration: d.cpcbId,
                    financialYear: d.financialYear,
                    sourceCoverage: d.coverage,
                    publishedAt: d.publishedAt,
                    expiresAt: d.expiresAt,
                  }))
                : Object.entries(snapshot.metrics).filter(([metric])=>metric!=="openActions").map(([metric, value]) => ({
                    metric,
                    value,
                  }));
  const sanitize = (v: any) =>
    typeof v === "string" && /^[=+@\-]/.test(v)
      ? `'${v}`
      : Array.isArray(v)
        ? v.join("; ")
        : typeof v === "object" && v !== null
          ? JSON.stringify(v)
          : v;
  const stamp = new Date().toISOString().slice(0, 10),
    filename = `ORQIX_${type}_${stamp}.${format}`;
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet("Report");
    const names = [...new Set(records.flatMap((r) => Object.keys(r)))].filter(
      (k) => !["version", "timeline"].includes(k),
    );
    sheet.columns = names.map((k) => ({ header: k, key: k, width: 25 }));
    for (const row of records)
      sheet.addRow(Object.fromEntries(names.map((k) => [k, sanitize(row[k])])));
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    if (names.length)
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: names.length },
      };
    const provenance = workbook.addWorksheet("Data source");
    provenance.addRows([
      ["Report", title],
      ["Organization", c.tenant.name],
      ["Generated", new Date().toISOString()],
      ["Data as of", snapshot.asOf],
      ["Definition", JSON.stringify(snapshot.definitions)],
      ["Note", "Business analytics only; no statutory compliance conclusion."],
      ...snapshot.datasets.map((d) => [
        "Source",
        `${d.company} / ${d.unit} / ${d.cpcbId} / ${d.id}`,
      ]),
    ]);
    res
      .attachment(filename)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(Buffer.from(await workbook.xlsx.writeBuffer()));
  } else {
    const logo = req.file?.buffer;
    res
      .attachment(filename)
      .type("application/pdf")
      .send(
        await createReportPdf({
          snapshot,
          title,
          type,
          records,
          company: String(c.tenant.name),
          logo,
        }),
      );
  }
  await axis.repo.create("axisdownloads", {
    tenantId: c.tenant.id,
    userId: c.user.id,
    title,
    format,
    scope: filters(req.query),
    downloadedAt: new Date().toISOString(),
  });
}
export function axisInternalRouter(clients: ClientService) {
  const router = Router(),
    axis = new AxisService(clients);
  router.use((_req, res, next) => {
    requirePermission(res.locals.user, "bot.extract.execute");
    next();
  });
  router.use(async (_req, _res, next) => {
    await axis.sweep();
    next();
  });
  router.get("/options", async (_req, res) =>
    res.json({ targets: await axis.options(res.locals.user) }),
  );
  router.get("/datasets", async (_req, res) => {
    await axis.sweep();
    const targets = await axis.options(res.locals.user),
      rows = await axis.repo.list("axisdatasets");
    res.json({
      datasets: rows
        .filter((d) => targets.some((t) => t.key === d.targetKey))
        .sort((a,b) => Date.parse(String(b.publishedAt ?? b.createdAt)) - Date.parse(String(a.publishedAt ?? a.createdAt)))
        .map((d) => ({ ...d, hash: undefined })),
    });
  });
  router.post("/preview", upload.single("file"), async (req, res) => {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith(".xlsx"))
      failure("Upload the final extracted XLSX workbook.", 400);
    const { targetKey, asOf, unitLabel } = z
      .object({
        targetKey: z.string().min(3).max(100),
        asOf: z.string().datetime({ offset: true }),
        unitLabel: z.string().trim().min(2).max(120),
      })
      .parse(req.body);
    res.json({
      dataset: await axis.import(
        res.locals.user,
        targetKey,
        req.file.buffer,
        req.file.originalname,
        asOf,
        unitLabel,
      ),
    });
  });
  router.post("/:id/publish", async (req, res) => {
    const input = z
      .object({
        version: z.number().int(),
        retentionDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
        identityConfirmed: z.boolean().optional(),
        retentionApproved: z.boolean().optional(),
        notes: z.string().trim().max(1000).optional(),
      })
      .parse(req.body);
    res.json({
      dataset: await axis.publish(
        res.locals.user,
        String(req.params.id),
        input,
      ),
    });
  });
  registerConsultations(router, clients, axis);
  return router;
}
export function axisClientRouter(clients: ClientService) {
  const router = Router(),
    axis = new AxisService(clients),
    files = new PrivateFiles(),
    ctx = (res: any) => res.locals.context as Context;
  router.get("/", async (req, res) => {
    const data = await axis.snapshot(ctx(res), filters(req.query));
    const { _all, ...publicData } = data;
    res.json(publicData);
  });
  router.get("/export", async (req, res) =>
    exportReport(axis, ctx(res), req, res),
  );
  router.post(
    "/export",
    multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
    }).single("logo"),
    async (req, res) => {
      if (req.query.format !== "pdf")
        failure("Logo customization is supported for PDF reports only.", 400);
      await exportReport(axis, ctx(res), req, res);
    },
  );
  router.get("/reports", async (_req, res) =>
    res.json({
      downloads: await axis.repo.list("axisdownloads", {
        tenantId: ctx(res).tenant.id,
      }),
      datasets: await axis.datasets(ctx(res)),
    }),
  );
  router.get("/governance", async (_req, res) => {
    const c = ctx(res);
    res.json({
      datasets: await axis.datasets(c),
      members: await axis.repo.list("organizationmembers", {
        tenantId: c.tenant.id,
      }),
      history: await axis.repo.list("clientactivity", {
        tenantId: c.tenant.id,
      }),
      preferences:
        (
          await axis.repo.list("axispreferences", {
            tenantId: c.tenant.id,
            userId: c.user.id,
          })
        )[0] ?? defaults,
      policy:
        "Published client data remains available until replaced by a new publication for the same registration. Raw workbook bytes are discarded. BOT files follow their independent auto-delete policy. Unpublished drafts expire separately.",
      emailConfigured: false,
    });
  });
  router.post("/preferences", async (req, res) => {
    const c = ctx(res);
    clients.allow(c, "write");
    const input = preferences.parse(req.body),
      old = (
        await axis.repo.list("axispreferences", {
          tenantId: c.tenant.id,
          userId: c.user.id,
        })
      )[0];
    const record = old
      ? await axis.repo.update("axispreferences", old.id, old.version, input)
      : await axis.repo.create("axispreferences", {
          tenantId: c.tenant.id,
          userId: c.user.id,
          ...input,
        });
    await clients.event(c, "axis.preferences_updated", record.id);
    res.json({
      preferences: record,
      emailDelivery: "Not configured; preferences saved, no email was sent.",
    });
  });
  router.get("/notifications", async (_req, res) => {
    const c = ctx(res),
      data = await axis.snapshot(c);
    const prefs =
      (
        await axis.repo.list("axispreferences", {
          tenantId: c.tenant.id,
          userId: c.user.id,
        })
      )[0] ?? defaults;
    const existingNotices=await axis.repo.list("axisnotices",{tenantId:c.tenant.id});
    const dedupes=new Set(existingNotices.map(n=>n.dedupe));
    if (prefs.certificates) {
      const upcoming=data._all.eligible.filter(r=>r.daysLeft!==null&&r.daysLeft<=90).slice(0,50);
      for (const r of upcoming) {
        const dedupe=`expiry:${r.sourceId}:${r.daysLeft!<=7?7:r.daysLeft!<=30?30:r.daysLeft!<=60?60:90}`;
        if(dedupes.has(dedupe))continue;
        await axis.notice(String(c.tenant.id),"CERTIFICATE","Certificate expiry review needed",`${r.certificateId} / ${r.company} / ${r.unitName}: validity ${r.validity}`,"/client/expiry",dedupe,r.datasetId);
      }
    }
    res.json({
      notifications: (await axis.repo.list("axisnotices", {
        tenantId: c.tenant.id,
      })).filter(n => n.type !== "ACTION" && n.link !== "/client/actions"),
      preferences: prefs,
      emailConfigured: false,
    });
  });
  router.post("/notifications/read", async (req, res) => {
    const c = ctx(res),
      { id } = z.object({ id: z.string().optional() }).parse(req.body);
    for (const n of await axis.repo.list("axisnotices", {
      tenantId: c.tenant.id,
    })) {
      if (id && n.id !== id) continue;
      const readBy = n.readBy as string[];
      if (!readBy.includes(c.user.id))
        await axis.repo.update("axisnotices", n.id, n.version, {
          readBy: [...readBy, c.user.id],
        });
    }
    res.json({ ok: true });
  });
  return router;
}
