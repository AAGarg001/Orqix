import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
export type Status =
  | "starting"
  | "awaiting_otp"
  | "ready"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";
export type Section = { name: string; status: string; records?: number };
export type Job = {
  assignmentId?: string;
  accountId?: string;
  kind?: "extract" | "upload" | "delete";
  id: string;
  userId: string;
  name: string;
  mode: "all" | "available" | "combined";
  status: Status;
  stage: string;
  records: number;
  sections: Section[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  artifact: boolean;
  downloadName?: string;
  error?: string;
  events?: { sequence: number; time: string; message: string; kind?: string }[];
  results?: { row: number; status: string; error?: string;fingerprint?:string }[];
};
export type User = {
  accountKind?: "staff" | "client";
  emailVerified?: boolean;
  rolePermissions?:string[];
  role?: import("./enterprise/permissions.js").Role;
  permissions?: string[];
  active?: boolean;
  username?: string;
  mobile?: string;
  teamId?: string;
  department?: string;
  reportingManagerId?: string;
  designation?: string;
  createdBy?: string;
  id: string;
  email: string;
  name: string;
  passwordHash: string;
};
type Session = { id: string; userId: string; expiresAt: Date; activeTenantId?:string };
const userSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    email: { type: String, unique: true },
    name: String,
    passwordHash: String,
    accountKind: {type:String,default:'staff'},
    emailVerified: Boolean,
    role: { type: String, default: "executive" },
    permissions: [String],
    active: { type: Boolean, default: true },
    username: { type: String, index: { unique: true, sparse: true } },
    mobile: String,
    teamId: String,
    department: String,
    reportingManagerId: String,
    designation: String,
    createdBy: String,
  },
  { versionKey: false },
);
const jobSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    userId: { type: String, index: true },
    assignmentId: String,
    accountId: String,
    kind: String,
    name: String,
    mode: String,
    status: String,
    stage: String,
    records: Number,
    sections: [{ _id: false, name: String, status: String, records: Number }],
    createdAt: String,
    updatedAt: String,
    expiresAt: String,
    artifact: Boolean,
    downloadName: String,
    error: String,
    events: [
      {
        _id: false,
        sequence: Number,
        time: String,
        message: String,
        kind: String,
      },
    ],
    results: [{ _id: false, row: Number, status: String, error: String,fingerprint:String }],
  },
  { versionKey: false },
);
jobSchema.index({ userId: 1, createdAt: -1 });
const sessionSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    userId: String,
    activeTenantId: String,
    expiresAt: { type: Date, index: { expires: 0 } },
  },
  { versionKey: false },
);
const Users = mongoose.model("User", userSchema),
  Jobs = mongoose.model("Job", jobSchema),
  Sessions = mongoose.model("Session", sessionSchema);
export class Store {
  private runRecords: {id:string;jobId:string;userId:string;startedAt:string;status:string;finishedAt?:string}[] = [];
  async extractionHistory(userId:string) {
    return this.memory ? this.runRecords.filter(r=>r.userId===userId).slice().reverse() : mongoose.connection.collection('extractionruns').find({userId},{projection:{_id:0}}).sort({startedAt:-1}).limit(500).toArray();
  }
  async finishOrphanedRuns() {
    if(!this.memory)await mongoose.connection.collection('extractionruns').updateMany({status:'running'},{$set:{status:'failed',finishedAt:new Date().toISOString()}});
  }
  roleResolver?: (role:string)=>Promise<string[]|null>;
  private async decorate(user:User|null):Promise<User|null>{return user&&this.roleResolver?{...user,rolePermissions:(await this.roleResolver(user.role??'executive'))??undefined}:user;}
  private users = new Map<string, User>();
  private jobs = new Map<string, Job>();
  private sessions = new Map<string, Session>();
  constructor(public memory: boolean) {}
  healthy() {
    return this.memory || mongoose.connection.readyState === 1;
  }
  async connect(uri?: string) {
    if (!this.memory) {
      await mongoose.connect(uri!, { serverSelectionTimeoutMS: 10000 });
      await Promise.all([Users.init(), Jobs.init(), Sessions.init()]);
    }
  }
  async createUser(input: Omit<User, "id">) {
    if (await this.userByEmail(input.email))
      throw Object.assign(new Error("This email is already registered."), {
        status: 409,
      });
    const user = { ...input, id: randomUUID() };
    if (this.memory) this.users.set(user.id, user);
    else await Users.create(user);
    return user;
  }
  async userByEmail(email: string): Promise<User | null> {
    return this.decorate(this.memory
      ? ([...this.users.values()].find((u) => u.email === email) ?? null)
      : ((await Users.findOne({ email }).lean()) as User | null));
  }
  async allUsers(): Promise<User[]> {
    const users=this.memory
      ? structuredClone([...this.users.values()])
      : ((await Users.find().lean()) as unknown as User[]);
    return Promise.all(users.map(async u=>(await this.decorate(u))!));
  }
  async updateUser(id: string, patch: Partial<User>) {
    if (this.memory) {
      const u = this.users.get(id);
      if (u) this.users.set(id, { ...u, ...patch, id });
    } else await Users.updateOne({ id }, { $set: patch });
    return this.user(id);
  }
  async user(id: string): Promise<User | null> {
    return this.decorate(this.memory
      ? (this.users.get(id) ?? null)
      : ((await Users.findOne({ id }).lean()) as User | null));
  }
  async session(id: string): Promise<Session | null> {
    return this.memory
      ? (this.sessions.get(id) ?? null)
      : ((await Sessions.findOne({ id }).lean()) as Session | null);
  }
  async saveSession(s: Session) {
    if (this.memory) this.sessions.set(s.id, s);
    else await Sessions.create(s);
  }
  async switchTenant(id:string,tenantId:string){if(this.memory){const s=this.sessions.get(id);if(s)this.sessions.set(id,{...s,activeTenantId:tenantId});}else await Sessions.updateOne({id},{$set:{activeTenantId:tenantId}});}
  async deleteSession(id: string) {
    if (this.memory) this.sessions.delete(id);
    else await Sessions.deleteOne({ id });
  }
  async deleteUserSessions(userId:string){if(this.memory){for(const [id,s] of this.sessions)if(s.userId===userId)this.sessions.delete(id);}else await Sessions.deleteMany({userId});}
  async saveJob(job: Job) {
    const extraction = !job.kind || job.kind === 'extract';
    const previous = this.jobs.get(job.id);
    if(extraction && job.status === 'running' && previous?.status !== 'running') {
      const record={id:randomUUID(),jobId:job.id,userId:job.userId,startedAt:new Date().toISOString(),status:'running'};
      this.runRecords.push(record);
      if(!this.memory) await mongoose.connection.collection('extractionruns').insertOne(record);
    }
    if(extraction && previous?.status==='running' && ['completed','partial','failed','cancelled'].includes(job.status)) {
      const record=this.runRecords.slice().reverse().find(r=>r.jobId===job.id&&r.status==='running');
      if(record){record.status=job.status;record.finishedAt=new Date().toISOString();}
      if(!this.memory)await mongoose.connection.collection('extractionruns').updateOne({jobId:job.id,status:'running'},{$set:{status:job.status,finishedAt:new Date().toISOString()}});
    }
    this.jobs.set(job.id, structuredClone(job));
    if (!this.memory) {
      if(extraction) await Jobs.replaceOne({id:job.id},{id:job.id,userId:job.userId,assignmentId:job.assignmentId,kind:'extract',name:'ExtractBot',createdAt:job.createdAt,updatedAt:job.updatedAt,status:job.status},{upsert:true});
      else await Jobs.updateOne({ id: job.id }, { $set: job }, { upsert: true });
    }
  }
  async job(id: string): Promise<Job | null> {
    if(this.jobs.has(id)) return structuredClone(this.jobs.get(id)!);
    return this.memory
      ? structuredClone(this.jobs.get(id) ?? null)
      : ((await Jobs.findOne({ id }).lean()) as Job | null);
  }
  async list(userId?: string): Promise<Job[]> {
    return this.memory
      ? structuredClone(
          [...this.jobs.values()]
            .filter((j) => !userId || j.userId === userId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        )
      : ((await Jobs.find(userId ? { userId } : {})
          .sort({ createdAt: -1 })
          .limit(500)
          .lean()) as Job[]).map(j=>structuredClone(this.jobs.get(j.id)??{...j,mode:j.mode??'all',records:j.records??0,sections:j.sections??[],artifact:j.artifact??false,stage:j.stage??'Historical run'}));
  }
  async pending(): Promise<Job[]> {
    if(!this.memory) return (await this.list()).filter(j=>active(j.status)||j.artifact);
    return this.memory
      ? structuredClone(
          [...this.jobs.values()].filter((j) => active(j.status) || j.artifact),
        )
      : ((await Jobs.find({
          $or: [
            {
              status: { $in: ["starting", "awaiting_otp", "ready", "running"] },
            },
            { artifact: true },
          ],
        }).lean()) as Job[]);
  }
}
export const active = (status: Status) =>
  ["starting", "awaiting_otp", "ready", "running"].includes(status);
