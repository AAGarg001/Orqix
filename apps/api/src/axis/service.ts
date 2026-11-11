import { PublishedRowCache } from "./row-cache.js";
import type { User } from "../store.js";
import type { Context } from "../saas/service.js";
import { ClientService } from "../saas/service.js";
import { failure } from "../enterprise/service.js";
import { can, requirePermission } from "../enterprise/permissions.js";
import { type AxisRow, parseWorkbook, key } from "./parser.js";
import type { RecordDoc } from "../enterprise/repository.js";
import { PrivateFiles } from "../enterprise/files.js";
export type Target = {
  key: string;
  tenantId: string;
  clientId: string;
  assignmentId?: string;
  registrationId?: string;
  company: string;
  unit: string;
  cpcbId: string;
  financialYear: string;
  portal: string;
};
export const indiaDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const sum = (rows: AxisRow[]) =>
  rows.reduce((n, r) => n + (r.quantity ?? 0), 0);
const group = (rows: AxisRow[], field: keyof AxisRow) =>
  Object.entries(
    rows.reduce(
      (all, r) => {
        const k = String(r[field] || "Not provided");
        all[k] = (all[k] ?? 0) + (r.quantity ?? 0);
        return all;
      },
      {} as Record<string, number>,
    ),
  )
    .map(([name, value]) => ({ name, value: Number(value.toFixed(6)) }))
    .sort((a, b) => b.value - a.value);
export class AxisService {
  private rowCache = new PublishedRowCache(120000);
  private snapshotCache = new Map<string, {value: ReturnType<AxisService["buildSnapshot"]>; expires: number}>();
  private static instances = new WeakMap<ClientService, Set<AxisService>>();
  constructor(public clients: ClientService) {
    const instances = AxisService.instances.get(clients) ?? new Set<AxisService>();
    instances.add(this);
    AxisService.instances.set(clients, instances);
  }
  private invalidatePublished(id: string) {
    for (const service of AxisService.instances.get(this.clients) ?? [this]) {
      service.rowCache.invalidate(id);
      service.snapshotCache.clear();
    }
  }
  get repo() {
    return this.clients.repo;
  }
  get enterprise() {
    return this.clients.enterprise;
  }
  async options(actor: User): Promise<Target[]> {
    requirePermission(actor, "bot.extract.execute");
    const assignments = await this.enterprise.assignments(actor),
      [clients, accounts, links, orgs] = await Promise.all(
        ["clients", "cpcbaccounts", "tenantclients", "organizations"].map((k) =>
          this.repo.list(k),
        ),
      );
    const targets: Target[] = assignments.map((a) => {
      const client = clients.find((c) => c.id === a.clientId),
        account = accounts.find((c) => c.id === a.accountId),
        link = links.find((l) => l.clientId === a.clientId);
      return {
        key: `assignment:${a.id}`,
        tenantId: String(link?.tenantId ?? ""),
        clientId: String(a.clientId),
        assignmentId: a.id,
        company: String(client?.name ?? "Client"),
        unit: String(
          account?.unitName ?? account?.label ?? client?.name ?? "Unit",
        ),
        cpcbId: String(account?.cpcbId ?? ""),
        financialYear: String(a.financialYear),
        portal: "plastic",
      };
    });
    if (can(actor, "clients.allocate")) {
      const regs = await this.repo.list("clientregistrations"),
        acc = await this.repo.list("portalaccounts");
      for (const r of regs) {
        if (
          targets.some(
            (t) =>
              t.tenantId === r.tenantId &&
              t.cpcbId === r.cpcbId &&
              t.financialYear === r.financialYear,
          )
        )
          continue;
        const a = acc.find((a) => a.id === r.accountId);
        targets.push({
          key: `registration:${r.id}`,
          tenantId: String(r.tenantId),
          registrationId: r.id,
          clientId: "",
          company: String(
            orgs.find((o) => o.id === r.tenantId)?.name ?? "Client",
          ),
          unit: String(a?.name ?? "Unit"),
          portal: String(a?.portalType ?? "plastic"),
          cpcbId: String(r.cpcbId),
          financialYear: String(r.financialYear),
        });
      }
    }
    return targets;
  }
  async internal(actor: User, id: string) {
    const d = await this.repo.get("axisdatasets", id);
    if (!d || !(await this.options(actor)).some((t) => t.key === d.targetKey))
      failure("Dataset not found.", 404);
    return d;
  }
  async import(
    actor: User,
    targetKey: string,
    buffer: Buffer,
    fileName: string,
    asOf = new Date().toISOString(),
    unitLabel?: string,
  ) {
    if (Date.parse(asOf) > Date.now() + 60000)
      failure("Data-as-of cannot be in the future.", 400);
    const target = (await this.options(actor)).find((t) => t.key === targetKey);
    if (!target) failure("Select an authorized client/unit registration.", 403);
    if (target.portal !== "plastic")
      failure(
        "This workbook adapter currently supports Plastic EPR only. Other portals need their own verified schema.",
        400,
      );
    const parsed = await parseWorkbook(buffer);
    // Validation does not require choosing a recipient organization. Keep an
    // unlinked preview transient; publication still requires a scoped draft.
    if (!target.tenantId) {
      const { rows: _rows, ...stats } = parsed;
      return {
        ...stats,
        ...target,
        id: "",
        version: 0,
        status: "PREVIEW_ONLY",
        fileName,
        unit: unitLabel || target.unit,
        asOf,
        identityWarning: parsed.entities.some(
          (n) =>
            !key(n).includes(key(target.company)) &&
            !key(target.company).includes(key(n)),
        ),
      };
    }
    const prior = (
      await this.repo.list("axisdatasets", {
        tenantId: target.tenantId,
        targetKey,
        hash: parsed.hash,
      })
    ).find(
      (d) =>
        d.status === "DRAFT" &&
        Date.parse(String(d.expiresAt)) > Date.now(),
    );
    if (prior) return prior;
    const { rows, ...stats } = parsed;
    const dataset = await this.repo.create("axisdatasets", {
      ...stats,
      targetKey,
      ...target,
      fileName,
      company: target.company,
      unit: unitLabel || target.unit,
      status: "DRAFT",
      createdBy: actor.id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      asOf,
      identityWarning: parsed.entities.some(
        (n) =>
          !key(n).includes(key(target.company)) &&
          !key(target.company).includes(key(n)),
      ),
      sourceLabel: "Staff-uploaded portal extract; identity review pending",
    });
    try {
      for (let index = 0; index < rows.length; index += 500)
        await this.repo.create("axischunks", {
          tenantId: target.tenantId,
          datasetId: dataset.id,
          index,
          rows: rows.slice(index, index + 500),
        });
    } catch (e) {
      await this.repo.removeWhere("axischunks", { datasetId: dataset.id });
      await this.repo.removeWhere("axisdatasets", { id: dataset.id });
      throw e;
    }
    await this.enterprise.audit(actor, "axis.preview_created", dataset.id, {
      tenantId: target.tenantId,
      targetKey,
    });
    return dataset;
  }
  async publish(
    actor: User,
    id: string,
    input: {
      version: number;
      retentionDays?: number;
      identityConfirmed?: boolean;
      retentionApproved?: boolean;
      notes?: string;
    },
  ) {
    const d = await this.internal(actor, id);
    if (d.status !== "DRAFT" || Date.parse(String(d.expiresAt)) <= Date.now())
      failure("Draft expired or already published. Upload a fresh workbook.");
    const replacement = await this.repo.transaction(async (repo) => {
      const lock = await repo.get("organizations", String(d.tenantId));
      if (!lock) failure("Client organization no longer exists.", 404);
      await repo.update("organizations", lock.id, lock.version, {
        axisRevision: Number(lock.axisRevision ?? 0) + 1,
      });
      const published = await repo.update("axisdatasets", d.id, input.version, {
        status: "PUBLISHED",
        publishedBy: actor.id,
        publisherName: actor.name,
        publishedAt: new Date().toISOString(),
        expiresAt: null,
        retentionDays: null,
        retentionApproved: false,
        reviewNotes: input.notes ?? "Published directly by the uploading user.",
        sourceLabel: "Reviewed and published by internal operations",
      });
      const retiredIds: string[] = [];
      // Registration identity, rather than upload target/FY, determines the
      // replacement scope. Other registrations and tenants remain untouched.
      for (const old of await repo.list("axisdatasets", {
        tenantId: d.tenantId, portal: d.portal, cpcbId: d.cpcbId,
      })) {
        if (old.id === d.id || !["PUBLISHED", "SUPERSEDED"].includes(String(old.status))) continue;
        await repo.removeWhere("axischunks", {datasetId:old.id});
        await repo.removeWhere("axisnotices", {tenantId:d.tenantId,datasetId:old.id});
        for (const action of await repo.list("axisactions",{datasetId:old.id})) {
          await repo.removeWhere("axiscomments",{actionId:action.id});
          await repo.removeWhere("axisactions",{id:action.id});
        }
        await repo.update("axisdatasets",old.id,old.version,{
          status:"SUPERSEDED",replacedBy:d.id,replacedAt:new Date().toISOString(),
          expiresAt:null,retentionDays:null,retentionApproved:false,
          entities:[],units:[],sheets:[],errors:[],hash:null,fileName:old.fileName,
          issueCount:null,rowCount:null,coverage:null,reviewNotes:null,
          sourceLabel:"Replaced by a newer publication; source data deleted",
        });
        retiredIds.push(old.id);
      }
      return {published,retiredIds};
    });
    for (const retiredId of replacement.retiredIds) this.invalidatePublished(retiredId);
    this.invalidatePublished(d.id);
    const published = replacement.published;
    await this.notice(
      String(d.tenantId),
      "DATA",
      "New data published",
      `${d.company} / ${d.unit}: a reviewed snapshot is available.`,
      "/client/dashboard",
      `published:${d.id}`,
      d.id,
    );
    await this.enterprise.audit(actor, "axis.published", id, {
      tenantId: d.tenantId,
      storageLifecycle: "UNTIL_REPLACED",
    });
    return published;
  }
  async purge(dataset: RecordDoc, status = "EXPIRED") {
    this.invalidatePublished(dataset.id);
    await this.repo.removeWhere("axischunks", { datasetId: dataset.id });
    for (const file of await this.repo.list("clientdocuments", {
      datasetId: dataset.id,
    })) {
      await new PrivateFiles().delete({
        key: String(file.key),
        storage: file.storage,
      });
      await this.repo.removeWhere("clientdocuments", { id: file.id });
    }
    for (const action of await this.repo.list("axisactions", {
      datasetId: dataset.id,
    })) {
      await this.repo.removeWhere("axiscomments", { actionId: action.id });
      await this.repo.removeWhere("axisactions", { id: action.id });
    }
    await this.repo.removeWhere("axisnotices", {
      tenantId: dataset.tenantId,
      datasetId: dataset.id,
    });
    try {
      await this.repo.update("axisdatasets", dataset.id, dataset.version, {
        status,
        entities: [],
        units: [],
        sheets: [],
        errors: [],
        hash: null,
        fileName: null,
        issueCount: null,
        rowCount: null,
        coverage: null,
        reviewNotes: null,
        sourceLabel: "Published content removed",
      });
    } catch (error) {
      const current = await this.repo.get("axisdatasets", dataset.id);
      if (!["EXPIRED", "REVOKED"].includes(String(current?.status)))
        throw error;
    }
  }
  async sweep(tenantId?: string) {
    for (const d of await this.repo.list("axisdatasets", tenantId ? {tenantId} : {}))
      if (
        d.status === "DRAFT" &&
        Date.parse(String(d.expiresAt)) <= Date.now()
      )
        await this.purge(d);
  }
  async notice(
    tenantId: string,
    type: string,
    title: string,
    message: string,
    link: string,
    dedupe: string,
    datasetId?: string,
  ) {
    if ((await this.repo.list("axisnotices", { tenantId, dedupe })).length)
      return;
    await this.repo.create("axisnotices", {
      tenantId,
      type,
      title,
      message,
      link,
      dedupe,
      datasetId,
      readBy: [],
    });
  }
  async rows(datasetId: string) {
    return this.rowCache.read(datasetId, async () => (await this.repo.list("axischunks", { datasetId }))
      .sort((a, b) => Number(a.index) - Number(b.index))
      .flatMap((c) => c.rows as AxisRow[]));
  }
  async datasets(c: Context) {
    const records = await this.repo.list("axisdatasets", {tenantId:c.tenant.id});
    const now=Date.now();
    for (const d of records) {
      if (d.status === "DRAFT" && Date.parse(String(d.expiresAt)) <= now) await this.purge(d);
    }
    return records.filter(d=>d.status === "PUBLISHED");
  }
  async snapshot(c: Context, filters: Record<string,string> = {}) {
    // Always validate fresh publication metadata and tenant revision first.
    // A new publication, revoke, account change or India-day change gets a new key.
    const all=await this.datasets(c);
    const cacheKey=JSON.stringify([c.tenant.id,c.tenant.version,c.tenant.name,indiaDay(),all.map(d=>[d.id,d.version]),Object.entries(filters).filter(([,v])=>v).sort(([a],[b])=>a.localeCompare(b))]);
    const cached=this.snapshotCache.get(cacheKey);
    if(cached && cached.expires>Date.now())return cached.value;
    if(cached)this.snapshotCache.delete(cacheKey);
    while(this.snapshotCache.size>=2)this.snapshotCache.delete(this.snapshotCache.keys().next().value!);
    const entry={value:this.buildSnapshot(c,filters,all),expires:Infinity};
    this.snapshotCache.set(cacheKey,entry);
    void entry.value.then(result=>{
      if(result._all.certificates.length+result._all.procurement.length>100000){if(this.snapshotCache.get(cacheKey)===entry)this.snapshotCache.delete(cacheKey);return;}
      entry.expires=Date.now()+5000;
      const timer=setTimeout(()=>{if(this.snapshotCache.get(cacheKey)===entry)this.snapshotCache.delete(cacheKey);},5000);timer.unref();
    },()=>{if(this.snapshotCache.get(cacheKey)===entry)this.snapshotCache.delete(cacheKey);});
    return entry.value;
  }
  private async buildSnapshot(c: Context, filters: Record<string,string>, all: RecordDoc[]) {
    const candidates = all.filter(
        (d) =>
          (!filters.company || d.company === filters.company) &&
          (!filters.unit || d.unit === filters.unit) &&
          (!filters.registration || d.cpcbId === filters.registration),
      );
    const unique = new Map<string, RecordDoc>();
    for (const d of candidates.sort((a, b) =>
      String(b.publishedAt).localeCompare(String(a.publishedAt)),
    )) {
      const k = `${d.portal}|${d.cpcbId}`;
      if (!unique.has(k)) unique.set(k, d);
    }
    const datasets = [...unique.values()];
    const combined: { data: AxisRow; dataset: RecordDoc }[] = [];
    const sourceRows = await Promise.all(datasets.map(d => this.rows(d.id)));
    for (const [index,d] of datasets.entries()) {
      const rows = sourceRows[index];
      if (combined.length + rows.length > 250000)
        failure(
          "Select a company or unit to review this large portfolio.",
          400,
        );
      for (const data of rows) combined.push({ data, dataset: d });
    }
    const [nativeAccounts,nativeRegs] = await Promise.all([
      this.repo.list("portalaccounts", {tenantId:c.tenant.id}),
      this.repo.list("clientregistrations", {tenantId:c.tenant.id}),
    ]);
    const registry: Array<{ id: string; [key: string]: unknown }> =
      nativeRegs.map((r) => {
        const a = nativeAccounts.find((a) => a.id === r.accountId),
          published = all.find(
            (d) =>
              d.cpcbId === r.cpcbId &&
              d.financialYear === r.financialYear &&
              d.portal === a?.portalType,
          );
        return {
          id: published?.id ?? r.id,
          company: published?.company ?? c.tenant.name,
          unit: published?.unit ?? a?.name,
          portal: a?.portalType,
          cpcbId: r.cpcbId,
          financialYear: r.financialYear,
          coverage: published?.coverage ?? 0,
          verification: r.verification,
          published: !!published,
          errors: published?.errors ?? [],
          asOf: published?.asOf,
        };
      });
    for (const d of all)
      if (
        !registry.some(
          (r) =>
            r.cpcbId === d.cpcbId &&
            r.financialYear === d.financialYear &&
            r.portal === d.portal,
        )
      )
        registry.push({
          id: d.id,
          company: d.company,
          unit: d.unit,
          portal: d.portal,
          cpcbId: d.cpcbId,
          financialYear: d.financialYear,
          coverage: d.coverage,
          verification: "INTERNAL_REVIEW",
          published: true,
          errors: d.errors ?? [],
          asOf: d.asOf,
        });
    const today = indiaDay();
    const mapped = combined.map(({ data, dataset }) => ({
      ...data,
      issues: [...data.issues],
      datasetId: dataset.id,
      company: dataset.company,
      unitName: dataset.unit,
      cpcbId: dataset.cpcbId,
      sourceId: `${dataset.id}:${data.sheet}:${data.row}`,
    }));
    const certificates = mapped
      .filter((r) => r.kind === "certificate")
      .map((r) => ({
        ...r,
        daysLeft: r.validity
          ? Math.ceil((Date.parse(r.validity) - Date.parse(today)) / 86400000)
          : null,
        eligible:
          r.quantity !== null &&
          r.quantity > 0 &&
          !!r.certificateId &&
          !r.issues.includes("Duplicate certificate ID") &&
          !!r.validity &&
          r.validity >= today &&
          /^(success|available|active|valid)$/i.test(r.status ?? ""),
      }));
    const seenCertificates = new Map<string, typeof certificates>();
    for (const r of certificates) {
      if (!r.certificateId) continue;
      const group = seenCertificates.get(r.certificateId) ?? [];
      group.push(r);
      seenCertificates.set(r.certificateId, group);
    }
    for (const group of seenCertificates.values())
      if (group.length > 1)
        for (const r of group) {
          r.eligible = false;
          if (!r.issues.includes("Duplicate certificate ID"))
            r.issues.push("Duplicate certificate ID");
        }
    const eligible = certificates.filter((r) => r.eligible),
      procurement = mapped.filter((r) => r.kind === "procurement"),
      selectedProc = procurement.filter(
        (r) =>
          (!filters.fy || r.financialYear === filters.fy) &&
          (!filters.supplier || r.supplier === filters.supplier) &&
          (!filters.registerType || r.registerType === filters.registerType) &&
          (!filters.plasticCategory ||
            r.category === filters.plasticCategory) &&
          (!filters.from || (!!r.date && r.date >= filters.from)) &&
          (!filters.to || (!!r.date && r.date <= filters.to)) &&
          (!filters.month || (!!r.date && r.date.startsWith(filters.month))),
      );
    const issues = mapped.flatMap((r) =>
      r.issues.filter((issue) => /duplicate/i.test(issue)).map((issue, i) => ({
        id: `${r.sourceId}:${i}`,
        datasetId: r.datasetId,
        company: r.company,
        unit: r.unitName,
        cpcbId: r.cpcbId,
        title: issue,
        severity: /quantity|duplicate/.test(issue.toLowerCase())
          ? "high"
          : "medium",
        reference:
          r.certificateId ||
          r.invoice ||
          r.eprInvoice ||
          `${r.sheet} row ${r.row}`,
        source: r.sourceId,
        type: /duplicate/i.test(issue)
          ? "duplicate"
          : /invoice/i.test(issue)
            ? "invoice"
            : "missing",
        status: "OPEN",
      })),
    );
    const reconciliations: any[] = [];
    for (const d of datasets) {
      const scope = mapped.filter((r) => r.datasetId === d.id);
      const summaries = scope.filter(
        (r) =>
          r.kind === "summary" &&
          r.quantity !== null &&
          r.financialYear &&
          r.category !== "Not provided",
      );
      for (const s of summaries) {
        if (
          scope.filter(
            (r) =>
              r.kind === "summary" &&
              r.financialYear === s.financialYear &&
              r.category === s.category,
          ).length !== 1
        )
          continue;
        const detail = scope.filter(
          (r) =>
            r.kind === "procurement" &&
            r.financialYear === s.financialYear &&
            (key(s.category) === "total" || r.category === s.category),
        );
        if (!detail.length || detail.some((r) => r.quantity === null)) continue;
        const actual = sum(detail);
        const difference = Number(((s.quantity ?? 0) - actual).toFixed(6));
        reconciliations.push({
          id: `${s.sourceId}:reconciliation`,
          datasetId: d.id,
          company: d.company,
          unit: d.unit,
          cpcbId: d.cpcbId,
          financialYear: s.financialYear,
          category: s.category,
          summary: s.quantity,
          detail: actual,
          difference,
          comparable: true,
        });
        if (Math.abs(difference) > 0.000001)
          issues.push({
            id: `${s.sourceId}:reconciliation`,
            datasetId: d.id,
            company: d.company,
            unit: d.unit,
            cpcbId: d.cpcbId,
            title: "Summary versus detail quantity difference",
            severity: "medium",
            reference: `${s.financialYear} / ${s.category}`,
            source: s.sourceId,
            type: "reconciliation",
            status: "OPEN",
          });
      }
    }
    const actions: any[] = [];
    const buckets = [30, 60, 90].map((days) => ({
      days,
      quantity: sum(
        eligible.filter((r) => r.daysLeft !== null && r.daysLeft <= days),
      ),
      count: eligible.filter((r) => r.daysLeft !== null && r.daysLeft <= days)
        .length,
    }));
    const expired = certificates.filter(
      (r) => r.daysLeft !== null && r.daysLeft < 0,
    );
    const chartExpiry = [
      { name: "0–30 days", value: buckets[0].quantity },
      { name: "31–60 days", value: buckets[1].quantity - buckets[0].quantity },
      { name: "61–90 days", value: buckets[2].quantity - buckets[1].quantity },
      { name: "Over 90 days", value: sum(eligible) - buckets[2].quantity },
    ];
    let filtered = certificates.filter(
      (r) =>
        (!filters.q ||
          `${r.certificateId} ${r.company} ${r.unitName}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())) &&
        (!filters.category || r.category === filters.category) &&
        (!filters.processing || r.processingType === filters.processing) &&
        (!filters.status ||
          (filters.status === "eligible"
            ? r.eligible
            : filters.status === "expired"
              ? r.daysLeft !== null && r.daysLeft < 0
              : !r.eligible)),
    );
    filtered.sort((a, b) =>
      String(a.validity ?? "9999").localeCompare(String(b.validity ?? "9999")),
    );
    const pageSize = 25,
      page = Math.max(
        1,
        Math.min(
          Math.ceil(filtered.length / pageSize) || 1,
          Math.floor(Number(filters.page) || 1),
        ),
      ),
      issuePageSize = 10,
      issuePage = Math.max(
        1,
        Math.min(
          Math.ceil(issues.length / issuePageSize) || 1,
          Math.floor(Number(filters.issuePage) || 1),
        ),
      ),
      expiryDays = [30, 60, 90].includes(Number(filters.expiryDays))
        ? Number(filters.expiryDays)
        : 60,
      expiryRows = filtered
        .filter(
          (r) => r.eligible && r.daysLeft !== null && r.daysLeft <= expiryDays,
        )
        .sort((a, b) => String(a.validity).localeCompare(String(b.validity))),
      expiryPageSize = 10,
      expiryPage = Math.max(
        1,
        Math.min(
          Math.ceil(expiryRows.length / expiryPageSize) || 1,
          Math.floor(Number(filters.expiryPage) || 1),
        ),
      );
    return {
      organization: { id: c.tenant.id, name: c.tenant.name },
      registry,
      registrationMetrics: Object.fromEntries(
        datasets.map((d) => [
          d.id,
          {
            available: sum(eligible.filter((r) => r.datasetId === d.id)),
            procurement: sum(selectedProc.filter((r) => r.datasetId === d.id)),
          },
        ]),
      ),
      datasets: datasets.map((d): RecordDoc => ({ ...d, hash: undefined })),
      allDatasets: all.map((d) => ({
        id: d.id,
        company: d.company,
        unit: d.unit,
        cpcbId: d.cpcbId,
        financialYear: d.financialYear,
        portal: d.portal,
        publishedAt: d.publishedAt,
        expiresAt: d.expiresAt,
        coverage: d.coverage,
        errors: d.errors,
      })),
      options: {
        financialYears: [
          ...new Set(mapped.map((r) => r.financialYear).filter(Boolean)),
        ].sort(),
        suppliers: [...new Set(procurement.map((r) => r.supplier))].sort(),
        registerTypes: [
          ...new Set(procurement.map((r) => r.registerType)),
        ].sort(),
        categories: [...new Set(procurement.map((r) => r.category))].sort(),
        months: [
          ...new Set(
            procurement.filter((r) => r.date).map((r) => r.date!.slice(0, 7)),
          ),
        ].sort(),
      },
      qualityCounts: Object.fromEntries(
        ["invoice", "duplicate", "missing", "reconciliation"].map((type) => [
          type,
          issues.filter((i) => i.type === type).length,
        ]),
      ),
      searchProcurement: procurement
        .filter(
          (r) =>
            !!filters.q &&
            `${r.supplier} ${r.invoice} ${r.eprInvoice} ${r.company} ${r.unitName}`
              .toLowerCase()
              .includes(filters.q.toLowerCase()),
        )
        .slice(0, 25),
      metrics: {
        units: new Set(datasets.map((d) => `${d.company}|${d.unit}`)).size,
        registrations: new Set(datasets.map((d) => `${d.portal}|${d.cpcbId}`))
          .size,
        available: sum(eligible),
        certificateCount: certificates.length,
        expiredQuantity: sum(expired),
        procurement: sum(selectedProc),
        suppliers: new Set(selectedProc.map((r) => r.supplier)).size,
        registered: sum(
          selectedProc.filter((r) => !/^un/i.test(r.registerType ?? "")),
        ),
        unregistered: sum(
          selectedProc.filter((r) => /^un/i.test(r.registerType ?? "")),
        ),
        issues: issues.length,
        openActions: actions.filter((a) => a.status !== "RESOLVED").length,
      },
      charts: {
        categories: group(eligible, "category"),
        processing: group(eligible, "processingType"),
        expiry: chartExpiry,
        trend: group(procurement, "financialYear").sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        procurementCategories: group(selectedProc, "category"),
        suppliers: (() => {
          const all = group(selectedProc, "supplier");
          return all.length > 8
            ? [
                ...all.slice(0, 8),
                {
                  name: "Others",
                  value: all.slice(8).reduce((n, r) => n + r.value, 0),
                },
              ]
            : all;
        })(),
        units: group(selectedProc as AxisRow[], "unit"),
        monthly: group(
          selectedProc
            .filter((r) => r.date)
            .map((r) => ({ ...r, financialYear: r.date!.slice(0, 7) })),
          "financialYear",
        ).sort((a, b) => a.name.localeCompare(b.name)),
      },
      buckets,
      expiryCertificates: expiryRows.slice(
        (expiryPage - 1) * expiryPageSize,
        expiryPage * expiryPageSize,
      ),
      expiryTotal: expiryRows.length,
      expiryPage,
      expiryPageSize,
      certificates: filtered.slice((page - 1) * pageSize, page * pageSize),
      certificateTotal: filtered.length,
      page,
      pageSize,
      issues: issues.slice(
        (issuePage - 1) * issuePageSize,
        issuePage * issuePageSize,
      ),
      issuePage,
      issuePageSize,
      issueTotal: issues.length,
      reconciliations,
      actions,
      asOf:
        datasets
          .map((d) => String(d.asOf))
          .sort()
          .at(-1) ?? null,
      verifiedAt:
        datasets
          .map((d) => String(d.publishedAt))
          .sort()
          .at(-1) ?? null,
      definitions: {
        available:
          "Positive, unexpired Available-sheet quantities with valid identity/date; conflicting/duplicate certificate IDs are excluded. Potential columns and other wallet sheets are never added.",
        procurement:
          "Recorded quantities from Procurement data, filtered by source financial year. Certificate balances remain the latest reviewed snapshot, not historical FY balances. Potential duplicates remain review candidates, not automatically deleted. Totals are not statutory EPR targets.",
        coverage:
          "Recognized source families present / 3 (Available, Procurement data, Procurement Summary); not a compliance or portal-completeness score.",
        reconciliation:
          "Only a unique FY/category summary row is compared to matching procurement detail; unsupported/ambiguous summaries are not assumed comparable.",
      },
      _all: {
        certificates,
        eligible: filtered.filter((r) => r.eligible),
        procurement: selectedProc,
        issues,
      },
    };
  }
}
