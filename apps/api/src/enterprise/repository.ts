import mongoose, { type ClientSession } from "mongoose";
import { randomUUID } from "node:crypto";
export type RecordDoc = {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};
const models = new Map<string, mongoose.Model<any>>();
const collections = [
  'testbillingorders',
  'axisdatasets','axischunks','axisactions','axiscomments','axisnotices','axispreferences','axisdownloads','axisgovernance',
  "worktasks",
  "teams",
  "departments",
  "roles",
  "clients",
  "cpcbaccounts",
  "clientassignments",
  "financialyearworkflows",
  "approvals",
  "notifications",
  "auditlogs",
  "imports",
  "filerecords",
  "deletionrequests",
  "deletionsnapshots",
  "deletionresults",
  "uploadbatches",
  "uploadrows",
  "weeklyreports",
  "emaildeliverylogs",
  "aiconversations",
  "settings",
  "setuptokens",
  "botjobevents",
  "organizations", "organizationmembers", "tenantclients", "portalaccounts", "clientregistrations",
  "spocassignments", "planversions", "subscriptions", "usageledger", "usagebuckets", "orders", "payments",
  "webhookevents", "invoices", "invoicecounters", "clientdocuments", "clientapprovals", "supporttickets",
  "supportmessages", "clientactivity", "servicerequests", "billingprofiles", "refundrequests", "clientconversations",
];
export class Repository {
  private data = new Map<string, Map<string, RecordDoc>>();
  constructor(
    public memory: boolean,
    private session?: ClientSession,
  ) {}
  private model(kind: string) {
    if (!collections.includes(kind)) throw new Error("Unknown collection");
    let model = models.get(kind);
    if (!model) {
      const schema = new mongoose.Schema(
        {
          id: { type: String, unique: true },
          version: Number,
          createdAt: String,
          updatedAt: String,
        },
        { strict: false, versionKey: false, collection: kind },
      );
      if (kind === "teams") schema.index({ code: 1 }, { unique: true });
      if(kind==='worktasks'){schema.index({assigneeId:1,archived:1,dueDate:1});schema.index({createdBy:1,kind:1});}
      if(kind.startsWith('axis'))schema.index({tenantId:1,createdAt:-1});
      if(kind==='axischunks')schema.index({datasetId:1,index:1},{unique:true});
      if(kind==='axisdatasets')schema.index({tenantId:1,targetKey:1,status:1});
      if (kind === 'roles') schema.index({roleKey:1},{unique:true});
      if(kind==='uploadrows')schema.index({assignmentId:1,fingerprint:1},{unique:true,sparse:true});
      if(['organizations','portalaccounts','clientregistrations','subscriptions','clientdocuments','clientapprovals','supporttickets','servicerequests','orders','payments','invoices','clientactivity','clientconversations'].includes(kind))schema.index({tenantId:1,createdAt:-1});
      if(kind==='organizationmembers'){schema.index({tenantId:1,userId:1},{unique:true});schema.index({userId:1,status:1,createdAt:-1});}
      if(kind==='tenantclients')schema.index({clientId:1},{unique:true});
      if(kind==='clientregistrations')schema.index({tenantId:1,cpcbId:1},{unique:true});
      if(kind==='usagebuckets')schema.index({tenantId:1,subscriptionId:1,service:1,periodStart:1},{unique:true});
      if(kind==='usageledger'||kind==='servicerequests')schema.index({tenantId:1,idempotencyKey:1},{unique:true,sparse:true});
      if(kind==='orders')schema.index({tenantId:1,idempotencyKey:1},{unique:true});
      if(kind==='servicerequests')schema.index({jobId:1},{unique:true,sparse:true});
      if(kind==='planversions')schema.index({code:1,priceVersion:1},{unique:true});
      if(kind==='billingprofiles')schema.index({tenantId:1},{unique:true});
      if(kind==='webhookevents')schema.index({eventId:1},{unique:true});
      if(kind==='payments')schema.index({providerPaymentId:1},{unique:true});
      if(kind==='invoices'||kind==='subscriptions')schema.index({orderId:1},{unique:true,sparse:true});
      if(kind==='invoices')schema.index({number:1},{unique:true});
      if(kind==='invoicecounters')schema.index({scope:1},{unique:true});
      if (kind === "clients") schema.index({ code: 1 }, { unique: true });
      if (kind === "cpcbaccounts")
        schema.index({ cpcbId: 1 }, { unique: true });
      if (kind === "clientassignments")
        schema.index({ accountId: 1, financialYear: 1 }, { unique: true });
      if (kind === "financialyearworkflows")
        schema.index({ assignmentId: 1 }, { unique: true });
      if (kind === "approvals") schema.index({ managerId: 1, status: 1 });
      if (kind === "notifications")
        schema.index({ recipientId: 1, read: 1, createdAt: -1 });
      if (kind === "emaildeliverylogs")
        schema.index({ deliveryKey: 1 }, { unique: true });
      if (kind === "auditlogs") schema.index({ createdAt: -1 });
      if (kind === "setuptokens")
        schema.index({ tokenHash: 1 }, { unique: true });
      model = mongoose.model("Orqix_" + kind, schema);
      models.set(kind, model);
    }
    return model;
  }
  async initialize() {
    if (!this.memory)
      await Promise.all(collections.map((c) => this.model(c).init()));
  }
  async list(
    kind: string,
    filter: Record<string, unknown> = {},
  ): Promise<RecordDoc[]> {
    if (!this.memory)
      return this.model(kind)
        .find(filter)
        .session(this.session ?? null)
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean() as unknown as RecordDoc[];
    return structuredClone(
      [...(this.data.get(kind)?.values() ?? [])]
        .filter((doc) => Object.entries(filter).every(([k, v]) => doc[k] === v))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
  async get(kind: string, id: string): Promise<RecordDoc | null> {
    if (this.memory)
      return structuredClone(this.data.get(kind)?.get(id) ?? null);
    return this.model(kind)
      .findOne({ id })
      .session(this.session ?? null)
      .lean() as unknown as RecordDoc | null;
  }
  async create(
    kind: string,
    values: Record<string, unknown>,
  ): Promise<RecordDoc> {
    const now = new Date().toISOString();
    const doc = {
      ...values,
      id: randomUUID(),
      version: 0,
      createdAt: now,
      updatedAt: now,
    } as RecordDoc;
    if (this.memory) {
      if (!this.data.has(kind)) this.data.set(kind, new Map());
      this.data.get(kind)!.set(doc.id, structuredClone(doc));
    } else await this.model(kind).create([doc], { session: this.session });
    return structuredClone(doc);
  }
  async update(
    kind: string,
    id: string,
    version: number,
    patch: Record<string, unknown>,
  ): Promise<RecordDoc> {
    const safe: Record<string, unknown> = {
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    delete safe.id;
    delete safe.version;
    if (this.memory) {
      const doc = this.data.get(kind)?.get(id);
      if (!doc || doc.version !== version)
        throw Object.assign(
          new Error("Record changed. Refresh and review before retrying."),
          { status: 409 },
        );
      const next = { ...doc, ...safe, version: version + 1 };
      this.data.get(kind)!.set(id, structuredClone(next));
      return structuredClone(next);
    }
    const doc = await this.model(kind)
      .findOneAndUpdate(
        { id, version },
        { $set: safe, $inc: { version: 1 } },
        { new: true, session: this.session },
      )
      .lean();
    if (!doc)
      throw Object.assign(
        new Error("Record changed. Refresh and review before retrying."),
        { status: 409 },
      );
    return doc as unknown as RecordDoc;
  }
  async transaction<T>(fn: (repo: Repository) => Promise<T>): Promise<T> {
    if (this.memory) return fn(this);
    const session = await mongoose.startSession();
    try {
      let result: T;
      await session.withTransaction(async () => {
        result = await fn(new Repository(false, session));
      });
      return result!;
    } finally {
      await session.endSession();
    }
  }
  async removeWhere(kind:string,filter:Record<string,unknown>){
    if(this.memory){let count=0;for(const [id,row] of this.data.get(kind)??[]){if(Object.entries(filter).every(([k,v])=>row[k]===v)){this.data.get(kind)!.delete(id);count++;}}return count;}
    return (await this.model(kind).deleteMany(filter).session(this.session??null)).deletedCount;
  }
}
